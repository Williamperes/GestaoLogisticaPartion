import { beforeEach, describe, expect, it, vi } from "vitest";

import { chain, fakeSupabase } from "./helpers/supabaseMock";

const mocks = vi.hoisted(() => ({ createSupabaseAdminClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

import {
  listClientOrganizations,
  slugifyOrganizationName,
  resolveUniqueOrganizationSlug,
} from "@/lib/clients";

const FULL_ROW = {
  id: "c-1",
  name: "Empresa X",
  slug: "empresa-x",
  contact_name: "Ana",
  contact_email: "ana@x.com",
  contact_phone: "1199",
  address: "Rua 1",
  city: "SP",
  is_active: true,
  created_at: "2026-01-01",
};

describe("slugifyOrganizationName", () => {
  it("remove acentos, espaços e símbolos", () => {
    expect(slugifyOrganizationName("Eventos & Cia Ltda")).toBe("eventos-cia-ltda");
    expect(slugifyOrganizationName("São João Produções")).toBe("sao-joao-producoes");
  });

  it("trunca em 48 caracteres", () => {
    expect(slugifyOrganizationName("a".repeat(60))).toHaveLength(48);
  });
});

describe("listClientOrganizations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mapeia colunas completas para camelCase", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ organizations: [() => chain({ data: [FULL_ROW], error: null })] })
    );
    const [c] = await listClientOrganizations();
    expect(c).toMatchObject({
      id: "c-1",
      contactName: "Ana",
      contactEmail: "ana@x.com",
      city: "SP",
      isActive: true,
    });
  });

  it("aplica busca via .or quando há termo", async () => {
    const q = chain({ data: [], error: null });
    mocks.createSupabaseAdminClient.mockReturnValue(fakeSupabase({ organizations: [() => q] }));
    await listClientOrganizations("  acme ");
    expect(q._calls.find((c) => c.method === "or")?.args[0]).toContain("acme");
  });

  it("cai no fallback quando colunas de contato não existem (42703)", async () => {
    const main = chain({ data: null, error: { code: "42703" } });
    const fallback = chain({
      data: [{ id: "c-1", name: "Empresa X", slug: "empresa-x", is_active: true, created_at: "2026-01-01" }],
      error: null,
    });
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ organizations: [() => main, () => fallback] })
    );

    const [c] = await listClientOrganizations("acme");
    // Fallback usa .ilike e zera campos de contato.
    expect(fallback._calls.some((x) => x.method === "ilike")).toBe(true);
    expect(c).toMatchObject({ id: "c-1", contactName: null, address: null, city: null });
  });

  it("propaga erro diferente de 42703", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ organizations: [() => chain({ data: null, error: { code: "500", message: "boom" } })] })
    );
    await expect(listClientOrganizations()).rejects.toMatchObject({ message: "boom" });
  });
});

describe("resolveUniqueOrganizationSlug", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna o slug base quando não há colisão", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ organizations: [() => chain({ data: null, error: null })] })
    );
    expect(await resolveUniqueOrganizationSlug("Empresa Nova")).toBe("empresa-nova");
  });

  it("incrementa o sufixo até achar um livre", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        organizations: [
          () => chain({ data: { id: "x" }, error: null }), // base ocupado
          () => chain({ data: { id: "y" }, error: null }), // -2 ocupado
          () => chain({ data: null, error: null }), // -3 livre
        ],
      })
    );
    expect(await resolveUniqueOrganizationSlug("Empresa Nova")).toBe("empresa-nova-3");
  });

  it("aplica neq quando há excludeId", async () => {
    const q = chain({ data: null, error: null });
    mocks.createSupabaseAdminClient.mockReturnValue(fakeSupabase({ organizations: [() => q] }));
    await resolveUniqueOrganizationSlug("Empresa", { excludeId: "self-1" });
    expect(q._calls.find((c) => c.method === "neq")?.args).toEqual(["id", "self-1"]);
  });
});

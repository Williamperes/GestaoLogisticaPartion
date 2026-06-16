import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  revalidatePath: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getCurrentUserContext: vi.fn(),
  resolveUniqueOrganizationSlug: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserContext: mocks.getCurrentUserContext,
}));

vi.mock("@/lib/clients", () => ({
  resolveUniqueOrganizationSlug: mocks.resolveUniqueOrganizationSlug,
}));

import { createClient, deleteClient, updateClient } from "@/app/(dashboard)/clients/actions";

function buildFormData(values: Record<string, string>) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return formData;
}

describe("client actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unauthorized users away from client mutations", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(null);

    await expect(createClient(buildFormData({ name: "Acme" }))).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard?error=unauthorized"
    );

    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("creates a client with the resolved slug and redirects with success", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });

    mocks.getCurrentUserContext.mockResolvedValue({ role: "admin" });
    mocks.resolveUniqueOrganizationSlug.mockResolvedValue("acme");
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        insert,
      }),
    });

    await expect(
      createClient(
        buildFormData({
          name: "Acme",
          contactName: "Maria",
          contactEmail: "maria@acme.com",
          contactPhone: "11999999999",
          address: "Rua A",
          city: "Sao Paulo",
        })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/clients?success=Cliente cadastrado.");

    expect(mocks.resolveUniqueOrganizationSlug).toHaveBeenCalledWith("Acme");
    expect(insert).toHaveBeenCalledWith({
      name: "Acme",
      slug: "acme",
      type: "client",
      contact_name: "Maria",
      contact_email: "maria@acme.com",
      contact_phone: "11999999999",
      address: "Rua A",
      city: "Sao Paulo",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/clients");
  });

  it("updates a client and filters by id and type", async () => {
    const eqType = vi.fn().mockResolvedValue({ error: null });
    const eqId = vi.fn().mockReturnValue({ eq: eqType });
    const update = vi.fn().mockReturnValue({ eq: eqId });

    mocks.getCurrentUserContext.mockResolvedValue({ role: "operations" });
    mocks.resolveUniqueOrganizationSlug.mockResolvedValue("novo-cliente");
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        update,
      }),
    });

    await expect(
      updateClient(
        buildFormData({
          id: "client-1",
          name: "Novo Cliente",
          contactName: "Ana",
          contactEmail: "ana@cliente.com",
          contactPhone: "11888888888",
          address: "Rua B",
          city: "Campinas",
        })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/clients?success=Cliente atualizado.");

    expect(update).toHaveBeenCalledWith({
      name: "Novo Cliente",
      slug: "novo-cliente",
      contact_name: "Ana",
      contact_email: "ana@cliente.com",
      contact_phone: "11888888888",
      address: "Rua B",
      city: "Campinas",
    });
    expect(eqId).toHaveBeenCalledWith("id", "client-1");
    expect(eqType).toHaveBeenCalledWith("type", "client");
  });

  it("rejects delete when the client id is missing", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({ role: "admin" });

    await expect(deleteClient(buildFormData({ id: "" }))).rejects.toThrow(
      "NEXT_REDIRECT:/clients?error=Cliente inválido."
    );
  });

  // ── createClient: validation, fallback, error ──────────────────────

  it("rejects createClient when name is empty", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({ role: "admin" });

    await expect(createClient(buildFormData({ name: "   " }))).rejects.toThrow(
      "NEXT_REDIRECT:/clients?error=Informe o nome do cliente."
    );
  });

  it("falls back to minimal insert when columns are missing (42703)", async () => {
    const insert = vi
      .fn()
      .mockResolvedValueOnce({ error: { code: "42703", message: "no column" } })
      .mockResolvedValueOnce({ error: null });

    mocks.getCurrentUserContext.mockResolvedValue({ role: "admin" });
    mocks.resolveUniqueOrganizationSlug.mockResolvedValue("acme");
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ insert }),
    });

    await expect(
      createClient(buildFormData({ name: "Acme", contactName: "Maria" }))
    ).rejects.toThrow("NEXT_REDIRECT:/clients?success=Cliente cadastrado.");

    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert).toHaveBeenLastCalledWith({
      name: "Acme",
      slug: "acme",
      type: "client",
    });
  });

  it("redirects when 42703 fallback insert also fails", async () => {
    const insert = vi
      .fn()
      .mockResolvedValueOnce({ error: { code: "42703", message: "no column" } })
      .mockResolvedValueOnce({ error: { message: "fallback boom" } });

    mocks.getCurrentUserContext.mockResolvedValue({ role: "admin" });
    mocks.resolveUniqueOrganizationSlug.mockResolvedValue("acme");
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ insert }),
    });

    await expect(createClient(buildFormData({ name: "Acme" }))).rejects.toThrow(
      "NEXT_REDIRECT:/clients?error=fallback%20boom"
    );
  });

  it("redirects when createClient insert fails with a generic error", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: "db down" } });

    mocks.getCurrentUserContext.mockResolvedValue({ role: "admin" });
    mocks.resolveUniqueOrganizationSlug.mockResolvedValue("acme");
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ insert }),
    });

    await expect(createClient(buildFormData({ name: "Acme" }))).rejects.toThrow(
      "NEXT_REDIRECT:/clients?error=db%20down"
    );
  });

  // ── updateClient: auth, validation, fallback, error ────────────────

  it("redirects unauthorized users away from updateClient", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({ role: "warehouse" });

    await expect(
      updateClient(buildFormData({ id: "c-1", name: "X" }))
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard?error=unauthorized");

    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("rejects updateClient when id or name is missing", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({ role: "admin" });

    await expect(
      updateClient(buildFormData({ id: "", name: "X" }))
    ).rejects.toThrow(
      "NEXT_REDIRECT:/clients?error=Dados inválidos para atualizar cliente."
    );
  });

  it("falls back to minimal update when columns are missing (42703)", async () => {
    const eqTypeFull = vi
      .fn()
      .mockResolvedValue({ error: { code: "42703", message: "no column" } });
    const eqIdFull = vi.fn().mockReturnValue({ eq: eqTypeFull });

    const eqTypeMin = vi.fn().mockResolvedValue({ error: null });
    const eqIdMin = vi.fn().mockReturnValue({ eq: eqTypeMin });

    const update = vi
      .fn()
      .mockReturnValueOnce({ eq: eqIdFull })
      .mockReturnValueOnce({ eq: eqIdMin });

    mocks.getCurrentUserContext.mockResolvedValue({ role: "admin" });
    mocks.resolveUniqueOrganizationSlug.mockResolvedValue("novo");
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ update }),
    });

    await expect(
      updateClient(buildFormData({ id: "c-1", name: "Novo" }))
    ).rejects.toThrow("NEXT_REDIRECT:/clients?success=Cliente atualizado.");

    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenLastCalledWith({ name: "Novo", slug: "novo" });
  });

  it("redirects when 42703 fallback update also fails", async () => {
    const eqTypeFull = vi
      .fn()
      .mockResolvedValue({ error: { code: "42703", message: "no column" } });
    const eqIdFull = vi.fn().mockReturnValue({ eq: eqTypeFull });

    const eqTypeMin = vi
      .fn()
      .mockResolvedValue({ error: { message: "fallback boom" } });
    const eqIdMin = vi.fn().mockReturnValue({ eq: eqTypeMin });

    const update = vi
      .fn()
      .mockReturnValueOnce({ eq: eqIdFull })
      .mockReturnValueOnce({ eq: eqIdMin });

    mocks.getCurrentUserContext.mockResolvedValue({ role: "admin" });
    mocks.resolveUniqueOrganizationSlug.mockResolvedValue("novo");
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ update }),
    });

    await expect(
      updateClient(buildFormData({ id: "c-1", name: "Novo" }))
    ).rejects.toThrow("NEXT_REDIRECT:/clients?error=fallback%20boom");
  });

  it("redirects when updateClient fails with a generic error", async () => {
    const eqType = vi.fn().mockResolvedValue({ error: { message: "db down" } });
    const eqId = vi.fn().mockReturnValue({ eq: eqType });
    const update = vi.fn().mockReturnValue({ eq: eqId });

    mocks.getCurrentUserContext.mockResolvedValue({ role: "admin" });
    mocks.resolveUniqueOrganizationSlug.mockResolvedValue("novo");
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ update }),
    });

    await expect(
      updateClient(buildFormData({ id: "c-1", name: "Novo" }))
    ).rejects.toThrow("NEXT_REDIRECT:/clients?error=db%20down");
  });

  // ── deleteClient: auth, success, error ─────────────────────────────

  it("redirects unauthorized users away from deleteClient", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(null);

    await expect(
      deleteClient(buildFormData({ id: "c-1" }))
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard?error=unauthorized");

    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("deletes a client filtering by id and type, then redirects with success", async () => {
    const eqType = vi.fn().mockResolvedValue({ error: null });
    const eqId = vi.fn().mockReturnValue({ eq: eqType });
    const del = vi.fn().mockReturnValue({ eq: eqId });

    mocks.getCurrentUserContext.mockResolvedValue({ role: "admin" });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ delete: del }),
    });

    await expect(
      deleteClient(buildFormData({ id: "c-1" }))
    ).rejects.toThrow("NEXT_REDIRECT:/clients?success=Cliente apagado.");

    expect(eqId).toHaveBeenCalledWith("id", "c-1");
    expect(eqType).toHaveBeenCalledWith("type", "client");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/clients");
  });

  it("redirects when deleteClient fails with a DB error", async () => {
    const eqType = vi.fn().mockResolvedValue({ error: { message: "fk violation" } });
    const eqId = vi.fn().mockReturnValue({ eq: eqType });
    const del = vi.fn().mockReturnValue({ eq: eqId });

    mocks.getCurrentUserContext.mockResolvedValue({ role: "admin" });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ delete: del }),
    });

    await expect(
      deleteClient(buildFormData({ id: "c-1" }))
    ).rejects.toThrow("NEXT_REDIRECT:/clients?error=fk%20violation");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import { chain, fakeSupabase } from "./helpers/supabaseMock";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

import {
  getCurrentAuthUser,
  getCurrentUserContext,
  getDefaultAppPathForUser,
} from "@/lib/auth/session";

/**
 * `react`'s `cache` deduplica por argumentos dentro de um mesmo render.
 * Fora de um request, cada chamada executa de novo, então não interfere
 * nos testes — mas limpamos os mocks a cada caso.
 */
beforeEach(() => {
  vi.clearAllMocks();
});

function serverClientWith(getUserResult: unknown, supabase?: unknown) {
  const base = supabase ?? {};
  mocks.createSupabaseServerClient.mockResolvedValue({
    auth: { getUser: vi.fn(async () => getUserResult) },
    ...(base as Record<string, unknown>),
  });
}

describe("getCurrentAuthUser", () => {
  it("retorna o usuário quando não há erro", async () => {
    serverClientWith({ data: { user: { id: "u-1", email: "a@b.com" } }, error: null });
    const user = await getCurrentAuthUser();
    expect(user).toEqual({ id: "u-1", email: "a@b.com" });
  });

  it("retorna null em AuthSessionMissingError", async () => {
    const error = Object.assign(new Error("missing"), { name: "AuthSessionMissingError" });
    serverClientWith({ data: { user: null }, error });
    expect(await getCurrentAuthUser()).toBeNull();
  });

  it("retorna null quando o erro menciona refresh token", async () => {
    const error = Object.assign(new Error("Invalid Refresh Token"), { name: "AuthApiError" });
    serverClientWith({ data: { user: null }, error });
    expect(await getCurrentAuthUser()).toBeNull();
  });

  it("relança outros erros", async () => {
    const error = Object.assign(new Error("boom"), { name: "AuthApiError" });
    serverClientWith({ data: { user: null }, error });
    await expect(getCurrentAuthUser()).rejects.toThrow("boom");
  });

  it("relança erro sem message (cobre optional chaining)", async () => {
    const error = { name: "WeirdError" } as unknown as Error;
    serverClientWith({ data: { user: null }, error });
    await expect(getCurrentAuthUser()).rejects.toBe(error);
  });
});

describe("getCurrentUserContext", () => {
  it("retorna null quando não há usuário autenticado", async () => {
    serverClientWith({ data: { user: null }, error: null });
    expect(await getCurrentUserContext()).toBeNull();
  });

  it("mapeia profile, memberships e organizations com primário explícito", async () => {
    const fake = fakeSupabase({
      profiles: [
        () =>
          chain({
            data: {
              id: "u-1",
              full_name: "Maria",
              email: "maria@x.com",
              phone: "123",
              avatar_url: "http://img",
              is_active: true,
            },
          }),
      ],
      organization_members: [
        () =>
          chain({
            data: [
              { id: "m-1", organization_id: "org-1", role: "operations", is_primary: false },
              { id: "m-2", organization_id: "org-2", role: "admin", is_primary: true },
            ],
          }),
      ],
      organizations: [
        () =>
          chain({
            data: [
              { id: "org-1", name: "Org One", slug: "one", type: "internal", is_active: true },
              { id: "org-2", name: "Org Two", slug: null, type: "client", is_active: false },
            ],
          }),
      ],
    });
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "u-1", email: "maria@x.com" } }, error: null })) },
      from: fake.from,
    });

    const ctx = await getCurrentUserContext();
    expect(ctx).toMatchObject({
      userId: "u-1",
      email: "maria@x.com",
      profile: {
        id: "u-1",
        fullName: "Maria",
        email: "maria@x.com",
        phone: "123",
        avatarUrl: "http://img",
        isActive: true,
      },
      primaryMembership: { id: "m-2", organizationId: "org-2", role: "admin", isPrimary: true },
      primaryOrganization: { id: "org-2", name: "Org Two", slug: null, type: "client", isActive: false },
      role: "admin",
    });
    expect(ctx?.memberships).toHaveLength(2);
    expect(ctx?.organizations).toHaveLength(2);
  });

  it("usa o primeiro membership quando nenhum é primário e lida com profile/listas nulas", async () => {
    const fake = fakeSupabase({
      profiles: [() => chain({ data: null })],
      organization_members: [
        () => chain({ data: [{ id: "m-1", organization_id: "org-1", role: "warehouse", is_primary: false }] }),
      ],
      organizations: [() => chain({ data: null })],
    });
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "u-9", email: null } }, error: null })) },
      from: fake.from,
    });

    const ctx = await getCurrentUserContext();
    expect(ctx?.email).toBeNull();
    expect(ctx?.profile).toBeNull();
    expect(ctx?.organizations).toEqual([]);
    expect(ctx?.primaryMembership).toMatchObject({ id: "m-1", role: "warehouse" });
    expect(ctx?.primaryOrganization).toBeNull();
    expect(ctx?.role).toBe("warehouse");
  });

  it("retorna listas vazias e role null quando memberships é null", async () => {
    const fake = fakeSupabase({
      profiles: [() => chain({ data: null })],
      organization_members: [() => chain({ data: null })],
      organizations: [() => chain({ data: [] })],
    });
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "u-3", email: "e@e.com" } }, error: null })) },
      from: fake.from,
    });

    const ctx = await getCurrentUserContext();
    expect(ctx?.memberships).toEqual([]);
    expect(ctx?.primaryMembership).toBeNull();
    expect(ctx?.role).toBeNull();
  });
});

describe("getDefaultAppPathForUser", () => {
  it("retorna /client para role client", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ organization_members: [() => chain({ data: { role: "client", is_primary: true }, error: null })] })
    );
    expect(await getDefaultAppPathForUser("u-1")).toBe("/client");
  });

  it("retorna /scan para role warehouse", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ organization_members: [() => chain({ data: { role: "warehouse", is_primary: true }, error: null })] })
    );
    expect(await getDefaultAppPathForUser("u-1")).toBe("/scan");
  });

  it("retorna /dashboard por padrão (outro role)", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ organization_members: [() => chain({ data: { role: "admin", is_primary: true }, error: null })] })
    );
    expect(await getDefaultAppPathForUser("u-1")).toBe("/dashboard");
  });

  it("retorna /dashboard quando não há registro", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ organization_members: [() => chain({ data: null, error: null })] })
    );
    expect(await getDefaultAppPathForUser("u-1")).toBe("/dashboard");
  });

  it("propaga erro do banco", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ organization_members: [() => chain({ data: null, error: new Error("db fail") })] })
    );
    await expect(getDefaultAppPathForUser("u-1")).rejects.toThrow("db fail");
  });
});

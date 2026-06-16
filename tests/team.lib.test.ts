import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

import {
  listTeamSpecialties,
  ensureTeamSpecialty,
  listTeamMembers,
  getTeamMemberByUserId,
  teamMemberHasEventAccess,
} from "@/lib/team";

/** Thenable proxy that resolves to `value` and records every method call. */
function chain(value: unknown) {
  const calls: { method: string; args: unknown[] }[] = [];
  const obj: Record<string, unknown> = {};
  const proxy: unknown = new Proxy(obj, {
    get(_t, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => unknown) => resolve(value);
      }
      if (prop === "_calls") return calls;
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args });
        return proxy;
      };
    },
  });
  return proxy as Record<string, (...args: unknown[]) => unknown> & {
    _calls: { method: string; args: unknown[] }[];
  };
}

/** Routes `from(table)` calls by table name and call order within the table. */
function fakeSupabase(routes: Record<string, Array<() => unknown>>) {
  const calls: Record<string, number> = {};
  return {
    from: vi.fn((table: string) => {
      const idx = calls[table] ?? 0;
      calls[table] = idx + 1;
      const builders = routes[table];
      if (!builders) throw new Error(`Unexpected table: ${table}`);
      const builder = builders[idx] ?? builders[builders.length - 1];
      return builder();
    }),
    _calls: () => calls,
  };
}

const SPECIALTY_ROW = {
  id: "sp-1",
  organization_id: "org-1",
  name: "Áudio",
  slug: "audio",
  is_active: true,
  created_at: "2026-01-01",
};

describe("listTeamSpecialties", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mapeia snake_case → camelCase", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ team_specialties: [() => chain({ data: [SPECIALTY_ROW], error: null })] })
    );
    const result = await listTeamSpecialties("org-1");
    expect(result).toEqual([
      {
        id: "sp-1",
        organizationId: "org-1",
        name: "Áudio",
        slug: "audio",
        isActive: true,
        createdAt: "2026-01-01",
      },
    ]);
  });

  it("retorna [] quando data é null", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ team_specialties: [() => chain({ data: null, error: null })] })
    );
    expect(await listTeamSpecialties("org-1")).toEqual([]);
  });

  it("propaga erro do banco", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ team_specialties: [() => chain({ data: null, error: new Error("db") })] })
    );
    await expect(listTeamSpecialties("org-1")).rejects.toThrow("db");
  });
});

describe("ensureTeamSpecialty", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejeita nome em branco", async () => {
    await expect(ensureTeamSpecialty("org-1", "   ")).rejects.toThrow("Especialidade inválida.");
  });

  it("rejeita nome que vira slug vazio (só símbolos)", async () => {
    await expect(ensureTeamSpecialty("org-1", "!!!")).rejects.toThrow("Especialidade inválida.");
  });

  it("retorna a especialidade existente sem fazer upsert", async () => {
    const select = chain({ data: SPECIALTY_ROW, error: null });
    const supa = fakeSupabase({ team_specialties: [() => select] });
    mocks.createSupabaseAdminClient.mockReturnValue(supa);

    const result = await ensureTeamSpecialty("org-1", "Áudio");
    expect(result.id).toBe("sp-1");
    // Não deve chamar uma segunda vez (upsert).
    expect(supa._calls().team_specialties).toBe(1);
  });

  it("faz upsert com slug normalizado (acentos/maiúsculas) quando não existe", async () => {
    const select = chain({ data: null, error: null });
    const upsert = chain({ data: { ...SPECIALTY_ROW, id: "sp-novo" }, error: null });
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ team_specialties: [() => select, () => upsert] })
    );

    const result = await ensureTeamSpecialty("org-1", "Operação de LED");
    expect(result.id).toBe("sp-novo");
    const upsertArg = upsert._calls.find((c) => c.method === "upsert")?.args[0] as {
      slug: string;
      name: string;
    };
    expect(upsertArg.slug).toBe("operacao-de-led");
    expect(upsertArg.name).toBe("Operação de LED");
  });
});

describe("listTeamMembers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("achata o join team_specialties em specialtyName/Slug", async () => {
    const row = {
      id: "m-1",
      organization_id: "org-1",
      name: "João",
      specialty_id: "sp-1",
      role: "tecnico",
      phone: "11999",
      email: "j@x.com",
      city: "SP",
      available: true,
      notes: null,
      created_at: "2026-01-01",
      user_id: null,
      team_specialties: { id: "sp-1", name: "Áudio", slug: "audio" },
    };
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ team_members: [() => chain({ data: [row], error: null })] })
    );

    const result = await listTeamMembers("org-1");
    expect(result[0]).toMatchObject({
      id: "m-1",
      specialtyName: "Áudio",
      specialtySlug: "audio",
      userId: null,
    });
  });
});

describe("getTeamMemberByUserId", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna o membro quando encontrado", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ team_members: [() => chain({ data: { id: "m-1" }, error: null })] })
    );
    expect(await getTeamMemberByUserId("u-1", "org-1")).toEqual({ id: "m-1" });
  });

  it("retorna null quando não há membro", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ team_members: [() => chain({ data: null, error: null })] })
    );
    expect(await getTeamMemberByUserId("u-1", "org-1")).toBeNull();
  });
});

describe("teamMemberHasEventAccess", () => {
  beforeEach(() => vi.clearAllMocks());

  it("true quando há ao menos uma escala", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        event_date_team_members: [() => chain({ data: [{ event_dates: { event_id: "ev-1" } }], error: null })],
      })
    );
    expect(await teamMemberHasEventAccess("m-1", "ev-1")).toBe(true);
  });

  it("false quando não há escala", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ event_date_team_members: [() => chain({ data: [], error: null })] })
    );
    expect(await teamMemberHasEventAccess("m-1", "ev-1")).toBe(false);
  });

  it("propaga erro do banco", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ event_date_team_members: [() => chain({ data: null, error: new Error("db") })] })
    );
    await expect(teamMemberHasEventAccess("m-1", "ev-1")).rejects.toThrow("db");
  });
});

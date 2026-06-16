import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  revalidatePath: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getCurrentUserContext: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUserContext: mocks.getCurrentUserContext,
}));

import {
  returnCheckinItem,
  finalizeCheckin,
} from "@/app/(dashboard)/checkin/actions";

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

function buildFormData(values: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

const WRITE_CONTEXT = { role: "operations", userId: "user-1" };

describe("checkin actions", () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Autorização ──────────────────────────────────────────────────

  it("bloqueia usuário sem papel de escrita", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({ role: "client" });
    await expect(
      returnCheckinItem(buildFormData({ unitId: "u-1", eventId: "ev-1" }))
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard?error=unauthorized");
  });

  it("bloqueia usuário não autenticado", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(null);
    await expect(finalizeCheckin(buildFormData({ eventId: "ev-1" }))).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard?error=unauthorized"
    );
  });

  // ── returnCheckinItem ────────────────────────────────────────────

  describe("returnCheckinItem", () => {
    it("rejeita quando faltam dados obrigatórios", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(WRITE_CONTEXT);
      await expect(
        returnCheckinItem(buildFormData({ eventId: "ev-1" }))
      ).rejects.toThrow("NEXT_REDIRECT:/checkin?eventId=ev-1&error=Dados inválidos.");
    });

    it("devolve unidade íntegra como disponível", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(WRITE_CONTEXT);
      const updateUnit = chain({ error: null });
      mocks.createSupabaseAdminClient.mockReturnValue(
        fakeSupabase({ equipment_units: [() => updateUnit] })
      );

      await returnCheckinItem(
        buildFormData({ unitId: "u-1", eventId: "ev-1" })
      );

      expect(updateUnit._calls.find((c) => c.method === "update")?.args[0]).toEqual({
        status: "available",
      });
      expect(updateUnit._calls.find((c) => c.method === "eq")?.args).toEqual(["id", "u-1"]);
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/checkin");
    });

    it("marca unidade danificada como manutenção", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(WRITE_CONTEXT);
      const updateUnit = chain({ error: null });
      mocks.createSupabaseAdminClient.mockReturnValue(
        fakeSupabase({ equipment_units: [() => updateUnit] })
      );

      await returnCheckinItem(
        buildFormData({ unitId: "u-1", eventId: "ev-1", damaged: "true" })
      );

      expect(updateUnit._calls.find((c) => c.method === "update")?.args[0]).toEqual({
        status: "maintenance",
      });
    });

    it("propaga erro do banco no redirect", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(WRITE_CONTEXT);
      mocks.createSupabaseAdminClient.mockReturnValue(
        fakeSupabase({ equipment_units: [() => chain({ error: { message: "boom" } })] })
      );
      await expect(
        returnCheckinItem(buildFormData({ unitId: "u-1", eventId: "ev-1" }))
      ).rejects.toThrow("NEXT_REDIRECT:/checkin?eventId=ev-1&error=boom");
    });
  });

  // ── finalizeCheckin ──────────────────────────────────────────────

  describe("finalizeCheckin", () => {
    it("redireciona para /events sem eventId", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(WRITE_CONTEXT);
      await expect(finalizeCheckin(buildFormData({}))).rejects.toThrow(
        "NEXT_REDIRECT:/events"
      );
    });

    it("conclui o evento e redireciona com sucesso", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(WRITE_CONTEXT);
      const updateEvent = chain({ error: null });
      mocks.createSupabaseAdminClient.mockReturnValue(
        fakeSupabase({ events: [() => updateEvent] })
      );

      await expect(finalizeCheckin(buildFormData({ eventId: "ev-1" }))).rejects.toThrow(
        /NEXT_REDIRECT:\/events\/ev-1\?success=/
      );
      expect(updateEvent._calls.find((c) => c.method === "update")?.args[0]).toEqual({
        status: "completed",
      });
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/events/ev-1");
    });

    it("propaga erro do banco no redirect", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(WRITE_CONTEXT);
      mocks.createSupabaseAdminClient.mockReturnValue(
        fakeSupabase({ events: [() => chain({ error: { message: "boom" } })] })
      );
      await expect(finalizeCheckin(buildFormData({ eventId: "ev-1" }))).rejects.toThrow(
        "NEXT_REDIRECT:/checkin?eventId=ev-1&error=boom"
      );
    });
  });
});

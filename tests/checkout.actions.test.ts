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
  confirmCheckoutItem,
  finalizeCheckout,
} from "@/app/(dashboard)/checkout/actions";

/**
 * Thenable proxy that resolves to `value` and records every method call,
 * supporting both `await chain` and terminal `.maybeSingle()`/`.single()`.
 */
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

function buildFormData(values: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

const WRITE_CONTEXT = { role: "warehouse", userId: "user-1" };

describe("checkout actions", () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Autorização ──────────────────────────────────────────────────

  it("bloqueia usuário sem papel de escrita", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({ role: "client" });
    await expect(
      confirmCheckoutItem(
        buildFormData({ eventEquipmentId: "ee-1", eventId: "ev-1" })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard?error=unauthorized");
  });

  it("bloqueia usuário não autenticado", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(null);
    await expect(finalizeCheckout(buildFormData({ eventId: "ev-1" }))).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard?error=unauthorized"
    );
  });

  // ── confirmCheckoutItem ──────────────────────────────────────────

  describe("confirmCheckoutItem", () => {
    it("rejeita quando faltam dados obrigatórios", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(WRITE_CONTEXT);
      await expect(
        confirmCheckoutItem(buildFormData({ eventId: "ev-1" }))
      ).rejects.toThrow("NEXT_REDIRECT:/checkout?eventId=ev-1&error=Dados inválidos.");
    });

    it("rejeita quando o item não é encontrado", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(WRITE_CONTEXT);
      mocks.createSupabaseAdminClient.mockReturnValue(
        fakeSupabase({
          event_equipment: [() => chain({ data: null, error: null })],
        })
      );
      await expect(
        confirmCheckoutItem(
          buildFormData({ eventEquipmentId: "ee-1", eventId: "ev-1" })
        )
      ).rejects.toThrow("NEXT_REDIRECT:/checkout?eventId=ev-1&error=Item não encontrado.");
    });

    it("marca como carregado, separa o item e coloca a unidade em campo", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(WRITE_CONTEXT);
      const updateEvent = chain({ error: null });
      const updateUnit = chain({ error: null });
      mocks.createSupabaseAdminClient.mockReturnValue(
        fakeSupabase({
          event_equipment: [
            () => chain({ data: { unit_id: "u-1", separated: false }, error: null }),
            () => updateEvent,
          ],
          equipment_units: [() => updateUnit],
        })
      );

      await confirmCheckoutItem(
        buildFormData({
          eventEquipmentId: "ee-1",
          eventId: "ev-1",
          confirmed: "true",
        })
      );

      const updateCall = updateEvent._calls.find((c) => c.method === "update");
      expect(updateCall?.args[0]).toMatchObject({
        loaded: true,
        loaded_by: "user-1",
        separated: true,
        separated_by: "user-1",
      });
      expect(updateUnit._calls.find((c) => c.method === "update")?.args[0]).toEqual({
        status: "in_field",
      });
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/checkout");
    });

    it("ao desfazer carga, devolve a unidade para disponível", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(WRITE_CONTEXT);
      const updateEvent = chain({ error: null });
      const updateUnit = chain({ error: null });
      mocks.createSupabaseAdminClient.mockReturnValue(
        fakeSupabase({
          event_equipment: [
            () => chain({ data: { unit_id: "u-1", separated: true }, error: null }),
            () => updateEvent,
          ],
          equipment_units: [() => updateUnit],
        })
      );

      await confirmCheckoutItem(
        buildFormData({
          eventEquipmentId: "ee-1",
          eventId: "ev-1",
          confirmed: "false",
        })
      );

      expect(updateEvent._calls.find((c) => c.method === "update")?.args[0]).toMatchObject({
        loaded: false,
        loaded_at: null,
        loaded_by: null,
      });
      expect(updateUnit._calls.find((c) => c.method === "update")?.args[0]).toEqual({
        status: "available",
      });
    });

    it("propaga erro do banco ao atualizar o item", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(WRITE_CONTEXT);
      mocks.createSupabaseAdminClient.mockReturnValue(
        fakeSupabase({
          event_equipment: [
            () => chain({ data: { unit_id: "u-1", separated: false }, error: null }),
            () => chain({ error: { message: "db down" } }),
          ],
        })
      );

      await expect(
        confirmCheckoutItem(
          buildFormData({
            eventEquipmentId: "ee-1",
            eventId: "ev-1",
            confirmed: "true",
          })
        )
      ).rejects.toThrow("NEXT_REDIRECT:/checkout?eventId=ev-1&error=db%20down");
    });

    it("não re-separa quando o item já estava separado", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(WRITE_CONTEXT);
      const updateEvent = chain({ error: null });
      const updateUnit = chain({ error: null });
      mocks.createSupabaseAdminClient.mockReturnValue(
        fakeSupabase({
          event_equipment: [
            () => chain({ data: { unit_id: "u-1", separated: true }, error: null }),
            () => updateEvent,
          ],
          equipment_units: [() => updateUnit],
        })
      );

      await confirmCheckoutItem(
        buildFormData({
          eventEquipmentId: "ee-1",
          eventId: "ev-1",
          confirmed: "true",
        })
      );

      // separated já era true → não inclui separated/separated_by no update.
      const args = updateEvent._calls.find((c) => c.method === "update")?.args[0] as Record<
        string,
        unknown
      >;
      expect(args.loaded).toBe(true);
      expect(args).not.toHaveProperty("separated");
    });

    it("usa null em loaded_by quando o contexto não tem userId", async () => {
      mocks.getCurrentUserContext.mockResolvedValue({ role: "warehouse" });
      const updateEvent = chain({ error: null });
      mocks.createSupabaseAdminClient.mockReturnValue(
        fakeSupabase({
          event_equipment: [
            () => chain({ data: { unit_id: null, separated: false }, error: null }),
            () => updateEvent,
          ],
        })
      );

      await confirmCheckoutItem(
        buildFormData({
          eventEquipmentId: "ee-1",
          eventId: "ev-1",
          confirmed: "true",
        })
      );

      expect(updateEvent._calls.find((c) => c.method === "update")?.args[0]).toMatchObject({
        loaded: true,
        loaded_by: null,
        separated_by: null,
      });
    });

    it("não toca na unidade quando o item não tem unit_id", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(WRITE_CONTEXT);
      const updateEvent = chain({ error: null });
      const supa = fakeSupabase({
        event_equipment: [
          () => chain({ data: { unit_id: null, separated: false }, error: null }),
          () => updateEvent,
        ],
      });
      mocks.createSupabaseAdminClient.mockReturnValue(supa);

      await confirmCheckoutItem(
        buildFormData({
          eventEquipmentId: "ee-1",
          eventId: "ev-1",
          confirmed: "true",
        })
      );

      expect(supa._calls().equipment_units ?? 0).toBe(0);
    });
  });

  // ── finalizeCheckout ─────────────────────────────────────────────

  describe("finalizeCheckout", () => {
    it("redireciona para /events sem eventId", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(WRITE_CONTEXT);
      await expect(finalizeCheckout(buildFormData({}))).rejects.toThrow(
        "NEXT_REDIRECT:/events"
      );
    });

    it("coloca evento em campo e redireciona com sucesso", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(WRITE_CONTEXT);
      const updateEvent = chain({ error: null });
      mocks.createSupabaseAdminClient.mockReturnValue(
        fakeSupabase({ events: [() => updateEvent] })
      );

      await expect(finalizeCheckout(buildFormData({ eventId: "ev-1" }))).rejects.toThrow(
        /NEXT_REDIRECT:\/events\/ev-1\?success=/
      );
      expect(updateEvent._calls.find((c) => c.method === "update")?.args[0]).toEqual({
        status: "in_field",
      });
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/events/ev-1");
    });

    it("propaga erro do banco no redirect", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(WRITE_CONTEXT);
      mocks.createSupabaseAdminClient.mockReturnValue(
        fakeSupabase({ events: [() => chain({ error: { message: "boom" } })] })
      );
      await expect(finalizeCheckout(buildFormData({ eventId: "ev-1" }))).rejects.toThrow(
        "NEXT_REDIRECT:/checkout?eventId=ev-1&error=boom"
      );
    });
  });
});

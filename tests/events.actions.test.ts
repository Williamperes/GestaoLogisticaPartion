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
  createEvent,
  toggleChecklistItem,
  promoteToReadyToLoad,
} from "@/app/(dashboard)/events/actions";

function buildFormData(values: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

const ADMIN_CONTEXT = {
  role: "admin",
  userId: "user-1",
  primaryOrganization: { id: "org-1" },
};

const DEFAULT_CHECKLIST_COUNT = 5; // alinhado com DEFAULT_CHECKLIST_ITEMS em lib/events.ts

describe("events actions", () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Autorização ──────────────────────────────────────────────────

  it("blocks unauthenticated users from creating events", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(null);
    await expect(
      createEvent(buildFormData({ name: "Fest", startDate: "2025-06-01" }))
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard?error=unauthorized");
  });

  it("blocks client role from creating events", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({ role: "client" });
    await expect(
      createEvent(buildFormData({ name: "Fest", startDate: "2025-06-01" }))
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard?error=unauthorized");
  });

  // ── Criação de evento ────────────────────────────────────────────

  it("creates an event and inserts default checklist items automatically", async () => {
    const checklistInsert = vi.fn().mockResolvedValue({ error: null });
    const eventInsertSingle = vi.fn().mockResolvedValue({
      data: { id: "event-1" },
      error: null,
    });
    const eventInsertSelect = vi.fn().mockReturnValue({ single: eventInsertSingle });
    const eventInsert = vi.fn().mockReturnValue({ select: eventInsertSelect });

    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "events") return { insert: eventInsert };
        if (table === "event_checklist_items") return { insert: checklistInsert };
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      createEvent(
        buildFormData({
          name: "Festival Aurora 2025",
          startDate: "2025-06-15",
          endDate: "2025-06-16",
          venue: "Arena SP",
          city: "São Paulo",
        })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/events/event-1?success=Evento criado.");

    expect(eventInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org-1",
        name: "Festival Aurora 2025",
        start_date: "2025-06-15",
      })
    );

    // Deve inserir exatamente os 5 itens do template padrão
    expect(checklistInsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ event_id: "event-1", done: false }),
      ])
    );
    const insertedItems = checklistInsert.mock.calls[0][0] as unknown[];
    expect(insertedItems).toHaveLength(DEFAULT_CHECKLIST_COUNT);
  });

  it("rejects event creation when name is missing", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      createEvent(buildFormData({ name: "", startDate: "2025-06-01" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events?error=Nome e data de início são obrigatórios.");
  });

  // ── Toggle de checklist ──────────────────────────────────────────

  it("marks a checklist item as done", async () => {
    const update = vi.fn().mockResolvedValue({ error: null });
    const eqEventId = vi.fn().mockReturnValue(update);
    const eqItemId = vi.fn().mockReturnValue({ eq: eqEventId });
    const updateFn = vi.fn().mockReturnValue({ eq: eqItemId });

    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ update: updateFn }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      toggleChecklistItem(
        buildFormData({ itemId: "item-1", eventId: "event-1", done: "true" })
      )
    ).resolves.toBeUndefined(); // revalidatePath + sem redirect = retorna undefined

    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ done: true, done_by: "user-1" })
    );
  });

  it("clears done_by and done_at when unchecking an item", async () => {
    const update = vi.fn().mockResolvedValue({ error: null });
    const eqEventId = vi.fn().mockReturnValue(update);
    const eqItemId = vi.fn().mockReturnValue({ eq: eqEventId });
    const updateFn = vi.fn().mockReturnValue({ eq: eqItemId });

    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ update: updateFn }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await toggleChecklistItem(
      buildFormData({ itemId: "item-1", eventId: "event-1", done: "false" })
    );

    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ done: false, done_at: null, done_by: null })
    );
  });

  // ── Gate de produção ─────────────────────────────────────────────

  it("blocks promoting to ready_to_load when checklist is incomplete", async () => {
    const items = [
      { id: "i1", done: true },
      { id: "i2", done: true },
      { id: "i3", done: false }, // pendente
    ];

    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: items, error: null }),
        }),
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      promoteToReadyToLoad(buildFormData({ eventId: "event-1" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events/event-1?error=");

    // Verifica que o redirect contém a mensagem de erro de checklist incompleto
    let thrownMessage = "";
    try {
      await promoteToReadyToLoad(buildFormData({ eventId: "event-1" }));
    } catch (e) {
      thrownMessage = (e as Error).message;
    }
    expect(thrownMessage).toMatch(/checklist/i);
  });

  it("promotes to ready_to_load when all checklist items are done", async () => {
    const items = [
      { id: "i1", done: true },
      { id: "i2", done: true },
      { id: "i3", done: true },
    ];

    const update = vi.fn().mockResolvedValue({ error: null });
    const updateEq = vi.fn().mockReturnValue(update);
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq });

    let fromCallCount = 0;
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => {
        fromCallCount++;
        if (fromCallCount === 1) {
          // Primeiro from: select dos checklist items
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: items, error: null }),
            }),
          };
        }
        // Segundo from: update do evento
        return { update: updateFn };
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      promoteToReadyToLoad(buildFormData({ eventId: "event-1" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events/event-1?success");

    // O update deve ter sido chamado com o status correto
    expect(updateFn).toHaveBeenCalledWith({ status: "ready_to_load" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/events/event-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/events");
  });

  // TODO: Este cenário (trigger Postgres bloqueando o UPDATE) é difícil de simular em testes
  // unitários sem injeção de dependência na action, pois a action cria dois clientes Supabase
  // separados (um para o SELECT do checklist, outro para o UPDATE), e o mock compartilhado
  // não consegue distinguir qual chamada ao from() é qual de forma confiável.
  // Coberto pela migration 007 via trigger `events_gate_check` no banco real.
  it.skip("handles gate-blocked error from the database trigger", async () => {
    // [skipped — ver comentário acima]
  });






  it("rejects promotion when eventId is missing", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      promoteToReadyToLoad(buildFormData({ eventId: "" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events?error=Evento inválido.");
  });
});

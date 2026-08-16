import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  revalidatePath: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getCurrentUserContext: vi.fn(),
  getChecklistTemplate: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUserContext: mocks.getCurrentUserContext,
}));
vi.mock("@/lib/checklist-templates", () => ({
  getChecklistTemplate: mocks.getChecklistTemplate,
}));
const inventoryMock = vi.hoisted(() => ({
  getEquipmentAvailability: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/lib/inventory", () => ({
  getEquipmentAvailability: inventoryMock.getEquipmentAvailability,
  availabilityKey: (equipmentId: string, variantId: string | null | undefined) =>
    variantId ? `${equipmentId}:${variantId}` : equipmentId,
}));

import {
  createEvent,
  deleteEvent,
  toggleChecklistItem,
  promoteToReadyToLoad,
  updateEventDetails,
  addEventDate,
  addEventDateTeamMember,
  setEventEquipmentBatch,
  addEquipmentToEvent,
  toggleEquipmentSeparated,
  removeEquipmentFromEvent,
  updateEventDate,
  removeEventDate,
  updateEventDateTeamMember,
  removeEventDateTeamMember,
  addEventSpeaker,
  updateEventSpeaker,
  removeEventSpeaker,
  addEventExtra,
  updateEventExtra,
  removeEventExtra,
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

const DEFAULT_CHECKLIST_COUNT = 5; // alinhado com DEFAULT_CHECKLIST_ITEMS em lib/events.ts (fallback)

describe("events actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getChecklistTemplate.mockResolvedValue(null);
  });

  // ── Autorização ──────────────────────────────────────────────────

  it("accepts employee in the shared event write guard", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({
      role: "employee",
      userId: "employee-1",
      primaryOrganization: null,
    });
    await expect(
      createEvent(buildFormData({ name: "OS Funcionário", startDate: "2026-09-01" }))
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard?error=organization_not_found");
  });

  it("accepts employee in the checklist guard", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({
      role: "employee",
      userId: "employee-1",
      primaryOrganization: { id: "org-1" },
    });
    await expect(toggleChecklistItem(buildFormData({}))).rejects.toThrow(
      "NEXT_REDIRECT:/events/?error=Item inválido."
    );
  });

  it("keeps employee blocked from deleting an event", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({
      role: "employee",
      userId: "employee-1",
      primaryOrganization: { id: "org-1" },
    });
    await expect(deleteEvent(buildFormData({ eventId: "event-1" }))).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard?error=unauthorized"
    );
  });

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

  it("falls back to the embedded checklist when no template is selected", async () => {
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
    ).rejects.toThrow("NEXT_REDIRECT:/events/event-1?success=Evento%20criado.");

    expect(eventInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org-1",
        name: "Festival Aurora 2025",
        start_date: "2025-06-15",
      })
    );

    expect(checklistInsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          event_id: "event-1",
          done: false,
          section: expect.any(String),
          required: expect.any(Boolean),
          template_item_id: null,
        }),
      ])
    );
    const insertedItems = checklistInsert.mock.calls[0][0] as unknown[];
    expect(insertedItems).toHaveLength(DEFAULT_CHECKLIST_COUNT);
  });

  it("copies items from the selected template when one is provided", async () => {
    const checklistInsert = vi.fn().mockResolvedValue({ error: null });
    const eventInsertSingle = vi.fn().mockResolvedValue({
      data: { id: "event-2" },
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
    mocks.getChecklistTemplate.mockResolvedValue({
      id: "tmpl-1",
      organizationId: "org-1",
      name: "Festival",
      description: null,
      isDefault: true,
      itemCount: 2,
      requiredCount: 1,
      items: [
        {
          id: "ti-1",
          templateId: "tmpl-1",
          label: "Brief enviado",
          section: "strategic",
          position: 0,
          required: true,
        },
        {
          id: "ti-2",
          templateId: "tmpl-1",
          label: "Cliente confirmou local",
          section: "commercial",
          position: 0,
          required: false,
        },
      ],
    });

    await expect(
      createEvent(
        buildFormData({
          name: "Festival",
          startDate: "2025-06-15",
          templateId: "tmpl-1",
        })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/events/event-2?success=Evento%20criado.");

    expect(mocks.getChecklistTemplate).toHaveBeenCalledWith("tmpl-1");
    const insertedItems = checklistInsert.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(insertedItems).toHaveLength(2);
    expect(insertedItems[0]).toMatchObject({
      event_id: "event-2",
      label: "Brief enviado",
      section: "strategic",
      required: true,
      template_item_id: "ti-1",
    });
    expect(insertedItems[1]).toMatchObject({
      label: "Cliente confirmou local",
      section: "commercial",
      required: false,
      template_item_id: "ti-2",
    });
  });

  it("rejects when the selected template does not belong to the user's org", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    mocks.getChecklistTemplate.mockResolvedValue({
      id: "tmpl-x",
      organizationId: "other-org",
      name: "Outro",
      description: null,
      isDefault: false,
      itemCount: 0,
      requiredCount: 0,
      items: [],
    });

    await expect(
      createEvent(
        buildFormData({
          name: "Festival",
          startDate: "2025-06-15",
          templateId: "tmpl-x",
        })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/events?error=Template de checklist inválido.");
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
      { id: "i1", done: true, required: true },
      { id: "i2", done: true, required: true },
      { id: "i3", done: true, required: true },
    ];

    const update = vi.fn().mockResolvedValue({ error: null });
    const updateEq = vi.fn().mockReturnValue(update);
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq });

    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "event_checklist_items") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: items, error: null }),
            }),
          };
        }
        if (table === "event_equipment") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          };
        }
        if (table === "events") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { organization_id: "org-1" },
                  error: null,
                }),
              }),
            }),
            update: updateFn,
          };
        }
        if (table === "event_dates") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ date: "2025-06-15" }, { date: "2025-06-16" }],
                error: null,
              }),
            }),
          };
        }
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      promoteToReadyToLoad(buildFormData({ eventId: "event-1" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events/event-1?success");

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

  // ── Refactor B: campos operacionais ──────────────────────────────

  it("persists operational fields and flags on createEvent", async () => {
    const checklistInsert = vi.fn().mockResolvedValue({ error: null });
    const eventInsertSingle = vi.fn().mockResolvedValue({
      data: { id: "event-3" },
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
          name: "Formatura Dom Manuel",
          startDate: "2026-02-28",
          endDate: "2026-03-01",
          vehicle: "Kombi Ilmar",
          lightingColor: "DMX",
          assemblyAt: "2026-02-27T14:00",
          teardownAt: "2026-03-01T16:00",
          agencyName: "Acme Eventos",
          notes: "Cênica externa só no sábado.",
          executivePresent: "on",
          isLivestreamed: "on",
          strictVenueHours: "on",
        })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/events/event-3?success=Evento%20criado.");

    expect(eventInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicle: "Kombi Ilmar",
        lighting_color: "DMX",
        assembly_at: "2026-02-27T14:00",
        teardown_at: "2026-03-01T16:00",
        agency_name: "Acme Eventos",
        notes: "Cênica externa só no sábado.",
        executive_present: true,
        is_livestreamed: true,
        strict_venue_hours: true,
        is_recorded: false,
        client_demanding: false,
        agency_detailed: false,
        previous_day_assembly: false,
        requires_advance_credential: false,
      })
    );
  });

  it("defaults operational fields to null/false when omitted on createEvent", async () => {
    const checklistInsert = vi.fn().mockResolvedValue({ error: null });
    const eventInsertSingle = vi.fn().mockResolvedValue({
      data: { id: "event-4" },
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
          name: "OS minimal",
          startDate: "2026-06-01",
        })
      )
    ).rejects.toThrow(/NEXT_REDIRECT:/);

    expect(eventInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicle: null,
        lighting_color: null,
        assembly_at: null,
        teardown_at: null,
        agency_name: null,
        notes: null,
        executive_present: false,
        is_recorded: false,
        is_livestreamed: false,
        client_demanding: false,
        agency_detailed: false,
        previous_day_assembly: false,
        requires_advance_credential: false,
        strict_venue_hours: false,
      })
    );
  });

  it("updates operational fields via updateEventDetails", async () => {
    const fetchMaybeSingle = vi.fn().mockResolvedValue({
      data: { organization_id: "org-1" },
      error: null,
    });
    const fetchEq = vi.fn().mockReturnValue({ maybeSingle: fetchMaybeSingle });
    const fetchSelect = vi.fn().mockReturnValue({ eq: fetchEq });

    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq });

    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: fetchSelect,
        update: updateFn,
      })),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      updateEventDetails(
        buildFormData({
          eventId: "event-9",
          name: "Formatura Dom Manuel",
          startDate: "2026-02-28",
          endDate: "2026-03-01",
          vehicle: "Kombi Ilmar",
          lightingColor: "DMX",
          assemblyAt: "2026-02-27T14:00",
          agencyName: "Acme",
          isRecorded: "on",
          clientDemanding: "on",
        })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/events/event-9?success=Detalhes%20atualizados.");

    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Formatura Dom Manuel",
        vehicle: "Kombi Ilmar",
        lighting_color: "DMX",
        assembly_at: "2026-02-27T14:00",
        agency_name: "Acme",
        is_recorded: true,
        client_demanding: true,
        executive_present: false,
        strict_venue_hours: false,
      })
    );
    expect(updateEq).toHaveBeenCalledWith("id", "event-9");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/events/event-9");
  });

  it("rejects updateEventDetails when the event belongs to a different org", async () => {
    const fetchMaybeSingle = vi.fn().mockResolvedValue({
      data: { organization_id: "other-org" },
      error: null,
    });
    const fetchEq = vi.fn().mockReturnValue({ maybeSingle: fetchMaybeSingle });
    const fetchSelect = vi.fn().mockReturnValue({ eq: fetchEq });

    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq });

    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: fetchSelect,
        update: updateFn,
      })),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      updateEventDetails(
        buildFormData({
          eventId: "event-99",
          name: "Tentativa cross-org",
          startDate: "2026-06-01",
        })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/events/event-99?error=Evento inválido.");

    expect(updateFn).not.toHaveBeenCalled();
  });

  it("rejects updateEventDetails when name is empty", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({})),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      updateEventDetails(
        buildFormData({
          eventId: "event-10",
          name: "",
          startDate: "2026-06-01",
        })
      )
    ).rejects.toThrow(/Nome%20%C3%A9%20obrigat%C3%B3rio\./);
  });

  // ── Refactor D: event_dates + escala ────────────────────────────

  it("inserts a new event_date when the event belongs to the user's org", async () => {
    const eventFetchMaybeSingle = vi.fn().mockResolvedValue({
      data: { organization_id: "org-1" },
      error: null,
    });
    const eventFetchEq = vi.fn().mockReturnValue({ maybeSingle: eventFetchMaybeSingle });
    const eventFetchSelect = vi.fn().mockReturnValue({ eq: eventFetchEq });

    const datesInsert = vi.fn().mockResolvedValue({ error: null });

    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "events") return { select: eventFetchSelect };
        if (table === "event_dates") return { insert: datesInsert };
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      addEventDate(
        buildFormData({
          eventId: "event-50",
          date: "2026-02-28",
          eventStartTime: "20:00",
          eventEndTime: "23:00",
          position: "0",
          notes: "Cênica externa só no sábado.",
        })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/events/event-50?success=Data%20adicionada.");

    expect(datesInsert).toHaveBeenCalledWith({
      event_id: "event-50",
      date: "2026-02-28",
      position: 0,
      event_start_time: "20:00",
      event_end_time: "23:00",
      notes: "Cênica externa só no sábado.",
    });
  });

  it("rejects addEventDate when the event belongs to a different org", async () => {
    const eventFetchMaybeSingle = vi.fn().mockResolvedValue({
      data: { organization_id: "other-org" },
      error: null,
    });
    const eventFetchEq = vi.fn().mockReturnValue({ maybeSingle: eventFetchMaybeSingle });
    const eventFetchSelect = vi.fn().mockReturnValue({ eq: eventFetchEq });

    const datesInsert = vi.fn().mockResolvedValue({ error: null });

    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "events") return { select: eventFetchSelect };
        if (table === "event_dates") return { insert: datesInsert };
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      addEventDate(
        buildFormData({ eventId: "event-99", date: "2026-02-28" })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/events/event-99?error=Evento inválido.");

    expect(datesInsert).not.toHaveBeenCalled();
  });

  it("rejects addEventDateTeamMember when no team_member nor external_name is provided", async () => {
    const dateFetchMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: "date-1", event_id: "event-50", events: { organization_id: "org-1" } },
      error: null,
    });
    const dateFetchEq = vi.fn().mockReturnValue({ maybeSingle: dateFetchMaybeSingle });
    const dateFetchSelect = vi.fn().mockReturnValue({ eq: dateFetchEq });

    const teamInsert = vi.fn().mockResolvedValue({ error: null });

    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "event_dates") return { select: dateFetchSelect };
        if (table === "event_date_team_members") return { insert: teamInsert };
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      addEventDateTeamMember(
        buildFormData({
          eventDateId: "date-1",
          role: "audio",
        })
      )
    ).rejects.toThrow(/Selecione%20um%20membro/);

    expect(teamInsert).not.toHaveBeenCalled();
  });

  it("rejects addEventDateTeamMember when role=outro but no custom_role is given", async () => {
    const dateFetchMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: "date-1", event_id: "event-50", events: { organization_id: "org-1" } },
      error: null,
    });
    const dateFetchEq = vi.fn().mockReturnValue({ maybeSingle: dateFetchMaybeSingle });
    const dateFetchSelect = vi.fn().mockReturnValue({ eq: dateFetchEq });

    const teamInsert = vi.fn().mockResolvedValue({ error: null });

    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "event_dates") return { select: dateFetchSelect };
        if (table === "event_date_team_members") return { insert: teamInsert };
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      addEventDateTeamMember(
        buildFormData({
          eventDateId: "date-1",
          externalName: "Henry (banda)",
          role: "outro",
        })
      )
    ).rejects.toThrow(/Descreva%20o%20papel%20personalizado/);

    expect(teamInsert).not.toHaveBeenCalled();
  });

  it("inserts a team assignment with custom_role when role=outro", async () => {
    const dateFetchMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: "date-1", event_id: "event-50", events: { organization_id: "org-1" } },
      error: null,
    });
    const dateFetchEq = vi.fn().mockReturnValue({ maybeSingle: dateFetchMaybeSingle });
    const dateFetchSelect = vi.fn().mockReturnValue({ eq: dateFetchEq });

    const teamInsert = vi.fn().mockResolvedValue({ error: null });

    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "event_dates") return { select: dateFetchSelect };
        if (table === "event_date_team_members") return { insert: teamInsert };
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      addEventDateTeamMember(
        buildFormData({
          eventDateId: "date-1",
          externalName: "Henry (banda)",
          role: "outro",
          customRole: "Banda",
        })
      )
    ).rejects.toThrow(/success=Pessoa%20adicionada/);

    expect(teamInsert).toHaveBeenCalledWith({
      event_date_id: "date-1",
      team_member_id: null,
      external_name: "Henry (banda)",
      role: "outro",
      custom_role: "Banda",
      notes: null,
    });
  });

  it("rejects addEventDateTeamMember when team_member belongs to a different org", async () => {
    const dateFetchMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: "date-1", event_id: "event-50", events: { organization_id: "org-1" } },
      error: null,
    });
    const dateFetchEq = vi.fn().mockReturnValue({ maybeSingle: dateFetchMaybeSingle });
    const dateFetchSelect = vi.fn().mockReturnValue({ eq: dateFetchEq });

    const tmFetchMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: "tm-1", organization_id: "other-org" },
      error: null,
    });
    const tmFetchEq = vi.fn().mockReturnValue({ maybeSingle: tmFetchMaybeSingle });
    const tmFetchSelect = vi.fn().mockReturnValue({ eq: tmFetchEq });

    const teamInsert = vi.fn().mockResolvedValue({ error: null });

    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "event_dates") return { select: dateFetchSelect };
        if (table === "team_members") return { select: tmFetchSelect };
        if (table === "event_date_team_members") return { insert: teamInsert };
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      addEventDateTeamMember(
        buildFormData({
          eventDateId: "date-1",
          teamMemberId: "tm-1",
          role: "audio",
        })
      )
    ).rejects.toThrow(/Membro%20inv%C3%A1lido/);

    expect(teamInsert).not.toHaveBeenCalled();
  });

  // ── Refactor E: setEventEquipmentBatch + variant_id ────────────

  it("setEventEquipmentBatch parses qty_<eqId>__<variantId> and persists variant_id on insert", async () => {
    const eventFetchMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "event-1",
        organization_id: "org-1",
        status: "planning",
      },
      error: null,
    });
    const eventFetchEq = vi.fn().mockReturnValue({ maybeSingle: eventFetchMaybeSingle });
    const eventFetchSelect = vi.fn().mockReturnValue({ eq: eventFetchEq });

    const equipInChain = vi.fn().mockResolvedValue({
      data: [
        { id: "eq-1", organization_id: "org-1" },
        { id: "eq-2", organization_id: "org-1" },
      ],
      error: null,
    });
    const equipSelect = vi.fn().mockReturnValue({ in: equipInChain });

    const currentFetchIs = vi.fn().mockResolvedValue({ data: [], error: null });
    const currentFetchEq = vi.fn().mockReturnValue({ is: currentFetchIs });
    const currentFetchSelect = vi.fn().mockReturnValue({ eq: currentFetchEq });

    const eqInsert = vi.fn().mockResolvedValue({ error: null });

    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "events") return { select: eventFetchSelect };
        if (table === "equipment") return { select: equipSelect };
        if (table === "event_equipment") {
          // 1ª chamada select para currentRows, 2ª insert
          return { select: currentFetchSelect, insert: eqInsert };
        }
        if (table === "event_dates") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ date: "2026-08-10" }, { date: "2026-08-11" }],
                error: null,
              }),
            }),
          };
        }
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    const fd = new FormData();
    fd.set("eventId", "event-1");
    fd.set("qty_eq-1", "2"); // sem variante
    fd.set("qty_eq-2__var-A", "5"); // variante específica

    await expect(setEventEquipmentBatch(fd)).rejects.toThrow(
      /success=Lista%20de%20equipamentos%20atualizada/
    );

    expect(eqInsert).toHaveBeenCalledTimes(1);
    const inserts = eqInsert.mock.calls[0][0] as Array<Record<string, unknown>>;
    // Espera 2 inserts. Ordem pode variar pela iteração de Map; valida por presença.
    expect(inserts).toHaveLength(2);
    expect(inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_id: "event-1",
          equipment_id: "eq-1",
          variant_id: null,
          qty: 2,
          loaded: false,
        }),
        expect.objectContaining({
          event_id: "event-1",
          equipment_id: "eq-2",
          variant_id: "var-A",
          qty: 5,
          loaded: false,
        }),
      ])
    );
  });

  it("promoteToReadyToLoad blocks when a variant is oversold and includes its label", async () => {
    const items = [{ id: "i1", done: true, required: true }];

    inventoryMock.getEquipmentAvailability.mockResolvedValueOnce(
      new Map([
        ["eq-1:var-A", { available: 1, total: 1 }],
      ])
    );

    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "event_checklist_items") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: items, error: null }),
            }),
          };
        }
        if (table === "events") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { organization_id: "org-1" },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "event_equipment") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({
                  data: [
                    {
                      equipment_id: "eq-1",
                      variant_id: "var-A",
                      qty: 3,
                      unit_id: null,
                      equipment: { name: "Cabo XLR" },
                      equipment_variants: { label: "5M" },
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "event_dates") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ date: "2026-08-10" }, { date: "2026-08-11" }],
                error: null,
              }),
            }),
          };
        }
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    let thrown = "";
    try {
      await promoteToReadyToLoad(buildFormData({ eventId: "event-1" }));
    } catch (e) {
      thrown = (e as Error).message;
    }

    expect(thrown).toMatch(/Estoque%20insuficiente|Estoque insuficiente/);
    expect(thrown).toMatch(/Cabo%20XLR%205M|Cabo XLR 5M/);
  });

  // ════════════════════════════════════════════════════════════════
  // createEvent — branches adicionais
  // ════════════════════════════════════════════════════════════════

  it("createEvent redirects when organization is missing from context", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({
      role: "admin",
      userId: "user-1",
      primaryOrganization: null,
    });
    await expect(
      createEvent(buildFormData({ name: "Fest", startDate: "2025-06-01" }))
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard?error=organization_not_found");
  });

  it("createEvent redirects on event insert DB error", async () => {
    const eventInsertSingle = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "boom" } });
    const eventInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ single: eventInsertSingle }),
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "events") return { insert: eventInsert };
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      createEvent(buildFormData({ name: "Fest", startDate: "2025-06-01" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events?error=boom");
  });

  it("createEvent rolls back event and redirects on checklist insert error", async () => {
    const eventInsertSingle = vi
      .fn()
      .mockResolvedValue({ data: { id: "event-rb" }, error: null });
    const eventInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ single: eventInsertSingle }),
    });
    const checklistInsert = vi
      .fn()
      .mockResolvedValue({ error: { message: "checklist boom" } });
    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    const deleteFn = vi.fn().mockReturnValue({ eq: deleteEq });
    let eventsCall = 0;
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "events") {
          eventsCall += 1;
          if (eventsCall === 1) return { insert: eventInsert };
          return { delete: deleteFn };
        }
        if (table === "event_checklist_items") return { insert: checklistInsert };
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      createEvent(buildFormData({ name: "Fest", startDate: "2025-06-01" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events?error=checklist%20boom");

    expect(deleteFn).toHaveBeenCalled();
    expect(deleteEq).toHaveBeenCalledWith("id", "event-rb");
  });

  // ════════════════════════════════════════════════════════════════
  // toggleChecklistItem — branches
  // ════════════════════════════════════════════════════════════════

  it("toggleChecklistItem rejects when itemId is missing", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      toggleChecklistItem(buildFormData({ itemId: "", eventId: "event-1", done: "true" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events/event-1?error=Item inválido.");
  });

  it("toggleChecklistItem blocks unauthorized roles", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({ role: "client" });
    await expect(
      toggleChecklistItem(buildFormData({ itemId: "i", eventId: "e", done: "true" }))
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard?error=unauthorized");
  });

  it("toggleChecklistItem allows warehouse role and redirects on DB error", async () => {
    const eqEventId = vi.fn().mockResolvedValue({ error: { message: "db err" } });
    const eqItemId = vi.fn().mockReturnValue({ eq: eqEventId });
    const updateFn = vi.fn().mockReturnValue({ eq: eqItemId });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ update: updateFn }),
    });
    mocks.getCurrentUserContext.mockResolvedValue({ role: "warehouse", userId: "u-w" });

    await expect(
      toggleChecklistItem(buildFormData({ itemId: "i1", eventId: "ev1", done: "true" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?error=db%20err");
  });

  // ════════════════════════════════════════════════════════════════
  // promoteToReadyToLoad — branches
  // ════════════════════════════════════════════════════════════════

  it("promoteToReadyToLoad redirects when org missing", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({
      role: "admin",
      userId: "u",
      primaryOrganization: null,
    });
    await expect(
      promoteToReadyToLoad(buildFormData({ eventId: "ev" }))
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard?error=organization_not_found");
  });

  it("promoteToReadyToLoad redirects on checklist fetch error", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "event_checklist_items") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: { message: "fetch err" } }),
            }),
          };
        }
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      promoteToReadyToLoad(buildFormData({ eventId: "ev1" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?error=fetch%20err");
  });

  it("promoteToReadyToLoad redirects when no checklist items exist", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "event_checklist_items") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      promoteToReadyToLoad(buildFormData({ eventId: "ev1" }))
    ).rejects.toThrow(/não possui checklist/);
  });

  it("promoteToReadyToLoad redirects when event belongs to a different org", async () => {
    const items = [{ id: "i1", done: true, required: true }];
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "event_checklist_items") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: items, error: null }),
            }),
          };
        }
        if (table === "events") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { organization_id: "other-org" },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      promoteToReadyToLoad(buildFormData({ eventId: "ev1" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?error=Evento inválido.");
  });

  it("promoteToReadyToLoad redirects on equipment fetch error", async () => {
    const items = [{ id: "i1", done: true, required: true }];
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "event_checklist_items") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: items, error: null }),
            }),
          };
        }
        if (table === "events") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { organization_id: "org-1" },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "event_dates") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [{ date: "2026-08-10" }], error: null }),
            }),
          };
        }
        if (table === "event_equipment") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: null, error: { message: "eq err" } }),
              }),
            }),
          };
        }
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      promoteToReadyToLoad(buildFormData({ eventId: "ev1" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?error=eq%20err");
  });

  it("promoteToReadyToLoad surfaces GATE_BLOCKED trigger errors with friendly message", async () => {
    const items = [{ id: "i1", done: true, required: true }];
    const updateEq = vi
      .fn()
      .mockResolvedValue({ error: { message: "GATE_BLOCKED: incomplete", code: "P0001" } });
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "event_checklist_items") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: items, error: null }),
            }),
          };
        }
        if (table === "events") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { organization_id: "org-1" },
                  error: null,
                }),
              }),
            }),
            update: updateFn,
          };
        }
        if (table === "event_dates") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        if (table === "event_equipment") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          };
        }
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      promoteToReadyToLoad(buildFormData({ eventId: "ev1" }))
    ).rejects.toThrow(/Checklist%20ainda%20incompleto/);
  });

  it("promoteToReadyToLoad surfaces a generic update error message", async () => {
    const items = [{ id: "i1", done: true, required: true }];
    const updateEq = vi
      .fn()
      .mockResolvedValue({ error: { message: "generic fail", code: "OTHER" } });
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "event_checklist_items") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: items, error: null }),
            }),
          };
        }
        if (table === "events") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { organization_id: "org-1" },
                  error: null,
                }),
              }),
            }),
            update: updateFn,
          };
        }
        if (table === "event_dates") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        if (table === "event_equipment") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          };
        }
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      promoteToReadyToLoad(buildFormData({ eventId: "ev1" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?error=generic%20fail");
  });

  // ════════════════════════════════════════════════════════════════
  // addEquipmentToEvent
  // ════════════════════════════════════════════════════════════════

  it("addEquipmentToEvent inserts and revalidates on success", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ insert }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await addEquipmentToEvent(
      buildFormData({ eventId: "ev1", equipmentId: "eq1", qty: "3" })
    );
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ event_id: "ev1", equipment_id: "eq1", qty: 3, loaded: false })
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/events/ev1");
  });

  it("addEquipmentToEvent defaults qty to 1 when invalid", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ insert }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await addEquipmentToEvent(
      buildFormData({ eventId: "ev1", equipmentId: "eq1", qty: "-5" })
    );
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ qty: 1 }));
  });

  it("addEquipmentToEvent rejects when data is invalid", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn() });
    await expect(
      addEquipmentToEvent(buildFormData({ eventId: "ev1", equipmentId: "" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?error=Dados inválidos.");
  });

  it("addEquipmentToEvent redirects on DB error", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: "ins fail" } });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ insert }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      addEquipmentToEvent(buildFormData({ eventId: "ev1", equipmentId: "eq1" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?error=ins%20fail");
  });

  // ════════════════════════════════════════════════════════════════
  // toggleEquipmentSeparated
  // ════════════════════════════════════════════════════════════════

  it("toggleEquipmentSeparated marks separated on success", async () => {
    const update = vi.fn().mockResolvedValue({ error: null });
    const eqEvent = vi.fn().mockReturnValue(update);
    const eqId = vi.fn().mockReturnValue({ eq: eqEvent });
    const updateFn = vi.fn().mockReturnValue({ eq: eqId });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ update: updateFn }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await toggleEquipmentSeparated(
      buildFormData({ eventEquipmentId: "ee1", eventId: "ev1", separated: "true" })
    );
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ separated: true, separated_by: "user-1" })
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/events/ev1");
  });

  it("toggleEquipmentSeparated clears fields when unset", async () => {
    const update = vi.fn().mockResolvedValue({ error: null });
    const eqEvent = vi.fn().mockReturnValue(update);
    const eqId = vi.fn().mockReturnValue({ eq: eqEvent });
    const updateFn = vi.fn().mockReturnValue({ eq: eqId });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ update: updateFn }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await toggleEquipmentSeparated(
      buildFormData({ eventEquipmentId: "ee1", eventId: "ev1", separated: "false" })
    );
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ separated: false, separated_at: null, separated_by: null })
    );
  });

  it("toggleEquipmentSeparated rejects when ids are missing", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn() });
    await expect(
      toggleEquipmentSeparated(buildFormData({ eventEquipmentId: "", eventId: "ev1" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?error=Item inválido.");
  });

  it("toggleEquipmentSeparated redirects on DB error", async () => {
    const eqEvent = vi.fn().mockResolvedValue({ error: { message: "sep err" } });
    const eqId = vi.fn().mockReturnValue({ eq: eqEvent });
    const updateFn = vi.fn().mockReturnValue({ eq: eqId });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ update: updateFn }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      toggleEquipmentSeparated(
        buildFormData({ eventEquipmentId: "ee1", eventId: "ev1", separated: "1" })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?error=sep%20err");
  });

  // ════════════════════════════════════════════════════════════════
  // removeEquipmentFromEvent
  // ════════════════════════════════════════════════════════════════

  it("removeEquipmentFromEvent deletes and revalidates", async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { event_id: "ev1" }, error: null });
    const selectEq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq: selectEq });
    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    const deleteFn = vi.fn().mockReturnValue({ eq: deleteEq });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select, delete: deleteFn }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await removeEquipmentFromEvent(buildFormData({ eventEquipmentId: "ee1" }));
    expect(deleteFn).toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/events/ev1");
  });

  it("removeEquipmentFromEvent rejects when id is missing", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn() });
    await expect(
      removeEquipmentFromEvent(buildFormData({ eventEquipmentId: "" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events?error=Dados inválidos.");
  });

  it("removeEquipmentFromEvent redirects on delete error (row not found)", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const selectEq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq: selectEq });
    const deleteEq = vi.fn().mockResolvedValue({ error: { message: "del err" } });
    const deleteFn = vi.fn().mockReturnValue({ eq: deleteEq });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select, delete: deleteFn }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      removeEquipmentFromEvent(buildFormData({ eventEquipmentId: "ee1" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events/?error=del%20err");
  });

  // ════════════════════════════════════════════════════════════════
  // setEventEquipmentBatch — branches
  // ════════════════════════════════════════════════════════════════

  it("setEventEquipmentBatch redirects when org is missing", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({
      role: "admin",
      userId: "u",
      primaryOrganization: null,
    });
    const fd = new FormData();
    fd.set("eventId", "ev1");
    await expect(setEventEquipmentBatch(fd)).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard?error=organization_not_found"
    );
  });

  it("setEventEquipmentBatch rejects when eventId missing", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    const fd = new FormData();
    await expect(setEventEquipmentBatch(fd)).rejects.toThrow(
      "NEXT_REDIRECT:/events?error=Evento inválido."
    );
  });

  it("setEventEquipmentBatch short-circuits when no desired rows", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    const fd = new FormData();
    fd.set("eventId", "ev1");
    fd.set("other", "x");
    await expect(setEventEquipmentBatch(fd)).rejects.toThrow(
      /success=Nenhuma%20altera/
    );
  });

  it("setEventEquipmentBatch rejects when equipment belongs to another org", async () => {
    const eventMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: "ev1", organization_id: "org-1", status: "planning" },
      error: null,
    });
    const eventSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: eventMaybeSingle }),
    });
    const equipIn = vi
      .fn()
      .mockResolvedValue({ data: [{ id: "eq1", organization_id: "other-org" }], error: null });
    const equipSelect = vi.fn().mockReturnValue({ in: equipIn });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "events") return { select: eventSelect };
        if (table === "equipment") return { select: equipSelect };
        if (table === "event_dates") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    const fd = new FormData();
    fd.set("eventId", "ev1");
    fd.set("qty_eq1", "2");
    await expect(setEventEquipmentBatch(fd)).rejects.toThrow(
      /Um ou mais equipamentos/
    );
  });

  it("setEventEquipmentBatch hard-blocks overbooking when not planning", async () => {
    inventoryMock.getEquipmentAvailability.mockResolvedValueOnce(
      new Map([["eq1", { available: 1, total: 1 }]])
    );
    const eventMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: "ev1", organization_id: "org-1", status: "ready_to_load" },
      error: null,
    });
    const eventSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: eventMaybeSingle }),
    });
    const equipIn = vi
      .fn()
      .mockResolvedValue({ data: [{ id: "eq1", organization_id: "org-1" }], error: null });
    const equipSelect = vi.fn().mockReturnValue({ in: equipIn });
    const currentIs = vi.fn().mockResolvedValue({ data: [], error: null });
    const currentSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ is: currentIs }),
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "events") return { select: eventSelect };
        if (table === "equipment") return { select: equipSelect };
        if (table === "event_equipment") return { select: currentSelect };
        if (table === "event_dates") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    const fd = new FormData();
    fd.set("eventId", "ev1");
    fd.set("qty_eq1", "5");
    await expect(setEventEquipmentBatch(fd)).rejects.toThrow(
      /Estoque%20insuficiente/
    );
  });

  it("setEventEquipmentBatch updates and deletes existing rows and warns on overbooking in planning", async () => {
    inventoryMock.getEquipmentAvailability.mockResolvedValueOnce(
      new Map([["eq1", { available: 1, total: 1 }]])
    );
    const eventMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: "ev1", organization_id: "org-1", status: "planning" },
      error: null,
    });
    const eventSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: eventMaybeSingle }),
    });
    const equipIn = vi.fn().mockResolvedValue({
      data: [
        { id: "eq1", organization_id: "org-1" },
        { id: "eq2", organization_id: "org-1" },
      ],
      error: null,
    });
    const equipSelect = vi.fn().mockReturnValue({ in: equipIn });
    // current state: eq1 qty 1 (will update to 5), eq2 qty 2 (will be deleted)
    const currentIs = vi.fn().mockResolvedValue({
      data: [
        { id: "ee-eq1", equipment_id: "eq1", variant_id: null, qty: 1 },
        { id: "ee-eq2", equipment_id: "eq2", variant_id: null, qty: 2 },
      ],
      error: null,
    });
    const currentSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ is: currentIs }),
    });
    const updEq = vi.fn().mockResolvedValue({ error: null });
    const updateFn = vi.fn().mockReturnValue({ eq: updEq });
    const delIn = vi.fn().mockResolvedValue({ error: null });
    const deleteFn = vi.fn().mockReturnValue({ in: delIn });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "events") return { select: eventSelect };
        if (table === "equipment") return { select: equipSelect };
        if (table === "event_equipment") {
          return { select: currentSelect, update: updateFn, delete: deleteFn };
        }
        if (table === "event_dates") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    const fd = new FormData();
    fd.set("eventId", "ev1");
    fd.set("qty_eq1", "5"); // update + overbooked => warning
    fd.set("qty_eq2", "0"); // delete

    let thrown = "";
    try {
      await setEventEquipmentBatch(fd);
    } catch (e) {
      thrown = (e as Error).message;
    }
    expect(updateFn).toHaveBeenCalledWith({ qty: 5 });
    expect(updEq).toHaveBeenCalledWith("id", "ee-eq1");
    expect(delIn).toHaveBeenCalledWith("id", ["ee-eq2"]);
    expect(thrown).toMatch(/Aten%C3%A7%C3%A3o|Lista%20de%20equipamentos%20atualizada/);
  });

  it("setEventEquipmentBatch redirects on insert error", async () => {
    const eventMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: "ev1", organization_id: "org-1", status: "planning" },
      error: null,
    });
    const eventSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: eventMaybeSingle }),
    });
    const equipIn = vi
      .fn()
      .mockResolvedValue({ data: [{ id: "eq1", organization_id: "org-1" }], error: null });
    const equipSelect = vi.fn().mockReturnValue({ in: equipIn });
    const currentIs = vi.fn().mockResolvedValue({ data: [], error: null });
    const currentSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ is: currentIs }),
    });
    const eqInsert = vi.fn().mockResolvedValue({ error: { message: "ins fail" } });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "events") return { select: eventSelect };
        if (table === "equipment") return { select: equipSelect };
        if (table === "event_equipment") return { select: currentSelect, insert: eqInsert };
        if (table === "event_dates") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    const fd = new FormData();
    fd.set("eventId", "ev1");
    fd.set("qty_eq1", "2");
    await expect(setEventEquipmentBatch(fd)).rejects.toThrow(
      "NEXT_REDIRECT:/events/ev1?error=ins%20fail"
    );
  });

  // ════════════════════════════════════════════════════════════════
  // updateEventDate / removeEventDate
  // ════════════════════════════════════════════════════════════════

  it("updateEventDate updates on success", async () => {
    const resolveMaybe = vi.fn().mockResolvedValue({
      data: { id: "d1", event_id: "ev1", events: { organization_id: "org-1" } },
      error: null,
    });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    const updEq = vi.fn().mockResolvedValue({ error: null });
    const updateFn = vi.fn().mockReturnValue({ eq: updEq });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: resolveSelect, update: updateFn }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);

    await expect(
      updateEventDate(
        buildFormData({ eventDateId: "d1", date: "2026-02-28", position: "2" })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?success=Data%20atualizada.");
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ date: "2026-02-28", position: 2 })
    );
  });

  it("updateEventDate rejects when date missing", async () => {
    const resolveMaybe = vi.fn().mockResolvedValue({
      data: { id: "d1", event_id: "ev1", events: { organization_id: "org-1" } },
      error: null,
    });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: resolveSelect }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      updateEventDate(buildFormData({ eventDateId: "d1", date: "" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?error=Data obrigatória.");
  });

  it("updateEventDate maps unique-violation error code to friendly message", async () => {
    const resolveMaybe = vi.fn().mockResolvedValue({
      data: { id: "d1", event_id: "ev1", events: { organization_id: "org-1" } },
      error: null,
    });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    const updEq = vi.fn().mockResolvedValue({ error: { code: "23505", message: "dup" } });
    const updateFn = vi.fn().mockReturnValue({ eq: updEq });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: resolveSelect, update: updateFn }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      updateEventDate(buildFormData({ eventDateId: "d1", date: "2026-02-28" }))
    ).rejects.toThrow(/existe%20uma%20data/);
  });

  it("updateEventDate rejects when eventDateId missing", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn() });
    await expect(
      updateEventDate(buildFormData({ eventDateId: "" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events?error=Data inválida.");
  });

  it("addEventDate maps unique-violation code to friendly message", async () => {
    const eventMaybe = vi
      .fn()
      .mockResolvedValue({ data: { organization_id: "org-1" }, error: null });
    const eventSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: eventMaybe }),
    });
    const datesInsert = vi.fn().mockResolvedValue({ error: { code: "23505", message: "dup" } });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "events") return { select: eventSelect };
        if (table === "event_dates") return { insert: datesInsert };
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      addEventDate(buildFormData({ eventId: "ev1", date: "2026-02-28" }))
    ).rejects.toThrow(/existe%20uma%20data/);
  });

  it("addEventDate rejects when date missing", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn() });
    await expect(
      addEventDate(buildFormData({ eventId: "ev1", date: "" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?error=Data obrigatória.");
  });

  it("removeEventDate deletes on success", async () => {
    const resolveMaybe = vi.fn().mockResolvedValue({
      data: { id: "d1", event_id: "ev1", events: { organization_id: "org-1" } },
      error: null,
    });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    const delEq = vi.fn().mockResolvedValue({ error: null });
    const deleteFn = vi.fn().mockReturnValue({ eq: delEq });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: resolveSelect, delete: deleteFn }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      removeEventDate(buildFormData({ eventDateId: "d1" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?success=Data%20removida.");
  });

  it("removeEventDate redirects on DB error", async () => {
    const resolveMaybe = vi.fn().mockResolvedValue({
      data: { id: "d1", event_id: "ev1", events: { organization_id: "org-1" } },
      error: null,
    });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    const delEq = vi.fn().mockResolvedValue({ error: { message: "del err" } });
    const deleteFn = vi.fn().mockReturnValue({ eq: delEq });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: resolveSelect, delete: deleteFn }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      removeEventDate(buildFormData({ eventDateId: "d1" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?error=del%20err");
  });

  it("removeEventDate redirects when resolveEventDate finds nothing", async () => {
    const resolveMaybe = vi.fn().mockResolvedValue({ data: null, error: null });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: resolveSelect }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      removeEventDate(buildFormData({ eventDateId: "d1" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events?error=Data inválida.");
  });

  it("removeEventDate redirects when date resolves to a different org", async () => {
    const resolveMaybe = vi.fn().mockResolvedValue({
      data: { id: "d1", event_id: "ev1", events: { organization_id: "other-org" } },
      error: null,
    });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: resolveSelect }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      removeEventDate(buildFormData({ eventDateId: "d1" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events?error=Data inválida.");
  });

  // ════════════════════════════════════════════════════════════════
  // addEventDateTeamMember — success + remaining branches
  // ════════════════════════════════════════════════════════════════

  it("addEventDateTeamMember inserts with team_member_id after org validation", async () => {
    const dateMaybe = vi.fn().mockResolvedValue({
      data: { id: "d1", event_id: "ev1", events: { organization_id: "org-1" } },
      error: null,
    });
    const dateSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: dateMaybe }),
    });
    const tmMaybe = vi
      .fn()
      .mockResolvedValue({ data: { id: "tm1", organization_id: "org-1" }, error: null });
    const tmSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: tmMaybe }),
    });
    const teamInsert = vi.fn().mockResolvedValue({ error: null });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "event_dates") return { select: dateSelect };
        if (table === "team_members") return { select: tmSelect };
        if (table === "event_date_team_members") return { insert: teamInsert };
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      addEventDateTeamMember(
        buildFormData({ eventDateId: "d1", teamMemberId: "tm1", role: "audio" })
      )
    ).rejects.toThrow(/success=Pessoa%20adicionada/);
    expect(teamInsert).toHaveBeenCalledWith(
      expect.objectContaining({ team_member_id: "tm1", external_name: null, role: "audio" })
    );
  });

  it("addEventDateTeamMember rejects invalid role", async () => {
    const dateMaybe = vi.fn().mockResolvedValue({
      data: { id: "d1", event_id: "ev1", events: { organization_id: "org-1" } },
      error: null,
    });
    const dateSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: dateMaybe }),
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: dateSelect }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      addEventDateTeamMember(
        buildFormData({ eventDateId: "d1", externalName: "Bob", role: "nonsense" })
      )
    ).rejects.toThrow(/Papel%20inv%C3%A1lido/);
  });

  it("addEventDateTeamMember redirects on insert error", async () => {
    const dateMaybe = vi.fn().mockResolvedValue({
      data: { id: "d1", event_id: "ev1", events: { organization_id: "org-1" } },
      error: null,
    });
    const dateSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: dateMaybe }),
    });
    const teamInsert = vi.fn().mockResolvedValue({ error: { message: "ins err" } });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "event_dates") return { select: dateSelect };
        if (table === "event_date_team_members") return { insert: teamInsert };
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      addEventDateTeamMember(
        buildFormData({ eventDateId: "d1", externalName: "Bob", role: "audio" })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?error=ins%20err");
  });

  it("addEventDateTeamMember redirects when org missing and rejects missing eventDateId", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({
      role: "admin",
      userId: "u",
      primaryOrganization: null,
    });
    await expect(
      addEventDateTeamMember(buildFormData({ role: "audio" }))
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard?error=organization_not_found");

    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn() });
    await expect(
      addEventDateTeamMember(buildFormData({ eventDateId: "", role: "audio" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events?error=Data inválida.");
  });

  // ════════════════════════════════════════════════════════════════
  // updateEventDateTeamMember
  // ════════════════════════════════════════════════════════════════

  it("updateEventDateTeamMember updates on success", async () => {
    const resolveMaybe = vi.fn().mockResolvedValue({
      data: {
        id: "a1",
        event_date_id: "d1",
        event_dates: { event_id: "ev1", events: { organization_id: "org-1" } },
      },
      error: null,
    });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    const updEq = vi.fn().mockResolvedValue({ error: null });
    const updateFn = vi.fn().mockReturnValue({ eq: updEq });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "event_date_team_members") {
          return { select: resolveSelect, update: updateFn };
        }
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      updateEventDateTeamMember(
        buildFormData({ assignmentId: "a1", externalName: "Bob", role: "luz" })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?success=Escala%20atualizada.");
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ role: "luz", external_name: "Bob" })
    );
  });

  it("updateEventDateTeamMember validates team_member org and redirects on mismatch", async () => {
    const resolveMaybe = vi.fn().mockResolvedValue({
      data: {
        id: "a1",
        event_date_id: "d1",
        event_dates: { event_id: "ev1", events: { organization_id: "org-1" } },
      },
      error: null,
    });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    const tmMaybe = vi
      .fn()
      .mockResolvedValue({ data: { id: "tm1", organization_id: "other-org" }, error: null });
    const tmSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: tmMaybe }),
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "event_date_team_members") return { select: resolveSelect };
        if (table === "team_members") return { select: tmSelect };
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      updateEventDateTeamMember(
        buildFormData({ assignmentId: "a1", teamMemberId: "tm1", role: "audio" })
      )
    ).rejects.toThrow(/Membro%20inv%C3%A1lido/);
  });

  it("updateEventDateTeamMember rejects role=outro without custom_role", async () => {
    const resolveMaybe = vi.fn().mockResolvedValue({
      data: {
        id: "a1",
        event_date_id: "d1",
        event_dates: { event_id: "ev1", events: { organization_id: "org-1" } },
      },
      error: null,
    });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: resolveSelect }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      updateEventDateTeamMember(
        buildFormData({ assignmentId: "a1", externalName: "Bob", role: "outro" })
      )
    ).rejects.toThrow(/Descreva%20o%20papel/);
  });

  it("updateEventDateTeamMember rejects when assignmentId missing", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn() });
    await expect(
      updateEventDateTeamMember(buildFormData({ assignmentId: "" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events?error=Atribuição inválida.");
  });

  it("updateEventDateTeamMember redirects when assignment resolves to error", async () => {
    const resolveMaybe = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "x" } });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: resolveSelect }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      updateEventDateTeamMember(buildFormData({ assignmentId: "a1", role: "audio" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events?error=Atribuição inválida.");
  });

  it("updateEventDateTeamMember rejects on update DB error", async () => {
    const resolveMaybe = vi.fn().mockResolvedValue({
      data: {
        id: "a1",
        event_date_id: "d1",
        event_dates: { event_id: "ev1", events: { organization_id: "org-1" } },
      },
      error: null,
    });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    const updEq = vi.fn().mockResolvedValue({ error: { message: "upd err" } });
    const updateFn = vi.fn().mockReturnValue({ eq: updEq });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: resolveSelect, update: updateFn }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      updateEventDateTeamMember(
        buildFormData({ assignmentId: "a1", externalName: "Bob", role: "audio" })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?error=upd%20err");
  });

  it("updateEventDateTeamMember rejects when no member nor external name provided", async () => {
    const resolveMaybe = vi.fn().mockResolvedValue({
      data: {
        id: "a1",
        event_date_id: "d1",
        event_dates: { event_id: "ev1", events: { organization_id: "org-1" } },
      },
      error: null,
    });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: resolveSelect }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      updateEventDateTeamMember(buildFormData({ assignmentId: "a1", role: "audio" }))
    ).rejects.toThrow(/Selecione%20um%20membro/);
  });

  it("updateEventDateTeamMember rejects invalid role", async () => {
    const resolveMaybe = vi.fn().mockResolvedValue({
      data: {
        id: "a1",
        event_date_id: "d1",
        event_dates: { event_id: "ev1", events: { organization_id: "org-1" } },
      },
      error: null,
    });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: resolveSelect }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      updateEventDateTeamMember(
        buildFormData({ assignmentId: "a1", externalName: "Bob", role: "xx" })
      )
    ).rejects.toThrow(/Papel%20inv%C3%A1lido/);
  });

  // ════════════════════════════════════════════════════════════════
  // removeEventDateTeamMember
  // ════════════════════════════════════════════════════════════════

  it("removeEventDateTeamMember deletes on success", async () => {
    const resolveMaybe = vi.fn().mockResolvedValue({
      data: {
        id: "a1",
        event_date_id: "d1",
        event_dates: { event_id: "ev1", events: { organization_id: "org-1" } },
      },
      error: null,
    });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    const delEq = vi.fn().mockResolvedValue({ error: null });
    const deleteFn = vi.fn().mockReturnValue({ eq: delEq });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: resolveSelect, delete: deleteFn }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      removeEventDateTeamMember(buildFormData({ assignmentId: "a1" }))
    ).rejects.toThrow(/success=Pessoa%20removida/);
  });

  it("removeEventDateTeamMember rejects when assignmentId missing", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn() });
    await expect(
      removeEventDateTeamMember(buildFormData({ assignmentId: "" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events?error=Atribuição inválida.");
  });

  it("removeEventDateTeamMember redirects on DB error", async () => {
    const resolveMaybe = vi.fn().mockResolvedValue({
      data: {
        id: "a1",
        event_date_id: "d1",
        event_dates: { event_id: "ev1", events: { organization_id: "org-1" } },
      },
      error: null,
    });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    const delEq = vi.fn().mockResolvedValue({ error: { message: "del err" } });
    const deleteFn = vi.fn().mockReturnValue({ eq: delEq });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: resolveSelect, delete: deleteFn }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      removeEventDateTeamMember(buildFormData({ assignmentId: "a1" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?error=del%20err");
  });

  // ════════════════════════════════════════════════════════════════
  // Speakers
  // ════════════════════════════════════════════════════════════════

  it("addEventSpeaker inserts on success", async () => {
    const eventMaybe = vi
      .fn()
      .mockResolvedValue({ data: { organization_id: "org-1" }, error: null });
    const eventSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: eventMaybe }),
    });
    const insert = vi.fn().mockResolvedValue({ error: null });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "events") return { select: eventSelect };
        if (table === "event_speakers") return { insert };
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      addEventSpeaker(
        buildFormData({ eventId: "ev1", name: "Alice", organization: "Acme", needsMic: "on" })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?success=Palestrante%20adicionado.");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Alice", organization: "Acme", needs_mic: true })
    );
  });

  it("addEventSpeaker rejects when name missing", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn() });
    await expect(
      addEventSpeaker(buildFormData({ eventId: "ev1", name: "" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?error=Nome do palestrante obrigatório.");
  });

  it("addEventSpeaker redirects on DB error", async () => {
    const eventMaybe = vi
      .fn()
      .mockResolvedValue({ data: { organization_id: "org-1" }, error: null });
    const eventSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: eventMaybe }),
    });
    const insert = vi.fn().mockResolvedValue({ error: { message: "sp err" } });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "events") return { select: eventSelect };
        if (table === "event_speakers") return { insert };
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      addEventSpeaker(buildFormData({ eventId: "ev1", name: "Alice" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?error=sp%20err");
  });

  it("updateEventSpeaker updates on success", async () => {
    const resolveMaybe = vi.fn().mockResolvedValue({
      data: { id: "sp1", event_id: "ev1", events: { organization_id: "org-1" } },
      error: null,
    });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    const updEq = vi.fn().mockResolvedValue({ error: null });
    const updateFn = vi.fn().mockReturnValue({ eq: updEq });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: resolveSelect, update: updateFn }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      updateEventSpeaker(buildFormData({ speakerId: "sp1", name: "Bob", needsNotebook: "on" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?success=Palestrante%20atualizado.");
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Bob", needs_notebook: true })
    );
  });

  it("updateEventSpeaker rejects when name missing", async () => {
    const resolveMaybe = vi.fn().mockResolvedValue({
      data: { id: "sp1", event_id: "ev1", events: { organization_id: "org-1" } },
      error: null,
    });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: resolveSelect }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      updateEventSpeaker(buildFormData({ speakerId: "sp1", name: "" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?error=Nome do palestrante obrigatório.");
  });

  it("updateEventSpeaker rejects when speakerId missing", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn() });
    await expect(
      updateEventSpeaker(buildFormData({ speakerId: "" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events?error=Palestrante inválido.");
  });

  it("updateEventSpeaker redirects when speaker resolves to a different org", async () => {
    const resolveMaybe = vi.fn().mockResolvedValue({
      data: { id: "sp1", event_id: "ev1", events: { organization_id: "other-org" } },
      error: null,
    });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: resolveSelect }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      updateEventSpeaker(buildFormData({ speakerId: "sp1", name: "Bob" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events?error=Palestrante inválido.");
  });

  it("updateEventSpeaker redirects on DB error", async () => {
    const resolveMaybe = vi.fn().mockResolvedValue({
      data: { id: "sp1", event_id: "ev1", events: { organization_id: "org-1" } },
      error: null,
    });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    const updEq = vi.fn().mockResolvedValue({ error: { message: "sp upd" } });
    const updateFn = vi.fn().mockReturnValue({ eq: updEq });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: resolveSelect, update: updateFn }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      updateEventSpeaker(buildFormData({ speakerId: "sp1", name: "Bob" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?error=sp%20upd");
  });

  it("removeEventSpeaker deletes on success", async () => {
    const resolveMaybe = vi.fn().mockResolvedValue({
      data: { id: "sp1", event_id: "ev1", events: { organization_id: "org-1" } },
      error: null,
    });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    const delEq = vi.fn().mockResolvedValue({ error: null });
    const deleteFn = vi.fn().mockReturnValue({ eq: delEq });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: resolveSelect, delete: deleteFn }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      removeEventSpeaker(buildFormData({ speakerId: "sp1" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?success=Palestrante%20removido.");
  });

  it("removeEventSpeaker rejects when speakerId missing", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn() });
    await expect(
      removeEventSpeaker(buildFormData({ speakerId: "" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events?error=Palestrante inválido.");
  });

  it("removeEventSpeaker redirects when resolve fails (not found)", async () => {
    const resolveMaybe = vi.fn().mockResolvedValue({ data: null, error: null });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: resolveSelect }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      removeEventSpeaker(buildFormData({ speakerId: "sp1" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events?error=Palestrante inválido.");
  });

  it("removeEventSpeaker redirects on DB error", async () => {
    const resolveMaybe = vi.fn().mockResolvedValue({
      data: { id: "sp1", event_id: "ev1", events: { organization_id: "org-1" } },
      error: null,
    });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    const delEq = vi.fn().mockResolvedValue({ error: { message: "sp del" } });
    const deleteFn = vi.fn().mockReturnValue({ eq: delEq });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: resolveSelect, delete: deleteFn }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      removeEventSpeaker(buildFormData({ speakerId: "sp1" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?error=sp%20del");
  });

  // ════════════════════════════════════════════════════════════════
  // Extras
  // ════════════════════════════════════════════════════════════════

  it("addEventExtra inserts on success with parsed price", async () => {
    const eventMaybe = vi
      .fn()
      .mockResolvedValue({ data: { organization_id: "org-1" }, error: null });
    const eventSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: eventMaybe }),
    });
    const insert = vi.fn().mockResolvedValue({ error: null });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "events") return { select: eventSelect };
        if (table === "event_extras") return { insert };
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      addEventExtra(
        buildFormData({
          eventId: "ev1",
          kind: "generator",
          description: "Gerador 50kVA",
          qty: "2",
          unitPrice: "1234,56",
        })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?success=Extra%20adicionado.");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "generator",
        description: "Gerador 50kVA",
        qty: 2,
        unit_price_cents: 123456,
      })
    );
  });

  it("addEventExtra rejects when kind invalid or description missing", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn() });
    await expect(
      addEventExtra(buildFormData({ eventId: "ev1", kind: "bad", description: "x" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?error=Dados do extra inválidos.");
  });

  it("addEventExtra handles invalid price as null", async () => {
    const eventMaybe = vi
      .fn()
      .mockResolvedValue({ data: { organization_id: "org-1" }, error: null });
    const eventSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: eventMaybe }),
    });
    const insert = vi.fn().mockResolvedValue({ error: null });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "events") return { select: eventSelect };
        if (table === "event_extras") return { insert };
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      addEventExtra(
        buildFormData({
          eventId: "ev1",
          kind: "other",
          description: "Item",
          unitPrice: "abc",
        })
      )
    ).rejects.toThrow(/success=Extra%20adicionado/);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ unit_price_cents: null })
    );
  });

  it("addEventExtra redirects on DB error", async () => {
    const eventMaybe = vi
      .fn()
      .mockResolvedValue({ data: { organization_id: "org-1" }, error: null });
    const eventSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: eventMaybe }),
    });
    const insert = vi.fn().mockResolvedValue({ error: { message: "ex err" } });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "events") return { select: eventSelect };
        if (table === "event_extras") return { insert };
        return {};
      }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      addEventExtra(
        buildFormData({ eventId: "ev1", kind: "stage", description: "Palco" })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?error=ex%20err");
  });

  it("updateEventExtra updates on success", async () => {
    const resolveMaybe = vi.fn().mockResolvedValue({
      data: { id: "ex1", event_id: "ev1", events: { organization_id: "org-1" } },
      error: null,
    });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    const updEq = vi.fn().mockResolvedValue({ error: null });
    const updateFn = vi.fn().mockReturnValue({ eq: updEq });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: resolveSelect, update: updateFn }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      updateEventExtra(
        buildFormData({ extraId: "ex1", kind: "tv", description: "TV 55", qty: "3" })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?success=Extra%20atualizado.");
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "tv", description: "TV 55", qty: 3 })
    );
  });

  it("updateEventExtra rejects when kind/description invalid", async () => {
    const resolveMaybe = vi.fn().mockResolvedValue({
      data: { id: "ex1", event_id: "ev1", events: { organization_id: "org-1" } },
      error: null,
    });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: resolveSelect }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      updateEventExtra(buildFormData({ extraId: "ex1", kind: "tv", description: "" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?error=Dados do extra inválidos.");
  });

  it("updateEventExtra rejects when extraId missing", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn() });
    await expect(
      updateEventExtra(buildFormData({ extraId: "" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events?error=Extra inválido.");
  });

  it("updateEventExtra redirects when extra resolves to error", async () => {
    const resolveMaybe = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "x" } });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: resolveSelect }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      updateEventExtra(buildFormData({ extraId: "ex1", kind: "tv", description: "TV" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events?error=Extra inválido.");
  });

  it("updateEventExtra redirects on DB error", async () => {
    const resolveMaybe = vi.fn().mockResolvedValue({
      data: { id: "ex1", event_id: "ev1", events: { organization_id: "org-1" } },
      error: null,
    });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    const updEq = vi.fn().mockResolvedValue({ error: { message: "ex upd" } });
    const updateFn = vi.fn().mockReturnValue({ eq: updEq });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: resolveSelect, update: updateFn }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      updateEventExtra(buildFormData({ extraId: "ex1", kind: "tv", description: "TV" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?error=ex%20upd");
  });

  it("removeEventExtra deletes on success", async () => {
    const resolveMaybe = vi.fn().mockResolvedValue({
      data: { id: "ex1", event_id: "ev1", events: { organization_id: "org-1" } },
      error: null,
    });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    const delEq = vi.fn().mockResolvedValue({ error: null });
    const deleteFn = vi.fn().mockReturnValue({ eq: delEq });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: resolveSelect, delete: deleteFn }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      removeEventExtra(buildFormData({ extraId: "ex1" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?success=Extra%20removido.");
  });

  it("removeEventExtra rejects when extraId missing", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn() });
    await expect(
      removeEventExtra(buildFormData({ extraId: "" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events?error=Extra inválido.");
  });

  it("removeEventExtra redirects on DB error", async () => {
    const resolveMaybe = vi.fn().mockResolvedValue({
      data: { id: "ex1", event_id: "ev1", events: { organization_id: "org-1" } },
      error: null,
    });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    const delEq = vi.fn().mockResolvedValue({ error: { message: "ex del" } });
    const deleteFn = vi.fn().mockReturnValue({ eq: delEq });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: resolveSelect, delete: deleteFn }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      removeEventExtra(buildFormData({ extraId: "ex1" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?error=ex%20del");
  });

  // ════════════════════════════════════════════════════════════════
  // updateEventDetails — remaining branches
  // ════════════════════════════════════════════════════════════════

  it("updateEventDetails redirects when org missing", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({
      role: "admin",
      userId: "u",
      primaryOrganization: null,
    });
    await expect(
      updateEventDetails(buildFormData({ eventId: "ev1", name: "X", startDate: "2026-01-01" }))
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard?error=organization_not_found");
  });

  it("updateEventDetails rejects when eventId missing", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn() });
    await expect(
      updateEventDetails(buildFormData({ eventId: "", name: "X" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events?error=Evento inválido.");
  });

  it("updateEventDetails rejects when startDate missing", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn() });
    await expect(
      updateEventDetails(buildFormData({ eventId: "ev1", name: "X", startDate: "" }))
    ).rejects.toThrow(/Data%20de%20in%C3%ADcio%20%C3%A9%20obrigat%C3%B3ria/);
  });

  it("updateEventDetails redirects on update DB error", async () => {
    const fetchMaybe = vi
      .fn()
      .mockResolvedValue({ data: { organization_id: "org-1" }, error: null });
    const fetchSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: fetchMaybe }),
    });
    const updEq = vi.fn().mockResolvedValue({ error: { message: "upd fail" } });
    const updateFn = vi.fn().mockReturnValue({ eq: updEq });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: fetchSelect, update: updateFn }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      updateEventDetails(
        buildFormData({ eventId: "ev1", name: "X", startDate: "2026-01-01" })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/events/ev1?error=upd%20fail");
  });

  it("addEventDate redirects when org missing", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({
      role: "admin",
      userId: "u",
      primaryOrganization: null,
    });
    await expect(
      addEventDate(buildFormData({ eventId: "ev1", date: "2026-01-01" }))
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard?error=organization_not_found");
  });

  // ── org-missing guards for the remaining write actions ──────────
  it.each([
    ["updateEventDate", () => updateEventDate(buildFormData({ eventDateId: "d1" }))],
    ["removeEventDate", () => removeEventDate(buildFormData({ eventDateId: "d1" }))],
    [
      "updateEventDateTeamMember",
      () => updateEventDateTeamMember(buildFormData({ assignmentId: "a1" })),
    ],
    [
      "removeEventDateTeamMember",
      () => removeEventDateTeamMember(buildFormData({ assignmentId: "a1" })),
    ],
    ["addEventSpeaker", () => addEventSpeaker(buildFormData({ eventId: "ev1", name: "X" }))],
    ["updateEventSpeaker", () => updateEventSpeaker(buildFormData({ speakerId: "sp1" }))],
    ["removeEventSpeaker", () => removeEventSpeaker(buildFormData({ speakerId: "sp1" }))],
    [
      "addEventExtra",
      () => addEventExtra(buildFormData({ eventId: "ev1", kind: "tv", description: "X" })),
    ],
    ["updateEventExtra", () => updateEventExtra(buildFormData({ extraId: "ex1" }))],
    ["removeEventExtra", () => removeEventExtra(buildFormData({ extraId: "ex1" }))],
  ])("%s redirects when org missing", async (_name, run) => {
    mocks.getCurrentUserContext.mockResolvedValue({
      role: "admin",
      userId: "u",
      primaryOrganization: null,
    });
    await expect(run()).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard?error=organization_not_found"
    );
  });

  // ── setEventEquipmentBatch — remaining error branches ───────────
  function batchSupabase(overrides: {
    eventRow?: { data: unknown; error: unknown };
    equip?: { data: unknown; error: unknown };
    eventEquipmentBuilder?: () => unknown;
  }) {
    const eventMaybe = vi.fn().mockResolvedValue(
      overrides.eventRow ?? {
        data: { id: "ev1", organization_id: "org-1", status: "planning" },
        error: null,
      }
    );
    const eventSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: eventMaybe }),
    });
    const equipIn = vi.fn().mockResolvedValue(
      overrides.equip ?? { data: [{ id: "eq1", organization_id: "org-1" }], error: null }
    );
    const equipSelect = vi.fn().mockReturnValue({ in: equipIn });
    const defaultCurrentIs = vi.fn().mockResolvedValue({ data: [], error: null });
    const defaultCurrentSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ is: defaultCurrentIs }),
    });
    return {
      from: vi.fn((table: string) => {
        if (table === "events") return { select: eventSelect };
        if (table === "equipment") return { select: equipSelect };
        if (table === "event_equipment") {
          return overrides.eventEquipmentBuilder
            ? (overrides.eventEquipmentBuilder() as object)
            : { select: defaultCurrentSelect };
        }
        if (table === "event_dates") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        return {};
      }),
    };
  }

  it("setEventEquipmentBatch redirects when event belongs to another org", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      batchSupabase({
        eventRow: { data: { id: "ev1", organization_id: "other", status: "planning" }, error: null },
      })
    );
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    const fd = new FormData();
    fd.set("eventId", "ev1");
    fd.set("qty_eq1", "2");
    await expect(setEventEquipmentBatch(fd)).rejects.toThrow(
      "NEXT_REDIRECT:/events/ev1?error=Evento inválido."
    );
  });

  it("setEventEquipmentBatch redirects on equipment fetch error", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      batchSupabase({ equip: { data: null, error: { message: "eq fetch" } } })
    );
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    const fd = new FormData();
    fd.set("eventId", "ev1");
    fd.set("qty_eq1", "2");
    await expect(setEventEquipmentBatch(fd)).rejects.toThrow(
      "NEXT_REDIRECT:/events/ev1?error=eq%20fetch"
    );
  });

  it("setEventEquipmentBatch redirects on current rows fetch error", async () => {
    const currentIs = vi.fn().mockResolvedValue({ data: null, error: { message: "cur err" } });
    const currentSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ is: currentIs }),
    });
    mocks.createSupabaseAdminClient.mockReturnValue(
      batchSupabase({ eventEquipmentBuilder: () => ({ select: currentSelect }) })
    );
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    const fd = new FormData();
    fd.set("eventId", "ev1");
    fd.set("qty_eq1", "2");
    await expect(setEventEquipmentBatch(fd)).rejects.toThrow(
      "NEXT_REDIRECT:/events/ev1?error=cur%20err"
    );
  });

  it("setEventEquipmentBatch redirects on update error", async () => {
    const currentIs = vi.fn().mockResolvedValue({
      data: [{ id: "ee1", equipment_id: "eq1", variant_id: null, qty: 1 }],
      error: null,
    });
    const currentSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ is: currentIs }),
    });
    const updEq = vi.fn().mockResolvedValue({ error: { message: "upd err" } });
    const updateFn = vi.fn().mockReturnValue({ eq: updEq });
    mocks.createSupabaseAdminClient.mockReturnValue(
      batchSupabase({
        eventEquipmentBuilder: () => ({ select: currentSelect, update: updateFn }),
      })
    );
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    const fd = new FormData();
    fd.set("eventId", "ev1");
    fd.set("qty_eq1", "9"); // changed qty => update path
    await expect(setEventEquipmentBatch(fd)).rejects.toThrow(
      "NEXT_REDIRECT:/events/ev1?error=upd%20err"
    );
  });

  it("setEventEquipmentBatch redirects on delete error", async () => {
    const currentIs = vi.fn().mockResolvedValue({
      data: [{ id: "ee1", equipment_id: "eq1", variant_id: null, qty: 2 }],
      error: null,
    });
    const currentSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ is: currentIs }),
    });
    const delIn = vi.fn().mockResolvedValue({ error: { message: "del err" } });
    const deleteFn = vi.fn().mockReturnValue({ in: delIn });
    mocks.createSupabaseAdminClient.mockReturnValue(
      batchSupabase({
        eventEquipmentBuilder: () => ({ select: currentSelect, delete: deleteFn }),
      })
    );
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    const fd = new FormData();
    fd.set("eventId", "ev1");
    fd.set("qty_eq1", "0"); // delete path
    await expect(setEventEquipmentBatch(fd)).rejects.toThrow(
      "NEXT_REDIRECT:/events/ev1?error=del%20err"
    );
  });

  // ── resolver org-mismatch redirects ─────────────────────────────
  it("updateEventDateTeamMember redirects when assignment resolves to a different org", async () => {
    const resolveMaybe = vi.fn().mockResolvedValue({
      data: {
        id: "a1",
        event_date_id: "d1",
        event_dates: { event_id: "ev1", events: { organization_id: "other-org" } },
      },
      error: null,
    });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: resolveSelect }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      updateEventDateTeamMember(buildFormData({ assignmentId: "a1", role: "audio" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events?error=Atribuição inválida.");
  });

  it("updateEventExtra redirects when extra resolves to a different org", async () => {
    const resolveMaybe = vi.fn().mockResolvedValue({
      data: { id: "ex1", event_id: "ev1", events: { organization_id: "other-org" } },
      error: null,
    });
    const resolveSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: resolveMaybe }),
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: resolveSelect }),
    });
    mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
    await expect(
      updateEventExtra(buildFormData({ extraId: "ex1", kind: "tv", description: "TV" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events?error=Extra inválido.");
  });
});

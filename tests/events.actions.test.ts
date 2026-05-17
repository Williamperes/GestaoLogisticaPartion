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
vi.mock("@/lib/inventory", () => ({
  getEquipmentAvailability: vi.fn().mockResolvedValue(new Map()),
}));

import {
  createEvent,
  toggleChecklistItem,
  promoteToReadyToLoad,
  updateEventDetails,
  addEventDate,
  addEventDateTeamMember,
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
    ).rejects.toThrow("NEXT_REDIRECT:/events/event-1?success=Evento criado.");

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
    ).rejects.toThrow("NEXT_REDIRECT:/events/event-2?success=Evento criado.");

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
                  data: {
                    organization_id: "org-1",
                    start_date: "2025-06-15",
                    end_date: "2025-06-16",
                  },
                  error: null,
                }),
              }),
            }),
            update: updateFn,
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
    ).rejects.toThrow("NEXT_REDIRECT:/events/event-3?success=Evento criado.");

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
    ).rejects.toThrow("NEXT_REDIRECT:/events/event-9?success=Detalhes atualizados.");

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
    ).rejects.toThrow("NEXT_REDIRECT:/events/event-50?success=Data adicionada.");

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
    ).rejects.toThrow(/success=Pessoa adicionada/);

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
});

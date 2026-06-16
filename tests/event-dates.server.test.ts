import { beforeEach, describe, expect, it, vi } from "vitest";

import { chain, fakeSupabase } from "./helpers/supabaseMock";

const mocks = vi.hoisted(() => ({ createSupabaseAdminClient: vi.fn() }));

// `server-only` lança fora de um RSC; neutralizamos no ambiente de teste.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

import { listEventDates } from "@/lib/event-dates.server";

describe("listEventDates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("propaga erro do banco", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ event_dates: [() => chain({ data: null, error: new Error("db") })] })
    );
    await expect(listEventDates("ev-1")).rejects.toThrow("db");
  });

  it("retorna [] quando data é null", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ event_dates: [() => chain({ data: null, error: null })] })
    );
    expect(await listEventDates("ev-1")).toEqual([]);
  });

  it("mapeia datas e resolve displayName (membro > externo > travessão)", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        event_dates: [
          () =>
            chain({
              data: [
                {
                  id: "d-1",
                  event_id: "ev-1",
                  date: "2026-02-01",
                  position: 0,
                  event_start_time: "08:00",
                  event_end_time: "18:00",
                  notes: null,
                  event_date_team_members: [
                    {
                      id: "m-1",
                      event_date_id: "d-1",
                      team_member_id: "tm-1",
                      external_name: null,
                      role: "audio",
                      custom_role: null,
                      notes: null,
                      team_members: { id: "tm-1", name: "João" },
                    },
                    {
                      id: "m-2",
                      event_date_id: "d-1",
                      team_member_id: null,
                      external_name: "Freelancer",
                      role: "auxiliar",
                      custom_role: null,
                      notes: null,
                      team_members: null,
                    },
                    {
                      id: "m-3",
                      event_date_id: "d-1",
                      team_member_id: null,
                      external_name: null,
                      role: "outro",
                      custom_role: "DJ",
                      notes: null,
                      team_members: null,
                    },
                  ],
                },
              ],
              error: null,
            }),
        ],
      })
    );

    const [d] = await listEventDates("ev-1");
    expect(d).toMatchObject({ id: "d-1", date: "2026-02-01", eventStartTime: "08:00" });
    expect(d.teamMembers.map((m) => m.displayName)).toEqual(["João", "Freelancer", "—"]);
  });
});

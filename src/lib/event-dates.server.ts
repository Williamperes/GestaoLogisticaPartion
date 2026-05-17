import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { EventDate, EventTeamRole } from "@/lib/event-dates";

export async function listEventDates(eventId: string): Promise<EventDate[]> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("event_dates")
    .select(
      `
      id, event_id, date, position, event_start_time, event_end_time, notes,
      event_date_team_members (
        id, event_date_id, team_member_id, external_name, role, custom_role, notes,
        team_members (id, name)
      )
    `
    )
    .eq("event_id", eventId)
    .order("date", { ascending: true })
    .order("position", { ascending: true });

  if (error) throw error;

  return (
    data?.map((row) => {
      const team =
        (row.event_date_team_members as unknown as {
          id: string;
          event_date_id: string;
          team_member_id: string | null;
          external_name: string | null;
          role: EventTeamRole;
          custom_role: string | null;
          notes: string | null;
          team_members: { id: string; name: string } | null;
        }[]) ?? [];

      return {
        id: row.id,
        eventId: row.event_id,
        date: row.date,
        position: row.position,
        eventStartTime: row.event_start_time,
        eventEndTime: row.event_end_time,
        notes: row.notes,
        teamMembers: team.map((t) => {
          const teamMemberName = t.team_members?.name ?? null;
          return {
            id: t.id,
            eventDateId: t.event_date_id,
            teamMemberId: t.team_member_id,
            externalName: t.external_name,
            role: t.role,
            customRole: t.custom_role,
            notes: t.notes,
            teamMemberName,
            displayName: teamMemberName ?? t.external_name ?? "—",
          };
        }),
      };
    }) ?? []
  ) satisfies EventDate[];
}

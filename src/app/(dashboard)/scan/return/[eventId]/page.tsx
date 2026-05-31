import { notFound, redirect } from "next/navigation";

import { getCurrentUserContext } from "@/lib/auth/session";
import { getEventById } from "@/lib/events";
import { getTeamMemberByUserId, teamMemberHasEventAccess } from "@/lib/team";

import { ReturnScanClient } from "./ReturnScanClient";

export default async function ScanReturnPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const [event, context] = await Promise.all([
    getEventById(eventId),
    getCurrentUserContext(),
  ]);
  if (!event) notFound();

  if (context?.role === "warehouse" && context.userId && context.primaryOrganization?.id) {
    const member = await getTeamMemberByUserId(
      context.userId,
      context.primaryOrganization.id
    );
    const allowed = member ? await teamMemberHasEventAccess(member.id, eventId) : false;
    if (!allowed) redirect("/events?error=Sem acesso a esta OS.");
  }

  const items = event.equipment
    .filter((e) => (e.loadedUnitsCount ?? 0) > 0)
    .map((e) => ({
      id: e.id,
      equipmentName: e.equipmentName,
      variantLabel: e.variantLabel,
      loadedUnitsCount: e.loadedUnitsCount,
      returnedUnitsCount: e.returnedUnitsCount,
    }));

  return (
    <>
      <header className="mb-3">
        <h1 className="text-lg font-semibold">Retornar — {event.name}</h1>
        <p className="text-xs text-muted-foreground">
          Bipe cada equipamento ao devolver ao estoque.
        </p>
      </header>
      <ReturnScanClient eventId={eventId} initialItems={items} />
    </>
  );
}

import { notFound, redirect } from "next/navigation";

import { getCurrentUserContext } from "@/lib/auth/session";
import { getEventById } from "@/lib/events";
import { getTeamMemberByUserId, teamMemberHasEventAccess } from "@/lib/team";

import { LoadScanClient } from "./LoadScanClient";

export default async function ScanLoadPage({ params }: { params: Promise<{ eventId: string }> }) {
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

  const items = event.equipment.map((e) => ({
    id: e.id,
    equipmentName: e.equipmentName,
    variantLabel: e.variantLabel,
    qty: e.qty,
    loadedUnitsCount: e.loadedUnitsCount,
  }));

  return (
    <>
      <header className="mb-3">
        <h1 className="text-lg font-semibold">Carregar — {event.name}</h1>
        <p className="text-xs text-muted-foreground">
          Bipe cada equipamento ao carregar no veículo.
        </p>
      </header>

      <LoadScanClient eventId={eventId} eventStatus={event.status} initialItems={items} />
    </>
  );
}

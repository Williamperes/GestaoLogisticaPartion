import { notFound, redirect } from "next/navigation";

import { getCurrentUserContext } from "@/lib/auth/session";
import { getEventById } from "@/lib/events";
import { getTeamMemberByUserId, teamMemberHasEventAccess } from "@/lib/team";

import { ReturnScanClient } from "./ReturnScanClient";

const RETURN_FINALIZE_ROLES = new Set(["super_admin", "admin", "operations", "warehouse"]);

export default async function ScanReturnPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const [event, context] = await Promise.all([
    getEventById(eventId),
    getCurrentUserContext(),
  ]);
  if (!event) notFound();

  const organizationId = context?.primaryOrganization?.id;
  if (!organizationId || event.organizationId !== organizationId) {
    redirect("/events?error=Sem acesso a esta OS.");
  }

  let canReturnBulk = false;
  if (context.role === "warehouse" && context.userId) {
    const member = await getTeamMemberByUserId(
      context.userId,
      organizationId
    );
    const allowed = member ? await teamMemberHasEventAccess(member.id, eventId) : false;
    if (!allowed) redirect("/events?error=Sem acesso a esta OS.");
    canReturnBulk = true;
  }
  const canFinalizeReturn = context.role ? RETURN_FINALIZE_ROLES.has(context.role) : false;

  const items = event.equipment
    .filter((e) => (e.loadedUnitsCount ?? 0) > 0)
    .map((e) => ({
      id: e.id,
      equipmentName: e.equipmentName,
      variantLabel: e.variantLabel,
      equipmentType: e.equipmentType,
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
      <ReturnScanClient
        eventId={eventId}
        eventStatus={event.status}
        initialItems={items}
        canReturnSerialized={canFinalizeReturn}
        canReturnBulk={canReturnBulk}
        canFinalizeReturn={canFinalizeReturn}
      />
    </>
  );
}

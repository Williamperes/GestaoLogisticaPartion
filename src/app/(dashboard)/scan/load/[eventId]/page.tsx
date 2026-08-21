import { notFound, redirect } from "next/navigation";

import { getCurrentUserContext } from "@/lib/auth/session";
import { getEventById } from "@/lib/events";
import {
  listExtraMaterialCandidates,
  listExtraMaterialLog,
  type ExtraMaterialCandidate,
  type ExtraMaterialLog,
} from "@/lib/extra-material";
import { getTeamMemberByUserId, teamMemberHasEventAccess } from "@/lib/team";

import { LoadScanClient } from "./LoadScanClient";

const LOAD_ROLES = new Set(["super_admin", "admin", "operations", "warehouse"]);

export default async function ScanLoadPage({ params }: { params: Promise<{ eventId: string }> }) {
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

  let extraCandidates: ExtraMaterialCandidate[] = [];
  let initialExtraLog: ExtraMaterialLog[] = [];
  let warehouseHasAccess = false;
  if (context?.role === "warehouse" && context.userId) {
    const member = await getTeamMemberByUserId(
      context.userId,
      organizationId
    );
    const allowed = member ? await teamMemberHasEventAccess(member.id, eventId) : false;
    if (!allowed) redirect("/events?error=Sem acesso a esta OS.");
    warehouseHasAccess = true;

    [extraCandidates, initialExtraLog] = await Promise.all([
      listExtraMaterialCandidates(eventId, organizationId),
      listExtraMaterialLog(eventId, organizationId),
    ]);
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

      <LoadScanClient
        eventId={eventId}
        eventStatus={event.status}
        initialItems={items}
        canMutateLoad={Boolean(
          context?.role &&
          LOAD_ROLES.has(context.role) &&
          (context.role !== "warehouse" || warehouseHasAccess)
        )}
        role={context?.role ?? null}
        extraCandidates={extraCandidates}
        initialExtraLog={initialExtraLog}
      />
    </>
  );
}

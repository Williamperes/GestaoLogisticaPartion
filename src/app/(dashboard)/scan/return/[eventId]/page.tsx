import { notFound } from "next/navigation";

import { getEventById } from "@/lib/events";

import { ReturnScanClient } from "./ReturnScanClient";

export default async function ScanReturnPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await getEventById(eventId);
  if (!event) notFound();

  const pending = event.equipment
    .filter((e) => (e.loadedUnitsCount ?? 0) > (e.returnedUnitsCount ?? 0))
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
      <ReturnScanClient eventId={eventId} initialPending={pending} />
    </>
  );
}

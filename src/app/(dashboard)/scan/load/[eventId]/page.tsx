import { notFound } from "next/navigation";

import { getEventById } from "@/lib/events";

import { LoadScanClient } from "./LoadScanClient";

export default async function ScanLoadPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await getEventById(eventId);
  if (!event) notFound();

  const pending = event.equipment
    .filter((e) => (e.loadedUnitsCount ?? 0) < e.qty)
    .map((e) => ({
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

      <LoadScanClient eventId={eventId} initialPending={pending} />
    </>
  );
}

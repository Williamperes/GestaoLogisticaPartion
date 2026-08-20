"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Flag, Minus, Plus } from "lucide-react";
import { toast } from "sonner";

import type { EventStatus } from "@/lib/events";
import { scanFeedbackError, scanFeedbackSuccess } from "@/lib/scanFeedback";
import {
  finalizeReturn,
  manualReturnDefectUnit,
  manualReturnBulk,
  manualReturnUnit,
  manualUnreturnBulk,
  manualUnreturnUnit,
  scanReturnDefectUnit,
  scanReturnUnit,
  unscanReturnUnit,
  type DefectCondition,
} from "@/app/(dashboard)/scan/actions";

import { QrScanner } from "@/components/inventory/QrScanner";

interface Item {
  id: string;
  equipmentName: string;
  variantLabel: string | null;
  equipmentType: "serialized" | "bulk";
  loadedUnitsCount: number;
  returnedUnitsCount: number;
}

interface ReturnScanClientProps {
  eventId: string;
  eventStatus: EventStatus;
  initialItems: Item[];
  canReturnBulk?: boolean;
  canFinalizeReturn?: boolean;
}

type Mode = "return" | "defect" | "unreturn";

type DefectTarget = { kind: "scan"; qrCode: string } | { kind: "manual"; item: Item };

export function ReturnScanClient({
  eventId,
  eventStatus,
  initialItems,
  canReturnBulk = true,
  canFinalizeReturn = true,
}: ReturnScanClientProps) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const canonicalRef = useRef({ eventId, items: initialItems });
  const [mode, setMode] = useState<Mode>("return");
  const [busy, setBusy] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [defectTarget, setDefectTarget] = useState<DefectTarget | null>(null);
  const [defectCondition, setDefectCondition] = useState<DefectCondition>("damaged");
  const [defectNote, setDefectNote] = useState("");
  const completed = eventStatus === "completed";

  useEffect(() => {
    const previousCanonical = canonicalRef.current;
    canonicalRef.current = { eventId, items: initialItems };

    if (previousCanonical.eventId !== eventId) {
      setItems(initialItems);
      setDefectTarget(null);
      setMode("return");
      return;
    }

    const previousById = new Map(previousCanonical.items.map((item) => [item.id, item]));
    setItems((currentItems) => {
      const currentById = new Map(currentItems.map((item) => [item.id, item]));
      return initialItems.map((canonical) => {
        const previous = previousById.get(canonical.id);
        const current = currentById.get(canonical.id);
        const preserveLocal =
          previous && current && previous.returnedUnitsCount === canonical.returnedUnitsCount;
        const returnedUnitsCount = preserveLocal
          ? current.returnedUnitsCount
          : canonical.returnedUnitsCount;
        return {
          ...canonical,
          returnedUnitsCount: Math.min(
            canonical.loadedUnitsCount,
            Math.max(0, returnedUnitsCount)
          ),
        };
      });
    });
  }, [eventId, initialItems]);

  const { pending, done } = useMemo(() => {
    const pending: Item[] = [];
    const done: Item[] = [];
    for (const item of items) {
      if (item.returnedUnitsCount >= item.loadedUnitsCount) done.push(item);
      else pending.push(item);
    }
    return { pending, done };
  }, [items]);

  const totalLoaded = items.reduce((acc, i) => acc + i.loadedUnitsCount, 0);
  const totalReturned = items.reduce(
    (acc, i) => acc + Math.min(i.returnedUnitsCount, i.loadedUnitsCount),
    0
  );

  function applyDelta(eeId: string, delta: number) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === eeId
          ? { ...item, returnedUnitsCount: Math.max(0, item.returnedUnitsCount + delta) }
          : item
      )
    );
  }

  function applyReturnedCount(eeId: string, returnedUnitsCount: number) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === eeId
          ? {
              ...item,
              returnedUnitsCount: Math.min(
                item.loadedUnitsCount,
                Math.max(0, returnedUnitsCount)
              ),
            }
          : item
      )
    );
  }

  async function handleScan(text: string) {
    if (completed) return;
    if (mode === "defect") {
      setDefectTarget({ kind: "scan", qrCode: text });
      return;
    }
    const result =
      mode === "return"
        ? await scanReturnUnit(eventId, text)
        : await unscanReturnUnit(eventId, text);
    if (!result.ok) {
      scanFeedbackError();
      toast.error(result.error ?? "Erro");
      return;
    }
    scanFeedbackSuccess();
    if (result.eventEquipmentId) applyDelta(result.eventEquipmentId, mode === "return" ? 1 : -1);
    toast.success(mode === "return" ? `Retornado: ${text}` : `Removido: ${text}`);
  }

  async function submitDefect() {
    if (completed || !defectTarget || busy) return;
    setBusy(true);
    try {
      const result =
        defectTarget.kind === "scan"
          ? await scanReturnDefectUnit(eventId, defectTarget.qrCode, defectCondition, defectNote)
          : await manualReturnDefectUnit(eventId, defectTarget.item.id, defectCondition, defectNote);
      if (!result.ok) {
        scanFeedbackError();
        toast.error(result.error ?? "Erro");
        return;
      }
      scanFeedbackSuccess();
      if (result.eventEquipmentId) applyDelta(result.eventEquipmentId, 1);
      toast.success(defectCondition === "lost" ? "Marcado como perdido" : "Marcado como danificado");
      setDefectTarget(null);
      setDefectNote("");
      setDefectCondition("damaged");
    } finally {
      setBusy(false);
    }
  }

  async function handleManual(item: Item, delta: 1 | -1) {
    if (completed || busy || (item.equipmentType === "bulk" && !canReturnBulk)) return;
    setBusy(true);
    try {
      const result =
        item.equipmentType === "bulk"
          ? delta === 1
            ? await manualReturnBulk(eventId, item.id, 1)
            : await manualUnreturnBulk(eventId, item.id, 1)
          : delta === 1
          ? await manualReturnUnit(eventId, item.id)
          : await manualUnreturnUnit(eventId, item.id);
      if (!result.ok) {
        scanFeedbackError();
        toast.error(result.error ?? "Erro");
        return;
      }
      scanFeedbackSuccess();
      if (item.equipmentType === "bulk" && result.returnedUnitsCount !== undefined) {
        applyReturnedCount(item.id, result.returnedUnitsCount);
      } else {
        applyDelta(item.id, delta);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleFinalize() {
    if (!canFinalizeReturn || finalizing) return;
    setFinalizing(true);
    try {
      const result = await finalizeReturn(eventId);
      if (!result.ok) {
        toast.error(result.error ?? "Erro");
        return;
      }
      toast.success("OS concluída. Estoque liberado.");
      router.push(`/events/${eventId}`);
    } finally {
      setFinalizing(false);
    }
  }

  function Counter({ item }: { item: Item }) {
    if (completed || (item.equipmentType === "bulk" && !canReturnBulk)) {
      return (
        <span className="min-w-[2.75rem] text-center text-xs tabular-nums text-muted-foreground">
          {item.returnedUnitsCount}/{item.loadedUnitsCount}
        </span>
      );
    }

    return (
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => handleManual(item, -1)}
          disabled={busy || item.returnedUnitsCount <= 0}
          aria-label="Desbipar 1"
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:text-foreground disabled:opacity-30"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-[2.75rem] text-center text-xs tabular-nums text-muted-foreground">
          {item.returnedUnitsCount}/{item.loadedUnitsCount}
        </span>
        <button
          type="button"
          onClick={() => handleManual(item, 1)}
          disabled={busy || item.returnedUnitsCount >= item.loadedUnitsCount}
          aria-label="Bipar 1"
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:text-foreground disabled:opacity-30"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <>
      {!completed && (
        <>
          <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl border border-border bg-card p-1">
            <button
              type="button"
              onClick={() => setMode("return")}
              className={`rounded-lg py-1.5 text-xs font-semibold transition ${
                mode === "return" ? "bg-emerald-500/15 text-emerald-700" : "text-muted-foreground"
              }`}
            >
              Bipar
            </button>
            <button
              type="button"
              onClick={() => setMode("defect")}
              className={`rounded-lg py-1.5 text-xs font-semibold transition ${
                mode === "defect" ? "bg-amber-500/15 text-amber-700" : "text-muted-foreground"
              }`}
            >
              Defeito
            </button>
            <button
              type="button"
              onClick={() => setMode("unreturn")}
              className={`rounded-lg py-1.5 text-xs font-semibold transition ${
                mode === "unreturn" ? "bg-red-500/15 text-red-700" : "text-muted-foreground"
              }`}
            >
              Desbipar
            </button>
          </div>

          {mode === "defect" && (
            <p className="mb-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] font-medium text-amber-700">
              Bipe a unidade com defeito — você escolhe danificado ou perdido em seguida. O item sai de
              circulação e vai para a fila de manutenção.
            </p>
          )}

          <div
            className={
              mode === "unreturn"
                ? "rounded-2xl ring-2 ring-red-500/40 ring-offset-2 ring-offset-background"
                : mode === "defect"
                ? "rounded-2xl ring-2 ring-amber-500/40 ring-offset-2 ring-offset-background"
                : ""
            }
          >
            <QrScanner onResult={handleScan} onError={(e) => toast.error(e.message)} />
          </div>
        </>
      )}

      <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-xs">
        <span className="font-medium">Progresso</span>
        <span className="text-muted-foreground">
          {totalReturned}/{totalLoaded} unidades
        </span>
      </div>

      {pending.length > 0 && (
        <section className="mt-3 space-y-1.5">
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Pendentes
          </h2>
          <ul className="space-y-2">
            {pending.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 text-sm"
              >
                <span className="min-w-0 truncate">
                  {item.equipmentName}
                  {item.variantLabel ? ` · ${item.variantLabel}` : ""}
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  {!completed && item.equipmentType === "serialized" && (
                    <button
                      type="button"
                      onClick={() => setDefectTarget({ kind: "manual", item })}
                      aria-label="Marcar defeito"
                      title="Marcar defeito"
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/5 text-amber-600 transition hover:bg-amber-500/15"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <Counter item={item} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {done.length > 0 && (
        <section className="mt-4 space-y-1.5">
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-emerald-700">
            Retornados ({done.length})
          </h2>
          <ul className="space-y-2">
            {done.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2 truncate text-emerald-800">
                  <Check className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {item.equipmentName}
                    {item.variantLabel ? ` · ${item.variantLabel}` : ""}
                  </span>
                </span>
                <Counter item={item} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {pending.length === 0 && done.length > 0 && (
        <div className="mt-3 space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center">
          <p className="text-sm font-medium text-emerald-700">Tudo retornado.</p>
          {eventStatus === "completed" ? (
            <p className="text-xs font-medium text-muted-foreground">OS concluída ✓</p>
          ) : canFinalizeReturn ? (
            <button
              type="button"
              onClick={handleFinalize}
              disabled={finalizing || eventStatus !== "in_field"}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              <Flag className="h-4 w-4" />
              {finalizing
                ? "Concluindo..."
                : eventStatus === "in_field"
                ? "Finalizar OS — Concluída"
                : "Feche a carga (Em campo) primeiro"}
            </button>
          ) : null}
        </div>
      )}

      {items.length === 0 && (
        <p className="mt-3 rounded-xl border border-dashed border-border bg-card p-3 text-center text-sm text-muted-foreground">
          Nenhum equipamento carregado nesta OS.
        </p>
      )}

      {!completed && defectTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-4 shadow-xl">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-semibold">Registrar defeito</h3>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              {defectTarget.kind === "manual"
                ? defectTarget.item.equipmentName
                : `Unidade ${defectTarget.qrCode}`}
            </p>

            <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl border border-border bg-background p-1">
              <button
                type="button"
                onClick={() => setDefectCondition("damaged")}
                className={`rounded-lg py-1.5 text-xs font-semibold transition ${
                  defectCondition === "damaged"
                    ? "bg-amber-500/15 text-amber-700"
                    : "text-muted-foreground"
                }`}
              >
                Danificado
              </button>
              <button
                type="button"
                onClick={() => setDefectCondition("lost")}
                className={`rounded-lg py-1.5 text-xs font-semibold transition ${
                  defectCondition === "lost" ? "bg-red-500/15 text-red-700" : "text-muted-foreground"
                }`}
              >
                Perdido
              </button>
            </div>

            <textarea
              value={defectNote}
              onChange={(e) => setDefectNote(e.target.value)}
              placeholder="Observação (opcional): descreva o defeito…"
              rows={3}
              className="mb-3 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-amber-500/50"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setDefectTarget(null);
                  setDefectNote("");
                  setDefectCondition("damaged");
                }}
                disabled={busy}
                className="flex-1 rounded-lg border border-border bg-background py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submitDefect}
                disabled={busy}
                className="flex-1 rounded-lg bg-amber-600 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
              >
                {busy ? "Salvando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

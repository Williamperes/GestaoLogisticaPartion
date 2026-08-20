"use client";

import { useMemo, useState } from "react";
import { Boxes, PackagePlus, QrCode, Search } from "lucide-react";
import { toast } from "sonner";

import {
  registerExtraBulkMaterial,
  registerExtraSerializedMaterialByUnitId,
  registerExtraSerializedMaterial,
  type ExtraMaterialResult,
} from "@/app/(dashboard)/scan/actions";
import { QrScanner } from "@/components/inventory/QrScanner";
import { formatDateTimeBR } from "@/lib/dates";
import type {
  ExtraMaterialCandidate,
  ExtraMaterialLog,
  ExtraMaterialUnitCandidate,
} from "@/lib/extra-material";
import { scanFeedbackError, scanFeedbackSuccess } from "@/lib/scanFeedback";

interface ExtraMaterialPanelProps {
  eventId: string;
  candidates: ExtraMaterialCandidate[];
  initialLog: ExtraMaterialLog[];
}

function candidateLabel(candidate: ExtraMaterialCandidate): string {
  return candidate.variantLabel
    ? `${candidate.equipmentName} · ${candidate.variantLabel}`
    : candidate.equipmentName;
}

function unitLabel(unit: ExtraMaterialUnitCandidate): string {
  const identifiers = [
    unit.serial ? `Série ${unit.serial}` : null,
    unit.patrimony ? `Patrimônio ${unit.patrimony}` : null,
  ].filter((value): value is string => value !== null);
  return identifiers.length > 0 ? identifiers.join(" · ") : `Unidade ${unit.id}`;
}

export function ExtraMaterialPanel({
  eventId,
  candidates,
  initialLog,
}: ExtraMaterialPanelProps) {
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [selectedBulk, setSelectedBulk] = useState<ExtraMaterialCandidate | null>(null);
  const [selectedSerialized, setSelectedSerialized] = useState<ExtraMaterialCandidate | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [bulkQty, setBulkQty] = useState(1);
  const [optimisticLog, setOptimisticLog] = useState<ExtraMaterialLog[]>([]);
  const [busy, setBusy] = useState(false);

  const filteredCandidates = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
    if (!normalizedSearch) return candidates;
    return candidates.filter((candidate) =>
      candidateLabel(candidate).toLocaleLowerCase("pt-BR").includes(normalizedSearch)
    );
  }, [candidates, search]);

  const visibleLog = useMemo(() => {
    const canonicalIds = new Set(initialLog.map((entry) => entry.id));
    return [
      ...optimisticLog.filter((entry) => !canonicalIds.has(entry.id)),
      ...initialLog,
    ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [initialLog, optimisticLog]);

  function requireReason(): string | null {
    const cleanReason = reason.trim();
    if (cleanReason) return cleanReason;
    toast.error("Informe o motivo do material extra.");
    return null;
  }

  function prependCanonicalLog(
    candidate: ExtraMaterialCandidate | undefined,
    result: ExtraMaterialResult,
    cleanReason: string
  ): boolean {
    const { eventEquipmentId, equipmentId, logId, addedAt, addedQty } = result;
    if (
      !candidate ||
      !eventEquipmentId ||
      !equipmentId ||
      !logId ||
      !addedAt ||
      !addedQty ||
      addedQty <= 0
    ) {
      return false;
    }

    setOptimisticLog((current) => [
      {
        id: logId,
        eventEquipmentId,
        equipmentId,
        equipmentName: candidate.equipmentName,
        variantId: result.variantId ?? null,
        variantLabel: candidate.variantLabel,
        equipmentUnitId: result.unitId ?? null,
        qty: addedQty,
        reason: cleanReason,
        addedBy: result.addedBy ?? null,
        addedByName: "Você",
        createdAt: addedAt,
      },
      ...current,
    ]);
    return true;
  }

  function handleSuccessfulRegistration(
    result: ExtraMaterialResult,
    candidate: ExtraMaterialCandidate | undefined,
    cleanReason: string
  ) {
    if (result.addedQty === 0) {
      toast.info("Esta unidade já estava carregada nesta OS.");
      return;
    }

    if (!prependCanonicalLog(candidate, result, cleanReason)) {
      toast.error("Material registrado, mas o histórico ainda não foi atualizado.");
      return;
    }

    scanFeedbackSuccess();
    toast.success("Material extra registrado.");
  }

  async function handleSerializedScan(qrCode: string) {
    if (busy) return;
    const cleanReason = requireReason();
    if (!cleanReason) return;

    setBusy(true);
    try {
      const result = await registerExtraSerializedMaterial(eventId, qrCode, cleanReason);
      if (!result.ok) {
        scanFeedbackError();
        toast.error(result.error ?? "Não foi possível registrar o material extra.");
        return;
      }

      const candidate = candidates.find(
        (item) =>
          item.equipmentId === result.equipmentId &&
          item.variantId === result.variantId &&
          item.equipmentType === "serialized"
      );
      handleSuccessfulRegistration(result, candidate, cleanReason);
    } catch {
      scanFeedbackError();
      toast.error("Não foi possível registrar o material extra.");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !selectedBulk) return;
    const cleanReason = requireReason();
    if (!cleanReason) return;
    if (!Number.isSafeInteger(bulkQty) || bulkQty <= 0 || bulkQty > selectedBulk.availableQty) {
      toast.error("Informe uma quantidade disponível válida.");
      return;
    }

    setBusy(true);
    try {
      const result = await registerExtraBulkMaterial({
        eventId,
        equipmentId: selectedBulk.equipmentId,
        variantId: selectedBulk.variantId,
        qty: bulkQty,
        reason: cleanReason,
      });
      if (!result.ok) {
        scanFeedbackError();
        toast.error(result.error ?? "Não foi possível registrar o material extra.");
        return;
      }

      handleSuccessfulRegistration(result, selectedBulk, cleanReason);
      setSelectedBulk(null);
      setBulkQty(1);
    } catch {
      scanFeedbackError();
      toast.error("Não foi possível registrar o material extra.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSerializedSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !selectedSerialized || !selectedUnitId) return;
    const cleanReason = requireReason();
    if (!cleanReason) return;

    setBusy(true);
    try {
      const result = await registerExtraSerializedMaterialByUnitId(
        eventId,
        selectedUnitId,
        cleanReason
      );
      if (!result.ok) {
        scanFeedbackError();
        toast.error(result.error ?? "Não foi possível registrar o material extra.");
        return;
      }

      const candidate = candidates.find(
        (item) =>
          item.equipmentId === result.equipmentId &&
          item.variantId === result.variantId &&
          item.equipmentType === "serialized"
      );
      handleSuccessfulRegistration(result, candidate, cleanReason);
      setSelectedSerialized(null);
      setSelectedUnitId("");
    } catch {
      scanFeedbackError();
      toast.error("Não foi possível registrar o material extra.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-xl border border-border bg-card p-3">
        <label htmlFor="extra-material-reason" className="text-sm font-semibold">
          Motivo do material extra
        </label>
        <textarea
          id="extra-material-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
          rows={3}
          placeholder="Ex.: cliente solicitou reforço no local"
          className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
        />
        <p className="text-xs text-muted-foreground">
          O mesmo motivo pode ser mantido para registrar vários itens do mesmo pedido.
        </p>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <QrCode className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Bipar unidade serializada</h2>
        </div>
        <div className={busy ? "pointer-events-none opacity-60" : ""} aria-busy={busy}>
          <QrScanner
            onResult={handleSerializedScan}
            onError={(error) => toast.error(error.message)}
          />
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Buscar no estoque</h2>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar material no estoque..."
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
          />
        </div>

        {filteredCandidates.length > 0 ? (
          <ul className="space-y-2" aria-label="Materiais disponíveis">
            {filteredCandidates.map((candidate) => {
              const key = `${candidate.equipmentId}:${candidate.variantId ?? "none"}`;
              return (
                <li
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{candidateLabel(candidate)}</p>
                    <p className="text-xs text-muted-foreground">
                      {candidate.availableQty} {candidate.unit} disponíveis ·{" "}
                      {candidate.equipmentType === "bulk" ? "lote" : "serializado"}
                    </p>
                  </div>
                  {candidate.equipmentType === "bulk" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBulk(candidate);
                        setSelectedSerialized(null);
                        setSelectedUnitId("");
                        setBulkQty(1);
                      }}
                      disabled={busy}
                      aria-label={`Selecionar ${candidateLabel(candidate)}`}
                      className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold transition hover:bg-muted disabled:opacity-50"
                    >
                      Selecionar
                    </button>
                  ) : candidate.availableUnits.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSerialized(candidate);
                        setSelectedUnitId("");
                        setSelectedBulk(null);
                        setBulkQty(1);
                      }}
                      disabled={busy}
                      aria-label={`Selecionar unidade de ${candidateLabel(candidate)}`}
                      className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold transition hover:bg-muted disabled:opacity-50"
                    >
                      Escolher unidade
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-3 text-center text-sm text-muted-foreground">
            Nenhum material disponível encontrado.
          </p>
        )}

        {selectedSerialized && (
          <form
            aria-label="Adicionar unidade serializada"
            onSubmit={handleSerializedSubmit}
            className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
          >
            <p className="text-sm font-semibold">{candidateLabel(selectedSerialized)}</p>
            <label htmlFor="extra-serialized-unit" className="block text-xs font-medium">
              Unidade de {candidateLabel(selectedSerialized)}
            </label>
            <select
              id="extra-serialized-unit"
              value={selectedUnitId}
              onChange={(event) => setSelectedUnitId(event.target.value)}
              required
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Selecione uma unidade</option>
              {selectedSerialized.availableUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unitLabel(unit)}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedSerialized(null);
                  setSelectedUnitId("");
                }}
                disabled={busy}
                className="flex-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy || !selectedUnitId}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
              >
                <PackagePlus className="h-4 w-4" />
                {busy ? "Adicionando..." : "Adicionar unidade"}
              </button>
            </div>
          </form>
        )}

        {selectedBulk && (
          <form
            aria-label="Adicionar material em lote"
            onSubmit={handleBulkSubmit}
            className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
          >
            <p className="text-sm font-semibold">{candidateLabel(selectedBulk)}</p>
            <label htmlFor="extra-bulk-qty" className="block text-xs font-medium">
              Quantidade de {candidateLabel(selectedBulk)}
            </label>
            <input
              id="extra-bulk-qty"
              type="number"
              min={1}
              max={selectedBulk.availableQty}
              step={1}
              value={bulkQty}
              onChange={(event) => setBulkQty(Number(event.target.value))}
              required
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedBulk(null);
                  setBulkQty(1);
                }}
                disabled={busy}
                className="flex-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
              >
                <PackagePlus className="h-4 w-4" />
                {busy ? "Adicionando..." : "Adicionar material"}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Materiais extras registrados
        </h2>
        {visibleLog.length > 0 ? (
          <ul
            className="space-y-2"
            aria-label="Histórico de materiais extras"
            aria-live="polite"
          >
            {visibleLog.map((entry) => (
              <li key={entry.id} className="rounded-xl border border-border bg-card p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">
                    {entry.equipmentName}
                    {entry.variantLabel ? ` · ${entry.variantLabel}` : ""}
                  </p>
                  <span className="shrink-0 text-xs font-semibold text-amber-600">
                    +{entry.qty}
                  </span>
                </div>
                <p className="mt-1 text-sm text-foreground">{entry.reason}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.addedByName ?? "Responsável não informado"} ·{" "}
                  {formatDateTimeBR(entry.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-border bg-card p-3 text-center text-sm text-muted-foreground">
            Nenhum material extra registrado nesta OS.
          </p>
        )}
      </section>
    </div>
  );
}

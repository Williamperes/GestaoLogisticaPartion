import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, ChevronRight, Package } from "lucide-react";

import { getCurrentUserContext } from "@/lib/auth/session";
import {
  getEquipmentById,
  getEquipmentAllocations,
  listEquipmentCategories,
  formatPurchaseValue,
} from "@/lib/inventory";
import { formatDateBR } from "@/lib/dates";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { QrCodeDisplay } from "@/components/inventory/QrCodeDisplay";
import { LinkQrButton } from "@/components/inventory/LinkQrButton";
import { deleteEquipmentUnit } from "@/app/(dashboard)/inventory/actions";

import { EditEquipmentSheet } from "@/app/(dashboard)/inventory/[id]/EditEquipmentSheet";
import { AddUnitSheet } from "@/app/(dashboard)/inventory/[id]/AddUnitSheet";
import { UnitStatusForm } from "@/app/(dashboard)/inventory/[id]/UnitStatusForm";
import { VariantManager } from "@/app/(dashboard)/inventory/[id]/VariantManager";
import { BulkAdjustDialog } from "@/app/(dashboard)/inventory/[id]/BulkAdjustDialog";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}

export default async function InventoryDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { success, error: errorMsg } = await searchParams;

  const context = await getCurrentUserContext();
  const equipment = await getEquipmentById(id);

  if (!equipment) redirect("/inventory");

  const [categories, allocations] = await Promise.all([
    context?.primaryOrganization?.id
      ? listEquipmentCategories(context.primaryOrganization.id)
      : Promise.resolve([]),
    getEquipmentAllocations(equipment.id),
  ]);

  const canWrite = ["super_admin", "admin", "operations", "warehouse"].includes(
    context?.role ?? ""
  );
  const canDelete = ["super_admin", "admin"].includes(context?.role ?? "");

  return (
    <div className="max-w-4xl space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/inventory" className="transition-colors hover:text-foreground">
          Inventário
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-foreground">{equipment.name}</span>
      </nav>

      {/* Toast messages */}
      {success && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-600">
          {decodeURIComponent(success)}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3 text-sm text-red-600">
          {decodeURIComponent(errorMsg)}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Package className="h-7 w-7 text-amber-600" />

          <div>
            <h1 className="text-2xl font-bold">{equipment.name}</h1>
            <p className="text-sm text-muted-foreground">
              {equipment.categoryName ?? "Sem categoria"}
            </p>
          </div>
          <StatusBadge status={equipment.status} type="item" />
        </div>
        {canWrite && (
          <EditEquipmentSheet
            equipment={equipment}
            categories={categories}
            canDelete={canDelete}
          />
        )}
      </div>

      {/* Info card */}
      <div className="rounded-xl border border-border bg-card p-5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
          {equipment.brand && (
            <div>
              <dt className="text-xs text-muted-foreground">Marca</dt>
              <dd className="mt-0.5 font-medium">{equipment.brand}</dd>
            </div>
          )}
          {equipment.model && (
            <div>
              <dt className="text-xs text-muted-foreground">Modelo</dt>
              <dd className="mt-0.5 font-medium">{equipment.model}</dd>
            </div>
          )}
          {equipment.type === "serialized" && equipment.serial && (
            <div>
              <dt className="text-xs text-muted-foreground">Serial</dt>
              <dd className="mt-0.5 font-mono font-medium">{equipment.serial}</dd>
            </div>
          )}
          {equipment.patrimony && (
            <div>
              <dt className="text-xs text-muted-foreground">Patrimônio</dt>
              <dd className="mt-0.5 font-mono font-medium">{equipment.patrimony}</dd>
            </div>
          )}
          {equipment.purchaseDate && (
            <div>
              <dt className="text-xs text-muted-foreground">Aquisição</dt>
              <dd className="mt-0.5 font-medium">
                {formatDateBR(equipment.purchaseDate)}
              </dd>
            </div>
          )}
          {equipment.purchaseValueCents != null && (
            <div>
              <dt className="text-xs text-muted-foreground">Valor</dt>
              <dd className="mt-0.5 font-medium">
                {formatPurchaseValue(equipment.purchaseValueCents)}
              </dd>
            </div>
          )}
          {equipment.qrCode && (
            <div>
              <dt className="text-xs text-muted-foreground">QR Token</dt>
              <dd className="mt-0.5 font-mono text-xs">{equipment.qrCode}</dd>
            </div>
          )}
        </dl>
        {equipment.notes && (
          <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
            {equipment.notes}
          </p>
        )}
      </div>

      {/* Variantes (renderiza só quando o equipamento tem variantes) */}
      {equipment.hasVariants && (
        <VariantManager
          equipmentId={equipment.id}
          equipmentType={equipment.type}
          variants={equipment.variants ?? []}
          canWrite={canWrite}
        />
      )}

      {/* Bulk sem variantes: card de estoque + ajustar */}
      {equipment.type === "bulk" && !equipment.hasVariants && equipment.bulk && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">Estoque do lote</h2>
              <p className="mt-2 text-2xl font-bold">
                <span className="font-mono">{equipment.bulk.availableQty}</span>
                <span className="text-muted-foreground"> / {equipment.bulk.totalQty}</span>{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  {equipment.bulk.unit}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Disponível / Total
              </p>
            </div>
            {canWrite && <BulkAdjustDialog equipment={equipment} />}
          </div>
        </div>
      )}

      {/* Bulk sem variantes e sem registro de estoque: aviso */}
      {equipment.type === "bulk" && !equipment.hasVariants && !equipment.bulk && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 px-5 py-4 text-sm text-amber-700">
          Este lote ainda não tem estoque cadastrado.
        </div>
      )}

      {/* Serialized: units table */}
      {equipment.type === "serialized" && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <h2 className="text-sm font-semibold">
              Unidades ({equipment.units.length})
            </h2>
            {canWrite && (
              <AddUnitSheet
                equipmentId={equipment.id}
                variants={equipment.hasVariants ? equipment.variants?.map((v) => ({ id: v.id, label: v.label })) : undefined}
              />
            )}
          </div>
          {equipment.units.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              Nenhuma unidade cadastrada.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Serial
                  </th>
                  {equipment.hasVariants && (
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Variante
                    </th>
                  )}
                  <th className="hidden px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">
                    Patrimônio
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    QR Code
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Status
                  </th>
                  {canWrite && <th className="w-10 px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {equipment.units.map((unit) => (
                  <tr key={unit.id} className="group">
                    <td className="px-5 py-3 font-mono text-xs">
                      {unit.serial ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    {equipment.hasVariants && (
                      <td className="px-4 py-3 text-xs">
                        {(() => {
                          const variantLabel = equipment.variants?.find(
                            (v) => v.id === unit.variantId
                          )?.label;
                          return variantLabel ? (
                            <span className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-700">
                              {variantLabel}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          );
                        })()}
                      </td>
                    )}
                    <td className="hidden px-4 py-3 font-mono text-xs text-muted-foreground md:table-cell">
                      {unit.patrimony ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {unit.qrCode ? (
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                          <QrCodeDisplay value={unit.qrCode} size={40} />
                          <code className="hidden font-mono text-xs text-muted-foreground sm:inline">
                            {unit.qrCode}
                          </code>
                          {canWrite && (
                            <LinkQrButton
                              unitId={unit.id}
                              unitSerial={unit.serial ?? "unidade sem série"}
                              isLinked={!!unit.qrLinkedAt}
                            />
                          )}
                        </div>
                      ) : canWrite ? (
                        <LinkQrButton unitId={unit.id} unitSerial={unit.serial ?? "unidade sem série"} />
                      ) : (
                        <span className="text-xs italic text-muted-foreground">
                          Sem QR
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {canWrite ? (
                        <UnitStatusForm
                          unitId={unit.id}
                          equipmentId={equipment.id}
                          currentStatus={unit.status}
                        />
                      ) : (
                        <StatusBadge status={unit.status} type="item" />
                      )}
                    </td>
                    {canWrite && (
                      <td className="px-4 py-3">
                        <DeleteConfirmDialog
                          action={deleteEquipmentUnit}
                          itemId={unit.id}
                          itemName={unit.serial ?? "unidade sem série"}
                          itemLabel="unidade"
                          hiddenFieldName="unitId"
                          title="Remover unidade"
                          description="Esta ação remove a unidade permanentemente e não pode ser desfeita."
                          confirmLabel="Remover"
                          pendingLabel="Removendo..."
                          render={
                            <button
                              type="button"
                              className="rounded-md p-1 text-muted-foreground/40 opacity-0 transition-all hover:text-red-600 group-hover:opacity-100"
                            />
                          }
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14H6L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4h6v2" />
                          </svg>
                        </DeleteConfirmDialog>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* OSes alocando este equipamento (status ativo) */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <CalendarClock className="h-4 w-4 text-amber-600" />
            Em uso por OS ({allocations.length})
          </h2>
        </div>
        {allocations.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            Nenhuma OS ativa está usando este equipamento.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  OS
                </th>
                <th className="hidden px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">
                  Período
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Variante
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Qtd
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {allocations.map((a) => (
                <tr
                  key={`${a.eventId}:${a.variantId ?? "none"}`}
                  className="group transition-colors hover:bg-black/2"
                >
                  <td className="px-5 py-3">
                    <Link
                      href={`/events/${a.eventId}`}
                      className="font-medium transition-colors group-hover:text-amber-600"
                    >
                      {a.eventName}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-muted-foreground md:table-cell">
                    {formatDateBR(a.startDate)}
                    {a.endDate !== a.startDate && <> — {formatDateBR(a.endDate)}</>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {a.variantLabel ? (
                      <span className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-700">
                        {a.variantLabel}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{a.qty}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={a.eventStatus} type="event" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}

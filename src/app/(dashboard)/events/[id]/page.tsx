import { notFound } from "next/navigation";
import Link from "next/link";
import {
  MapPin,
  Users,
  CheckCircle2,
  Clock,
  ChevronRight,
  Truck,
  Lock,
  Package,
  CornerDownLeft,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { getEventById, getGateProgress, isChecklistComplete } from "@/lib/events";
import { listEquipment } from "@/lib/inventory";
import { getCurrentUserContext } from "@/lib/auth/session";
import {
  toggleChecklistItem,
  promoteToReadyToLoad,
  removeEquipmentFromEvent,
} from "@/app/(dashboard)/events/actions";

import { AddEquipmentSheet } from "@/app/(dashboard)/events/[id]/AddEquipmentSheet";

interface EventDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}

export default async function EventDetailPage({ params, searchParams }: EventDetailPageProps) {
  const { id } = await params;
  const { success, error: errorMsg } = await searchParams;

  const [event, context] = await Promise.all([
    getEventById(id),
    getCurrentUserContext(),
  ]);

  if (!event) notFound();

  const checklistDone = event.checklist.filter((c) => c.done).length;
  const gateProgress = getGateProgress(event.checklist);
  const checklistComplete = isChecklistComplete(event.checklist);
  const isReadyToLoad = event.status === "ready_to_load";
  const equipmentLocked = event.status === "planning";

  const canManageChecklist = ["super_admin", "admin", "operations", "warehouse"].includes(
    context?.role ?? ""
  );
  const canPromote = ["super_admin", "admin", "operations"].includes(context?.role ?? "");
  const canEditEquipment = canPromote && isReadyToLoad;

  const organizationId = context?.primaryOrganization?.id;
  const allEquipment = canEditEquipment && organizationId
    ? await listEquipment(organizationId)
    : [];

  return (
    <div className="max-w-5xl space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap text-xs text-muted-foreground">
        <span>Eventos &amp; OS</span>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-foreground">{event.name}</span>
      </nav>

      {/* Toasts */}
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
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="flex-1">
          <div className="mb-1 flex flex-col gap-2 sm:flex-row sm:items-center">
            <h1 className="text-2xl font-bold">{event.name}</h1>
            <StatusBadge status={event.status} type="event" />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {event.clientName && (
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {event.clientName}
              </span>
            )}
            {event.venue && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {event.venue}
                {event.city ? `, ${event.city}` : ""}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {new Date(event.startDate).toLocaleDateString("pt-BR")}
              {event.endDate !== event.startDate &&
                ` — ${new Date(event.endDate).toLocaleDateString("pt-BR")}`}
            </span>
          </div>
          {event.venueNotes && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground/60">
              <MapPin className="h-3 w-3" />
              {event.venueNotes}
            </p>
          )}
        </div>

        {/* Gate widget */}
        <div
          className={`w-full shrink-0 rounded-xl border p-4 md:w-60 ${
            isReadyToLoad
              ? "border-emerald-500/30 bg-emerald-500/5"
              : gateProgress === 100
              ? "border-amber-500/30 bg-amber-500/5"
              : "border-border bg-card"
          }`}
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Gate de Produção
            </p>
            {isReadyToLoad ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <Clock className="h-4 w-4 text-amber-600" />
            )}
          </div>
          <p
            className={`mb-2 text-2xl font-bold ${
              isReadyToLoad ? "text-emerald-600" : gateProgress === 100 ? "text-amber-600" : "text-foreground"
            }`}
          >
            {gateProgress}%
          </p>
          <Progress value={gateProgress} className="h-1.5 bg-black/10" />
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            {checklistDone}/{event.checklist.length} itens do checklist
          </p>

          {isReadyToLoad && (
            <p className="mt-1 text-[10px] font-semibold text-emerald-600">
              ✓ Liberado para carga
            </p>
          )}

          {canPromote && checklistComplete && !isReadyToLoad && event.status === "planning" && (
            <form action={promoteToReadyToLoad} className="mt-3">
              <input type="hidden" name="eventId" value={event.id} />
              <SubmitButton
                idleLabel="Liberar para Carga"
                pendingLabel="Liberando..."
                className="h-8 w-full rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"
              />
            </form>
          )}
        </div>
      </div>

      <Tabs defaultValue="checklist">
        <TabsList className="max-w-full overflow-x-auto border border-border bg-card">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="checklist">
            Checklist
            {!checklistComplete && (
              <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">
                {event.checklist.length - checklistDone}
              </span>
            )}
            {checklistComplete && (
              <CheckCircle2 className="ml-1.5 h-3 w-3 text-emerald-600" />
            )}
          </TabsTrigger>
          <TabsTrigger value="equipment">
            Equipamentos
            {equipmentLocked && <Lock className="ml-1.5 h-3 w-3 text-muted-foreground/50" />}
            {!equipmentLocked && (
              <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">
                {event.equipment.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── TAB: Visão Geral ── */}
        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-3xl font-bold">{event.equipment.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">Equipamentos</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-3xl font-bold">{checklistDone}</p>
              <p className="mt-1 text-xs text-muted-foreground">Itens concluídos</p>
            </div>
            <div
              className={`rounded-xl border p-4 text-center ${
                isReadyToLoad
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-border bg-card"
              }`}
            >
              <p className={`text-3xl font-bold ${isReadyToLoad ? "text-emerald-600" : "text-muted-foreground"}`}>
                {isReadyToLoad ? "✓" : "—"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {isReadyToLoad ? "Carga liberada" : "Aguardando gate"}
              </p>
            </div>
          </div>
          {event.clientName && (
            <div className="mt-4 rounded-xl border border-border bg-card p-4">
              <p className="mb-1 text-sm font-semibold">Cliente</p>
              <p className="text-sm">{event.clientName}</p>
            </div>
          )}
        </TabsContent>

        {/* ── TAB: Checklist Estratégico ── */}
        <TabsContent value="checklist" className="mt-4">
          {checklistComplete && !isReadyToLoad && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/8 px-4 py-3">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <p className="text-sm text-emerald-700">
                Checklist 100% concluído.{" "}
                {canPromote
                  ? 'Clique em "Liberar para Carga" no widget acima para avançar a OS.'
                  : "Aguardando aprovação para liberar a carga."}
              </p>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <ul className="divide-y divide-border">
              {event.checklist.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  {canManageChecklist ? (
                    <form action={toggleChecklistItem}>
                      <input type="hidden" name="itemId" value={item.id} />
                      <input type="hidden" name="eventId" value={event.id} />
                      <input type="hidden" name="done" value={item.done ? "false" : "true"} />
                      <button
                        type="submit"
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all ${
                          item.done
                            ? "bg-emerald-500/20 hover:bg-emerald-500/30"
                            : "border border-border bg-black/5 hover:border-amber-500/40 hover:bg-amber-500/10"
                        }`}
                        title={item.done ? "Desmarcar item" : "Marcar como concluído"}
                      >
                        {item.done && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                      </button>
                    </form>
                  ) : (
                    <div
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                        item.done ? "bg-emerald-500/20" : "border border-border bg-black/5"
                      }`}
                    >
                      {item.done && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                    </div>
                  )}

                  <span className={`flex-1 text-sm ${item.done ? "text-foreground" : "text-muted-foreground"}`}>
                    {item.label}
                  </span>

                  {item.done ? (
                    <span className="text-[10px] font-semibold text-emerald-600 sm:ml-auto">CONCLUÍDO</span>
                  ) : (
                    <span className="text-[10px] font-semibold text-amber-500 sm:ml-auto">PENDENTE</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </TabsContent>

        {/* ── TAB: Equipamentos ── */}
        <TabsContent value="equipment" className="mt-4">
          {equipmentLocked ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/5 py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10">
                <Lock className="h-6 w-6 text-amber-600" />
              </div>
              <p className="text-sm font-semibold text-amber-700">Lista de equipamentos bloqueada</p>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                Complete todos os{" "}
                <strong>
                  {event.checklist.length - checklistDone}{" "}
                  {event.checklist.length - checklistDone === 1 ? "item" : "itens"} pendente
                  {event.checklist.length - checklistDone === 1 ? "" : "s"}
                </strong>{" "}
                do Checklist Estratégico e libere a OS para o status{" "}
                <strong>Pronto para Carga</strong>.
              </p>
              <div className="mt-4 flex items-center gap-2">
                <Progress value={gateProgress} className="h-2 w-32 bg-amber-500/20" />
                <span className="text-xs font-medium text-amber-600">{gateProgress}%</span>
              </div>
            </div>
          ) : (
            <>
              {event.equipment.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16 text-center">
                  <Package className="mb-3 h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm font-medium text-muted-foreground">
                    {canEditEquipment
                      ? "Nenhum equipamento adicionado. Use o botão abaixo."
                      : "Nenhum equipamento adicionado à OS."}
                  </p>
                </div>
              ) : (
                <>
                  {isReadyToLoad && (
                    <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      <p className="text-xs font-medium text-emerald-700">
                        Gate liberado — Lista de equipamentos disponível para conferência.
                      </p>
                    </div>
                  )}
                  <div className="overflow-x-auto rounded-xl border border-border bg-card">
                    <table className="min-w-[640px] w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">
                            Item
                          </th>
                          <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground md:table-cell">
                            Serial / Qtd
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">
                            Confirmado
                          </th>
                          {canEditEquipment && <th className="w-10 px-4 py-3" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {event.equipment.map((eq) => (
                          <tr key={eq.id} className="group transition-colors hover:bg-black/2">
                            <td className="px-5 py-3.5 font-medium">{eq.equipmentName}</td>
                            <td className="hidden px-4 py-3.5 font-mono text-xs text-muted-foreground md:table-cell">
                              {eq.unitSerial ?? `${eq.qty} un`}
                            </td>
                            <td className="px-4 py-3.5">
                              {eq.confirmed ? (
                                <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Sim
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="h-3.5 w-3.5" /> Pendente
                                </span>
                              )}
                            </td>
                            {canEditEquipment && (
                              <td className="px-4 py-3.5">
                                <DeleteConfirmDialog
                                  action={removeEquipmentFromEvent}
                                  itemId={eq.id}
                                  itemName={eq.equipmentName}
                                  itemLabel="equipamento"
                                  hiddenFieldName="eventEquipmentId"
                                  title="Remover equipamento"
                                  description="Remove este equipamento da lista da OS."
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
                  </div>
                </>
              )}

              <div className="mt-3 flex items-center justify-between gap-2">
                <div>
                  {canEditEquipment && (
                    <AddEquipmentSheet
                      eventId={event.id}
                      equipment={allEquipment.map((e) => ({
                        id: e.id,
                        name: e.name,
                        type: e.type,
                      }))}
                    />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {event.status === "in_field" && (
                    <Link
                      href={`/checkin?eventId=${event.id}`}
                      className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-600 transition-all hover:bg-blue-500/20"
                    >
                      <CornerDownLeft className="h-4 w-4" />
                      Check-in de Retorno
                    </Link>
                  )}
                  {(event.status === "ready_to_load" || event.status === "in_field") && (
                    <Link
                      href={`/checkout?eventId=${event.id}`}
                      className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-all hover:bg-black/5 hover:text-foreground"
                    >
                      <Truck className="h-4 w-4" />
                      {event.status === "in_field" ? "Ver Checkout" : "Iniciar Checkout"}
                    </Link>
                  )}
                </div>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

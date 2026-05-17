"use client";

import { useState } from "react";
import {
  Pencil,
  CalendarDays,
  MapPin,
  Truck,
  Lightbulb,
  Building2,
  AlertTriangle,
  FileText,
} from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { updateEventDetails } from "@/app/(dashboard)/events/actions";
import type { ClientOrganization } from "@/lib/clients";
import type { EventDetail } from "@/lib/events";

const INPUT_CLASS =
  "w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10";
const LABEL_CLASS = "space-y-1.5";
const LABEL_TEXT_CLASS = "text-sm font-medium text-foreground";

// timestamptz → string aceita por input[type=datetime-local] (YYYY-MM-DDTHH:MM)
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  // ISO format like "2026-02-27T14:00:00+00:00" — strip seconds + tz
  const match = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return match ? `${match[1]}T${match[2]}` : "";
}

interface EditEventDetailsSheetProps {
  event: EventDetail;
  clients: ClientOrganization[];
}

export function EditEventDetailsSheet({ event, clients }: EditEventDetailsSheetProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button size="sm" variant="outline" className="rounded-xl" />
        }
      >
        <Pencil className="h-3.5 w-3.5" />
        Editar OS
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex w-full max-w-2xl flex-col border-l border-border bg-[color:color-mix(in_srgb,var(--card)_92%,white)] p-0"
      >
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle>Editar Ordem de Serviço</SheetTitle>
          <SheetDescription>
            Ajuste os dados básicos e operacionais da OS. Checklist, equipamentos e status são
            gerenciados em outros pontos.
          </SheetDescription>
        </SheetHeader>

        <form
          action={async (fd) => {
            await updateEventDetails(fd);
            setOpen(false);
          }}
          className="flex flex-1 flex-col overflow-y-auto"
        >
          <input type="hidden" name="eventId" value={event.id} />

          <div className="flex flex-col gap-5 px-6 py-6">
            <label className={LABEL_CLASS}>
              <span className={LABEL_TEXT_CLASS}>Nome do evento / OS *</span>
              <input
                name="name"
                required
                defaultValue={event.name}
                className={INPUT_CLASS}
              />
            </label>

            <label className={LABEL_CLASS}>
              <span className={LABEL_TEXT_CLASS}>Cliente</span>
              <select
                name="clientOrganizationId"
                defaultValue={event.clientOrganizationId ?? ""}
                className={INPUT_CLASS}
              >
                <option value="">— Sem cliente vinculado —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.city ? ` · ${c.city}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className={LABEL_CLASS}>
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Data de início *
                </span>
                <input
                  name="startDate"
                  type="date"
                  required
                  defaultValue={event.startDate}
                  className={INPUT_CLASS}
                />
              </label>
              <label className={LABEL_CLASS}>
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Data de encerramento
                </span>
                <input
                  name="endDate"
                  type="date"
                  defaultValue={event.endDate}
                  className={INPUT_CLASS}
                />
              </label>
            </div>

            <div className="grid gap-4 rounded-xl border border-border bg-card/50 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                Local do evento
              </p>
              <label className={LABEL_CLASS}>
                <span className={LABEL_TEXT_CLASS}>Venue / Local</span>
                <input
                  name="venue"
                  defaultValue={event.venue ?? ""}
                  className={INPUT_CLASS}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={LABEL_CLASS}>
                  <span className={LABEL_TEXT_CLASS}>Cidade</span>
                  <input
                    name="city"
                    defaultValue={event.city ?? ""}
                    className={INPUT_CLASS}
                  />
                </label>
                <label className={LABEL_CLASS}>
                  <span className={LABEL_TEXT_CLASS}>Observações de acesso</span>
                  <input
                    name="venueNotes"
                    defaultValue={event.venueNotes ?? ""}
                    className={INPUT_CLASS}
                  />
                </label>
              </div>
            </div>

            <div className="grid gap-4 rounded-xl border border-border bg-card/50 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Truck className="h-3.5 w-3.5" />
                Detalhes operacionais
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className={LABEL_CLASS}>
                  <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <Truck className="h-3.5 w-3.5" />
                    Veículo
                  </span>
                  <input
                    name="vehicle"
                    defaultValue={event.vehicle ?? ""}
                    placeholder="Ex.: Kombi Ilmar"
                    className={INPUT_CLASS}
                  />
                </label>
                <label className={LABEL_CLASS}>
                  <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <Lightbulb className="h-3.5 w-3.5" />
                    Cor da iluminação cênica
                  </span>
                  <input
                    name="lightingColor"
                    defaultValue={event.lightingColor ?? ""}
                    placeholder="Ex.: DMX"
                    className={INPUT_CLASS}
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className={LABEL_CLASS}>
                  <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Montagem
                  </span>
                  <input
                    name="assemblyAt"
                    type="datetime-local"
                    defaultValue={toLocalInput(event.assemblyAt)}
                    className={INPUT_CLASS}
                  />
                </label>
                <label className={LABEL_CLASS}>
                  <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Desmontagem
                  </span>
                  <input
                    name="teardownAt"
                    type="datetime-local"
                    defaultValue={toLocalInput(event.teardownAt)}
                    className={INPUT_CLASS}
                  />
                </label>
              </div>

              <label className={LABEL_CLASS}>
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Building2 className="h-3.5 w-3.5" />
                  Agência envolvida
                </span>
                <input
                  name="agencyName"
                  defaultValue={event.agencyName ?? ""}
                  placeholder="Nome da agência (deixe em branco se não houver)"
                  className={INPUT_CLASS}
                />
              </label>
            </div>

            <fieldset className="rounded-xl border border-border bg-card/50 p-4">
              <legend className="flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5" />
                Flags de risco / logística
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <CheckLabel
                  name="executivePresent"
                  label="Diretoria / CEO presente"
                  defaultChecked={event.executivePresent}
                />
                <CheckLabel
                  name="isRecorded"
                  label="Evento gravado"
                  defaultChecked={event.isRecorded}
                />
                <CheckLabel
                  name="isLivestreamed"
                  label="Transmissão ao vivo"
                  defaultChecked={event.isLivestreamed}
                />
                <CheckLabel
                  name="clientDemanding"
                  label="Cliente exigente com estética"
                  defaultChecked={event.clientDemanding}
                />
                <CheckLabel
                  name="agencyDetailed"
                  label="Agência muito detalhista"
                  defaultChecked={event.agencyDetailed}
                />
                <CheckLabel
                  name="previousDayAssembly"
                  label="Montagem na véspera"
                  defaultChecked={event.previousDayAssembly}
                />
                <CheckLabel
                  name="requiresAdvanceCredential"
                  label="Credenciamento antecipado"
                  defaultChecked={event.requiresAdvanceCredential}
                />
                <CheckLabel
                  name="strictVenueHours"
                  label="Horário rígido (multa / corte de energia)"
                  defaultChecked={event.strictVenueHours}
                />
              </div>
            </fieldset>

            <label className={LABEL_CLASS}>
              <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <FileText className="h-3.5 w-3.5" />
                Observações
              </span>
              <textarea
                name="notes"
                rows={3}
                defaultValue={event.notes ?? ""}
                placeholder="Notas livres sobre a OS..."
                className={`${INPUT_CLASS} resize-y`}
              />
            </label>
          </div>

          <div className="mt-auto border-t border-border bg-background/60 px-6 py-4">
            <SubmitButton
              idleLabel="Salvar alterações"
              pendingLabel="Salvando..."
              className="h-11 w-full rounded-2xl text-sm font-semibold"
            />
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function CheckLabel({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-amber-500/5">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-border accent-amber-500"
      />
      <span>{label}</span>
    </label>
  );
}

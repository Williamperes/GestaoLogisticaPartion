"use client";

import {
  Plus,
  CalendarDays,
  MapPin,
  ListChecks,
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
import { createEvent } from "@/app/(dashboard)/events/actions";
import type { ClientOrganization } from "@/lib/clients";
import type { ChecklistTemplate } from "@/lib/checklist-templates";

const INPUT_CLASS =
  "w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10";
const LABEL_CLASS = "space-y-1.5";
const LABEL_TEXT_CLASS = "text-sm font-medium text-foreground";

interface EventSheetProps {
  clients: ClientOrganization[];
  templates: ChecklistTemplate[];
}

export function EventSheet({ clients, templates }: EventSheetProps) {
  const defaultTemplate = templates.find((t) => t.isDefault) ?? templates[0];
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold sm:w-auto" />
        }
      >
        <Plus className="h-4 w-4" />
        Nova OS
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex w-full max-w-2xl flex-col border-l border-border bg-[color:color-mix(in_srgb,var(--card)_92%,white)] p-0"
      >
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle>Nova Ordem de Serviço</SheetTitle>
          <SheetDescription>
            Preencha os dados básicos do evento. O checklist estratégico será criado automaticamente.
          </SheetDescription>
        </SheetHeader>

        <form action={createEvent} className="flex flex-1 flex-col overflow-y-auto">
          <div className="flex flex-col gap-5 px-6 py-6">
            {/* Nome do evento */}
            <label className={LABEL_CLASS}>
              <span className={LABEL_TEXT_CLASS}>Nome do evento / OS *</span>
              <input
                name="name"
                required
                placeholder="Ex.: Festival Aurora 2025"
                className={INPUT_CLASS}
              />
            </label>

            {/* Cliente */}
            <label className={LABEL_CLASS}>
              <span className={LABEL_TEXT_CLASS}>Cliente</span>
              <select name="clientOrganizationId" className={INPUT_CLASS}>
                <option value="">— Sem cliente vinculado —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.city ? ` · ${c.city}` : ""}
                  </option>
                ))}
              </select>
            </label>

            {/* Datas */}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={LABEL_CLASS}>
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Data de início *
                </span>
                <input name="startDate" type="date" required className={INPUT_CLASS} />
              </label>
              <label className={LABEL_CLASS}>
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Data de encerramento
                </span>
                <input name="endDate" type="date" className={INPUT_CLASS} />
              </label>
            </div>

            {/* Local */}
            <div className="grid gap-4 rounded-xl border border-border bg-card/50 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                Local do evento
              </p>
              <label className={LABEL_CLASS}>
                <span className={LABEL_TEXT_CLASS}>Venue / Local</span>
                <input
                  name="venue"
                  placeholder="Ex.: Arena Multiuso SP"
                  className={INPUT_CLASS}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={LABEL_CLASS}>
                  <span className={LABEL_TEXT_CLASS}>Cidade</span>
                  <input
                    name="city"
                    placeholder="Ex.: São Paulo"
                    className={INPUT_CLASS}
                  />
                </label>
                <label className={LABEL_CLASS}>
                  <span className={LABEL_TEXT_CLASS}>Observações de acesso</span>
                  <input
                    name="venueNotes"
                    placeholder="Portão B, 220V trifásico..."
                    className={INPUT_CLASS}
                  />
                </label>
              </div>
            </div>

            {/* Detalhes operacionais (opcional, recolhível) */}
            <details className="group rounded-xl border border-border bg-card/50">
              <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Truck className="h-3.5 w-3.5" />
                  Detalhes operacionais (opcional)
                </span>
                <span className="text-[10px] text-muted-foreground/70 group-open:hidden">
                  expandir
                </span>
                <span className="hidden text-[10px] text-muted-foreground/70 group-open:inline">
                  recolher
                </span>
              </summary>
              <div className="flex flex-col gap-4 border-t border-border px-4 py-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className={LABEL_CLASS}>
                    <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <Truck className="h-3.5 w-3.5" />
                      Veículo
                    </span>
                    <input
                      name="vehicle"
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
                      placeholder="Ex.: DMX, âmbar..."
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
                    placeholder="Nome da agência (deixe em branco se não houver)"
                    className={INPUT_CLASS}
                  />
                </label>

                <fieldset className="rounded-xl border border-border bg-background/40 p-3">
                  <legend className="flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Flags de risco / logística
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <CheckLabel name="executivePresent" label="Diretoria / CEO presente" />
                    <CheckLabel name="isRecorded" label="Evento gravado" />
                    <CheckLabel name="isLivestreamed" label="Transmissão ao vivo" />
                    <CheckLabel name="clientDemanding" label="Cliente exigente com estética" />
                    <CheckLabel name="agencyDetailed" label="Agência muito detalhista" />
                    <CheckLabel name="previousDayAssembly" label="Montagem na véspera" />
                    <CheckLabel
                      name="requiresAdvanceCredential"
                      label="Credenciamento antecipado"
                    />
                    <CheckLabel
                      name="strictVenueHours"
                      label="Horário rígido (multa / corte de energia)"
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
                    placeholder="Notas livres sobre a OS..."
                    className={`${INPUT_CLASS} resize-y`}
                  />
                </label>
              </div>
            </details>

            {/* Template de checklist */}
            <label className={LABEL_CLASS}>
              <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <ListChecks className="h-3.5 w-3.5" />
                Template de Checklist
              </span>
              {templates.length === 0 ? (
                <>
                  <input type="hidden" name="templateId" value="" />
                  <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-700">
                    Nenhum template cadastrado. A OS será criada com o checklist mínimo embutido.
                    Configure templates em <strong>Configurações → Templates de Checklist</strong>.
                  </p>
                </>
              ) : (
                <select
                  name="templateId"
                  defaultValue={defaultTemplate?.id ?? ""}
                  className={INPUT_CLASS}
                >
                  <option value="">— Checklist mínimo embutido —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.isDefault ? " · padrão" : ""} · {t.requiredCount} obrigatório
                      {t.requiredCount === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
              )}
            </label>
          </div>

          <div className="mt-auto border-t border-border bg-background/60 px-6 py-4">
            <SubmitButton
              idleLabel="Criar Ordem de Serviço"
              pendingLabel="Criando OS..."
              className="h-11 w-full rounded-2xl text-sm font-semibold"
            />
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function CheckLabel({ name, label }: { name: string; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-amber-500/5">
      <input
        type="checkbox"
        name={name}
        className="h-4 w-4 rounded border-border accent-amber-500"
      />
      <span>{label}</span>
    </label>
  );
}

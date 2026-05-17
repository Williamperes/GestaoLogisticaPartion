"use client";

import { useState } from "react";
import {
  Plus,
  Pencil,
  CalendarDays,
  Clock,
  Users,
  UserPlus,
  StickyNote,
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
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import {
  addEventDate,
  updateEventDate,
  removeEventDate,
  addEventDateTeamMember,
  removeEventDateTeamMember,
} from "@/app/(dashboard)/events/actions";
import {
  EVENT_TEAM_ROLE_LABELS,
  EVENT_TEAM_ROLE_ORDER,
  formatEventTeamRole,
  type EventDate,
} from "@/lib/event-dates";
import { parseLocalDate } from "@/lib/dates";

const INPUT_CLASS =
  "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10";
const LABEL_CLASS = "space-y-1";
const LABEL_TEXT_CLASS = "text-xs font-medium text-muted-foreground";

interface TeamMemberOption {
  id: string;
  name: string;
  specialty: string | null;
}

interface EventDatesPanelProps {
  eventId: string;
  dates: EventDate[];
  teamMembers: TeamMemberOption[];
  canEdit: boolean;
}

function formatDateLabel(d: string): string {
  return parseLocalDate(d).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTimeRange(start: string | null, end: string | null): string {
  if (!start && !end) return "—";
  const s = start?.slice(0, 5) ?? "—";
  const e = end?.slice(0, 5) ?? "—";
  return `${s} – ${e}`;
}

export function EventDatesPanel({
  eventId,
  dates,
  teamMembers,
  canEdit,
}: EventDatesPanelProps) {
  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {dates.length === 0
              ? "Nenhuma data adicionada."
              : `${dates.length} ${dates.length === 1 ? "data" : "datas"} agendada${
                  dates.length === 1 ? "" : "s"
                }.`}
          </p>
          <AddEventDateSheet eventId={eventId} />
        </div>
      )}

      {dates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-10 text-center">
          <CalendarDays className="mb-2 h-7 w-7 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            Adicione as datas do evento e a escala de equipe por dia.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {dates.map((d) => (
            <EventDateCard
              key={d.id}
              date={d}
              teamMembers={teamMembers}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Card de uma data
// ──────────────────────────────────────────────────────────────────

function EventDateCard({
  date,
  teamMembers,
  canEdit,
}: {
  date: EventDate;
  teamMembers: TeamMemberOption[];
  canEdit: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <header className="flex flex-wrap items-center gap-2">
        <CalendarDays className="h-4 w-4 text-amber-600" />
        <p className="text-sm font-semibold capitalize">
          {formatDateLabel(date.date)}
        </p>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {formatTimeRange(date.eventStartTime, date.eventEndTime)}
        </span>
        {canEdit && (
          <div className="ml-auto flex items-center gap-1">
            <EditEventDateSheet date={date} />
            <DeleteConfirmDialog
              action={removeEventDate}
              itemId={date.id}
              itemName={formatDateLabel(date.date)}
              itemLabel="data"
              hiddenFieldName="eventDateId"
              title="Remover data"
              description="Remove esta data da OS. Toda a escala associada também será apagada."
              confirmLabel="Remover"
              pendingLabel="Removendo..."
              render={
                <button
                  type="button"
                  className="rounded-md p-1.5 text-muted-foreground/50 transition-colors hover:bg-red-500/10 hover:text-red-600"
                  title="Remover data"
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
          </div>
        )}
      </header>

      {date.notes && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <StickyNote className="mt-0.5 h-3 w-3 shrink-0" />
          {date.notes}
        </p>
      )}

      <div className="mt-3 border-t border-border pt-3">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Users className="h-3 w-3" />
          Escala
        </p>

        {date.teamMembers.length === 0 ? (
          <p className="text-xs text-muted-foreground/60">Nenhuma pessoa na escala.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {date.teamMembers.map((tm) => (
              <li
                key={tm.id}
                className="flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs"
              >
                <span className="font-medium">{tm.displayName}</span>
                <span className="text-[10px] text-muted-foreground">
                  · {formatEventTeamRole(tm.role, tm.customRole)}
                </span>
                {canEdit && (
                  <DeleteConfirmDialog
                    action={removeEventDateTeamMember}
                    itemId={tm.id}
                    itemName={tm.displayName}
                    itemLabel="pessoa da escala"
                    hiddenFieldName="assignmentId"
                    title="Remover pessoa da escala"
                    description={`Remove ${tm.displayName} desta data.`}
                    confirmLabel="Remover"
                    pendingLabel="Removendo..."
                    render={
                      <button
                        type="button"
                        className="text-muted-foreground/40 transition-colors hover:text-red-600"
                        title="Remover"
                      />
                    }
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </DeleteConfirmDialog>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <AddTeamMemberForm
            eventDateId={date.id}
            teamMembers={teamMembers}
          />
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Sheet: Adicionar / Editar data
// ──────────────────────────────────────────────────────────────────

function AddEventDateSheet({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button size="sm" className="rounded-xl" />}>
        <Plus className="h-3.5 w-3.5" />
        Adicionar data
      </SheetTrigger>
      <SheetContent
        side="right"
        className="flex w-full max-w-md flex-col border-l border-border bg-[color:color-mix(in_srgb,var(--card)_92%,white)] p-0"
      >
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle>Nova data do evento</SheetTitle>
          <SheetDescription>
            Cada data carrega seu próprio horário e escala de equipe.
          </SheetDescription>
        </SheetHeader>
        <form
          action={async (fd) => {
            await addEventDate(fd);
            setOpen(false);
          }}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5"
        >
          <input type="hidden" name="eventId" value={eventId} />
          <DateFormFields />
          <SubmitButton
            idleLabel="Adicionar"
            pendingLabel="Adicionando..."
            className="mt-auto h-10 w-full rounded-xl text-sm font-semibold"
          />
        </form>
      </SheetContent>
    </Sheet>
  );
}

function EditEventDateSheet({ date }: { date: EventDate }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            type="button"
            className="rounded-md p-1.5 text-muted-foreground/50 transition-colors hover:bg-amber-500/10 hover:text-amber-600"
            title="Editar data"
          />
        }
      >
        <Pencil className="h-3.5 w-3.5" />
      </SheetTrigger>
      <SheetContent
        side="right"
        className="flex w-full max-w-md flex-col border-l border-border bg-[color:color-mix(in_srgb,var(--card)_92%,white)] p-0"
      >
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle>Editar data</SheetTitle>
          <SheetDescription>
            Ajuste a data, horários e observações.
          </SheetDescription>
        </SheetHeader>
        <form
          action={async (fd) => {
            await updateEventDate(fd);
            setOpen(false);
          }}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5"
        >
          <input type="hidden" name="eventDateId" value={date.id} />
          <DateFormFields defaults={date} />
          <SubmitButton
            idleLabel="Salvar"
            pendingLabel="Salvando..."
            className="mt-auto h-10 w-full rounded-xl text-sm font-semibold"
          />
        </form>
      </SheetContent>
    </Sheet>
  );
}

function DateFormFields({ defaults }: { defaults?: EventDate }) {
  return (
    <>
      <label className={LABEL_CLASS}>
        <span className={LABEL_TEXT_CLASS}>Data *</span>
        <input
          type="date"
          name="date"
          required
          defaultValue={defaults?.date ?? ""}
          className={INPUT_CLASS}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className={LABEL_CLASS}>
          <span className={LABEL_TEXT_CLASS}>Início</span>
          <input
            type="time"
            name="eventStartTime"
            defaultValue={defaults?.eventStartTime?.slice(0, 5) ?? ""}
            className={INPUT_CLASS}
          />
        </label>
        <label className={LABEL_CLASS}>
          <span className={LABEL_TEXT_CLASS}>Término</span>
          <input
            type="time"
            name="eventEndTime"
            defaultValue={defaults?.eventEndTime?.slice(0, 5) ?? ""}
            className={INPUT_CLASS}
          />
        </label>
      </div>

      <label className={LABEL_CLASS}>
        <span className={LABEL_TEXT_CLASS}>Ordem</span>
        <input
          type="number"
          name="position"
          min={0}
          defaultValue={defaults?.position ?? 0}
          className={INPUT_CLASS}
        />
      </label>

      <label className={LABEL_CLASS}>
        <span className={LABEL_TEXT_CLASS}>Observações</span>
        <textarea
          name="notes"
          rows={2}
          defaultValue={defaults?.notes ?? ""}
          className={`${INPUT_CLASS} resize-y`}
        />
      </label>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────
// Form inline: adicionar pessoa na escala
// ──────────────────────────────────────────────────────────────────

function AddTeamMemberForm({
  eventDateId,
  teamMembers,
}: {
  eventDateId: string;
  teamMembers: TeamMemberOption[];
}) {
  const [role, setRole] = useState<string>("audio");
  const [pickFromList, setPickFromList] = useState<boolean>(teamMembers.length > 0);

  return (
    <details className="mt-3 rounded-lg border border-dashed border-border">
      <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
        <UserPlus className="h-3 w-3" />
        Adicionar pessoa
      </summary>
      <form
        action={addEventDateTeamMember}
        className="grid gap-2 border-t border-border px-3 py-3"
      >
        <input type="hidden" name="eventDateId" value={eventDateId} />

        {teamMembers.length > 0 && (
          <div className="flex gap-2 text-[11px]">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="__source"
                checked={pickFromList}
                onChange={() => setPickFromList(true)}
                className="h-3 w-3 accent-amber-500"
              />
              Da equipe
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="__source"
                checked={!pickFromList}
                onChange={() => setPickFromList(false)}
                className="h-3 w-3 accent-amber-500"
              />
              Nome livre
            </label>
          </div>
        )}

        {pickFromList && teamMembers.length > 0 ? (
          <select
            name="teamMemberId"
            required={pickFromList}
            className={INPUT_CLASS}
            defaultValue=""
          >
            <option value="" disabled>
              — Selecione —
            </option>
            {teamMembers.map((tm) => (
              <option key={tm.id} value={tm.id}>
                {tm.name}
                {tm.specialty ? ` · ${tm.specialty}` : ""}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            name="externalName"
            placeholder="Nome da pessoa"
            required={!pickFromList}
            className={INPUT_CLASS}
          />
        )}

        <div className="grid grid-cols-2 gap-2">
          <select
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className={INPUT_CLASS}
          >
            {EVENT_TEAM_ROLE_ORDER.map((r) => (
              <option key={r} value={r}>
                {EVENT_TEAM_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          {role === "outro" && (
            <input
              type="text"
              name="customRole"
              placeholder="Papel personalizado *"
              required
              className={INPUT_CLASS}
            />
          )}
        </div>

        <SubmitButton
          idleLabel="Adicionar"
          pendingLabel="Adicionando..."
          className="h-8 w-full rounded-lg text-xs font-semibold"
        />
      </form>
    </details>
  );
}

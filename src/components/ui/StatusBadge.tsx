import { cn } from "@/lib/utils";
import type { EventStatus } from "@/lib/events";
import type { ItemStatus } from "@/lib/mock-data";

const eventStatusMap: Record<EventStatus, { label: string; className: string }> = {
  planning: { label: "Planejamento", className: "bg-blue-500/15 text-blue-600 ring-1 ring-blue-500/30" },
  ready_to_load: { label: "Pronto p/ Carga", className: "bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/30" },
  in_field: { label: "Em Campo", className: "bg-amber-500/15 text-amber-600 ring-1 ring-amber-500/30" },
  completed: { label: "Concluído", className: "bg-black/8 text-muted-foreground ring-1 ring-border" },
  cancelled: { label: "Cancelado", className: "bg-red-500/15 text-red-600 ring-1 ring-red-500/30" },
};

const itemStatusMap: Record<ItemStatus, { label: string; dot: string; className: string }> = {
  available: { label: "Disponível", dot: "bg-emerald-400", className: "bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/30" },
  reserved: { label: "Reservado", dot: "bg-amber-400", className: "bg-amber-500/15 text-amber-600 ring-1 ring-amber-500/30" },
  maintenance: { label: "Manutenção", dot: "bg-red-400", className: "bg-red-500/15 text-red-600 ring-1 ring-red-500/30" },
  inactive: { label: "Inativo", dot: "bg-zinc-500", className: "bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/30" },
};

interface StatusBadgeProps {
  status: EventStatus | ItemStatus;
  type: "event" | "item";
  className?: string;
}

export function StatusBadge({ status, type, className }: StatusBadgeProps) {
  if (type === "event") {
    const config = eventStatusMap[status as EventStatus];
    return (
      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide", config.className, className)}>
        {config.label}
      </span>
    );
  }
  const config = itemStatusMap[status as ItemStatus];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide", config.className, className)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", config.dot)} />
      {config.label}
    </span>
  );
}

interface SpecialtyBadgeProps {
  specialty: string;
  className?: string;
}

const specialtyMap: Record<string, { label: string; className: string }> = {
  sound: { label: "Som", className: "bg-blue-500/15 text-blue-600" },
  light: { label: "Luz", className: "bg-amber-500/15 text-amber-600" },
  image: { label: "Imagem", className: "bg-indigo-500/15 text-indigo-600" },
};

const specialtyToneClasses = [
  "bg-blue-500/15 text-blue-600",
  "bg-amber-500/15 text-amber-600",
  "bg-emerald-500/15 text-emerald-600",
  "bg-red-500/15 text-red-600",
  "bg-indigo-500/15 text-indigo-600",
  "bg-zinc-500/15 text-zinc-500",
];

export function SpecialtyBadge({ specialty, className }: SpecialtyBadgeProps) {
  const normalizedSpecialty = specialty
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  const fixedConfig = specialtyMap[normalizedSpecialty];
  const fallbackIndex = normalizedSpecialty
    .split("")
    .reduce((accumulator, character) => accumulator + character.charCodeAt(0), 0) % specialtyToneClasses.length;
  const config = fixedConfig ?? {
    label: specialty,
    className: specialtyToneClasses[fallbackIndex],
  };

  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ring-current/20", config.className, className)}>
      {config.label}
    </span>
  );
}

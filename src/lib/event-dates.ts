// Pure types/labels/helpers — safe to import from client and server.
// Server-only fetchers live in `event-dates.server.ts`.

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

export type EventTeamRole =
  | "tecnico_responsavel"
  | "audio"
  | "luz"
  | "led"
  | "auxiliar"
  | "comercial"
  | "outro";

export const EVENT_TEAM_ROLE_LABELS: Record<EventTeamRole, string> = {
  tecnico_responsavel: "Técnico responsável",
  audio: "Operador de áudio",
  luz: "Operador de luz",
  led: "Operador de LED",
  auxiliar: "Auxiliar / carregador",
  comercial: "Comercial",
  outro: "Outro",
};

export const EVENT_TEAM_ROLE_ORDER: EventTeamRole[] = [
  "tecnico_responsavel",
  "audio",
  "luz",
  "led",
  "auxiliar",
  "comercial",
  "outro",
];

export interface EventDateTeamMember {
  id: string;
  eventDateId: string;
  teamMemberId: string | null;
  externalName: string | null;
  role: EventTeamRole;
  customRole: string | null;
  notes: string | null;
  // Populado via join (quando teamMemberId existe).
  teamMemberName: string | null;
  /** Nome efetivo a mostrar (teamMemberName ?? externalName). */
  displayName: string;
}

export interface EventDate {
  id: string;
  eventId: string;
  date: string;
  position: number;
  eventStartTime: string | null;
  eventEndTime: string | null;
  notes: string | null;
  teamMembers: EventDateTeamMember[];
}

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

export function formatEventTeamRole(
  role: EventTeamRole,
  customRole: string | null
): string {
  if (role === "outro" && customRole) return customRole;
  return EVENT_TEAM_ROLE_LABELS[role];
}


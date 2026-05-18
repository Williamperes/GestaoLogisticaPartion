// Pure types/labels for auxiliary event entities — safe to import
// from client components. Server-side queries live in `events.ts`.

export type EventExtraKind =
  | "generator"
  | "box_truss"
  | "tv"
  | "projector"
  | "stage"
  | "other";

export const EVENT_EXTRA_KIND_LABELS: Record<EventExtraKind, string> = {
  generator: "Gerador",
  box_truss: "Box truss",
  tv: "TV",
  projector: "Projetor",
  stage: "Palco",
  other: "Outro",
};

export interface EventSpeaker {
  id: string;
  eventId: string;
  name: string;
  organization: string | null;
  needsMic: boolean;
  needsNotebook: boolean;
  needsAdapter: boolean;
  needsDedicatedTech: boolean;
  notes: string | null;
  position: number;
}

export interface EventExtra {
  id: string;
  eventId: string;
  kind: EventExtraKind;
  description: string;
  qty: number;
  supplier: string | null;
  unitPriceCents: number | null;
  notes: string | null;
  position: number;
}

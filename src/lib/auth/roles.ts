export const APP_ROLES = [
  "super_admin",
  "admin",
  "operations",
  "warehouse",
  "finance",
  "client",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const DASHBOARD_AREAS = {
  operations: ["super_admin", "admin", "operations"],
  warehouse: ["super_admin", "admin", "warehouse"],
  admin: ["super_admin", "admin"],
  client: ["super_admin", "admin", "client"],
} as const satisfies Record<string, AppRole[]>;

export function canAccessArea(role: AppRole | null | undefined, area: keyof typeof DASHBOARD_AREAS) {
  if (!role) {
    return false;
  }

  return DASHBOARD_AREAS[area].includes(role);
}

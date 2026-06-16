import { describe, expect, it } from "vitest";

import { canAccessArea, DASHBOARD_AREAS, APP_ROLES } from "@/lib/auth/roles";

describe("canAccessArea", () => {
  it("nega quando o papel é nulo/indefinido", () => {
    expect(canAccessArea(null, "operations")).toBe(false);
    expect(canAccessArea(undefined, "admin")).toBe(false);
  });

  it("super_admin acessa todas as áreas", () => {
    for (const area of Object.keys(DASHBOARD_AREAS) as (keyof typeof DASHBOARD_AREAS)[]) {
      expect(canAccessArea("super_admin", area)).toBe(true);
    }
  });

  it("warehouse acessa warehouse mas não operations", () => {
    expect(canAccessArea("warehouse", "warehouse")).toBe(true);
    expect(canAccessArea("warehouse", "operations")).toBe(false);
  });

  it("client acessa apenas a área client", () => {
    expect(canAccessArea("client", "client")).toBe(true);
    expect(canAccessArea("client", "admin")).toBe(false);
    expect(canAccessArea("client", "operations")).toBe(false);
  });

  it("finance não acessa áreas restritas do dashboard", () => {
    expect(canAccessArea("finance", "admin")).toBe(false);
    expect(canAccessArea("finance", "operations")).toBe(false);
  });

  it("todo papel listado em uma área é um AppRole válido", () => {
    for (const roles of Object.values(DASHBOARD_AREAS)) {
      for (const role of roles) {
        expect(APP_ROLES).toContain(role);
      }
    }
  });
});

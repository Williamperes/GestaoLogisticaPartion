// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  getCurrentUserContext: vi.fn(async () => ({
    role: "employee",
    userId: "u1",
    primaryOrganization: { id: "org-1" },
  })),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUserContext: auth.getCurrentUserContext,
}));
vi.mock("@/lib/maintenance", () => ({
  listMaintenance: vi.fn(async () => []),
  formatUnitCondition: vi.fn(),
}));
vi.mock("@/app/(dashboard)/maintenance/ResolveButton", () => ({
  ResolveButton: () => null,
}));

import MaintenancePage from "@/app/(dashboard)/maintenance/page";

describe("MaintenancePage", () => {
  it("permite que employee consulte a fila", async () => {
    render(await MaintenancePage());
    expect(screen.getByRole("heading", { name: "Manutenção" })).toBeInTheDocument();
    expect(screen.getByText("Nenhum item na fila de manutenção.")).toBeInTheDocument();
  });
});

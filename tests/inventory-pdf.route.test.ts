import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUserContext: vi.fn(),
  listEquipment: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserContext: mocks.getCurrentUserContext,
}));

vi.mock("@/lib/inventory", async (original) => ({
  ...(await original<typeof import("@/lib/inventory")>()),
  listEquipment: mocks.listEquipment,
}));

import { GET } from "@/app/(dashboard)/inventory/pdf/route";

describe("GET /inventory/pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listEquipment.mockResolvedValue([]);
  });

  it("bloqueia perfil sem acesso ao inventário", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({
      role: "employee",
      userId: "employee-1",
      primaryOrganization: { id: "org-1" },
    });

    const response = await GET();

    expect(response.status).toBe(403);
  });

  it("entrega o inventário como arquivo PDF para administrador", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({
      role: "admin",
      userId: "admin-1",
      primaryOrganization: { id: "org-1" },
    });

    const response = await GET();
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="inventario-completo-\d{4}-\d{2}-\d{2}\.pdf"$/
    );
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});

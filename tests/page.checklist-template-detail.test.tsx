// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((u: string) => {
    throw new Error("REDIRECT:" + u);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserContext: vi.fn(),
}));

vi.mock("@/lib/checklist-templates", async (o) => ({
  ...(await o<typeof import("@/lib/checklist-templates")>()),
  getChecklistTemplate: vi.fn(),
}));

vi.mock("@/app/(dashboard)/settings/checklist-templates/[id]/TemplateHeaderForm", () => ({
  TemplateHeaderForm: () => null,
}));
vi.mock("@/app/(dashboard)/settings/checklist-templates/[id]/TemplateItemsEditor", () => ({
  TemplateItemsEditor: () => null,
}));

import TemplateDetailPage from "@/app/(dashboard)/settings/checklist-templates/[id]/page";
import { getCurrentUserContext } from "@/lib/auth/session";
import { getChecklistTemplate } from "@/lib/checklist-templates";

const getCtx = vi.mocked(getCurrentUserContext);
const getTpl = vi.mocked(getChecklistTemplate);

const adminCtx = {
  role: "admin",
  userId: "u1",
  primaryOrganization: { id: "org-1" },
} as never;

describe("TemplateDetailPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renderiza o template encontrado", async () => {
    getCtx.mockResolvedValue(adminCtx);
    getTpl.mockResolvedValue({
      id: "t1",
      name: "Template X",
      description: null,
      isDefault: true,
      organizationId: "org-1",
      items: [
        { id: "i1", section: "strategic", label: "A", required: true, position: 1 },
        { id: "i2", section: "operational", label: "B", required: false, position: 2 },
      ],
    } as never);

    const ui = await TemplateDetailPage({
      params: Promise.resolve({ id: "t1" }),
      searchParams: Promise.resolve({}),
    });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByText("Template X")).toBeInTheDocument();
    expect(screen.getByText("Template padrão")).toBeInTheDocument();
  });

  it("chama notFound quando o template não existe", async () => {
    getCtx.mockResolvedValue(adminCtx);
    getTpl.mockResolvedValue(null as never);
    await expect(
      TemplateDetailPage({
        params: Promise.resolve({ id: "missing" }),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow(/NOT_FOUND/);
  });

  it("chama notFound quando o template é de outra organização", async () => {
    getCtx.mockResolvedValue(adminCtx);
    getTpl.mockResolvedValue({
      id: "t1",
      name: "Alheio",
      organizationId: "org-2",
      items: [],
    } as never);
    await expect(
      TemplateDetailPage({
        params: Promise.resolve({ id: "t1" }),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow(/NOT_FOUND/);
  });

  it("redireciona para /dashboard quando o papel não pode escrever", async () => {
    getCtx.mockResolvedValue({ role: "warehouse", userId: "u1" } as never);
    await expect(
      TemplateDetailPage({
        params: Promise.resolve({ id: "t1" }),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow(/REDIRECT:\/dashboard/);
  });
});

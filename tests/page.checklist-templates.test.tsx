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
  listChecklistTemplates: vi.fn(async () => []),
}));

vi.mock("@/app/(dashboard)/settings/checklist-templates/CreateTemplateButton", () => ({
  CreateTemplateButton: () => null,
}));

import ChecklistTemplatesPage from "@/app/(dashboard)/settings/checklist-templates/page";
import { getCurrentUserContext } from "@/lib/auth/session";
import { listChecklistTemplates } from "@/lib/checklist-templates";

const getCtx = vi.mocked(getCurrentUserContext);
const listTpl = vi.mocked(listChecklistTemplates);

describe("ChecklistTemplatesPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renderiza estado vazio quando não há templates", async () => {
    getCtx.mockResolvedValue({
      role: "admin",
      userId: "u1",
      primaryOrganization: { id: "org-1" },
    } as never);
    listTpl.mockResolvedValue([]);

    const ui = await ChecklistTemplatesPage({ searchParams: Promise.resolve({}) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByText("Templates de Checklist")).toBeInTheDocument();
    expect(screen.getByText("Nenhum template cadastrado.")).toBeInTheDocument();
  });

  it("lista templates cadastrados", async () => {
    getCtx.mockResolvedValue({
      role: "admin",
      userId: "u1",
      primaryOrganization: { id: "org-1" },
    } as never);
    listTpl.mockResolvedValue([
      {
        id: "t1",
        name: "Padrão Corporativo",
        description: "Desc",
        isDefault: true,
        itemCount: 3,
        requiredCount: 2,
      },
    ] as never);

    const ui = await ChecklistTemplatesPage({ searchParams: Promise.resolve({ success: "Criado" }) });
    const { render, screen } = await import("@testing-library/react");
    render(ui);
    expect(screen.getByText("Padrão Corporativo")).toBeInTheDocument();
    expect(screen.getByText("Padrão")).toBeInTheDocument();
    expect(screen.getByText("Criado")).toBeInTheDocument();
  });

  it("redireciona para /dashboard quando o papel não pode escrever", async () => {
    getCtx.mockResolvedValue({ role: "warehouse", userId: "u1" } as never);
    await expect(
      ChecklistTemplatesPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow(/REDIRECT:\/dashboard/);
  });
});

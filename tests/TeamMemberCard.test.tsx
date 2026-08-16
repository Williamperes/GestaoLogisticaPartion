// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/(dashboard)/team/actions", () => ({
  deleteTeamMember: vi.fn(),
  provisionTeamMemberAccess: vi.fn(),
  resetTeamMemberPassword: vi.fn(),
  updateTeamMember: vi.fn(),
}));

import { TeamMemberCard } from "@/app/(dashboard)/team/TeamMemberCard";
import type { TeamMember } from "@/lib/team-shared";

function makeMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    id: "m-1",
    organizationId: "org-1",
    name: "Yuri Silveira",
    specialtyId: "s-1",
    specialtyName: "Som",
    specialtySlug: "sound",
    role: "Técnico de Som",
    phone: "11999998888",
    email: "yuri@example.com",
    city: "São Paulo",
    available: true,
    notes: "Disponível fins de semana",
    createdAt: "2026-01-01",
    userId: null,
    ...overrides,
  };
}

describe("TeamMemberCard", () => {
  it("renderiza nome, função e iniciais", () => {
    render(<TeamMemberCard member={makeMember()} canManageAccess={false} />);
    expect(screen.getByText("Yuri Silveira")).toBeInTheDocument();
    expect(screen.getAllByText("Técnico de Som").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("YS")).toBeInTheDocument();
  });

  it("revela detalhes de contato ao passar o mouse", async () => {
    const user = userEvent.setup();
    render(<TeamMemberCard member={makeMember()} canManageAccess={false} />);
    expect(screen.queryByText("yuri@example.com")).not.toBeInTheDocument();

    await user.hover(screen.getByText("Yuri Silveira"));
    expect(screen.getByText("yuri@example.com")).toBeInTheDocument();
    expect(screen.getByText("São Paulo")).toBeInTheDocument();
  });

  it("mostra fallbacks quando contato é nulo", async () => {
    const user = userEvent.setup();
    render(
      <TeamMemberCard
        member={makeMember({ phone: null, email: null, city: null })}
        canManageAccess={false}
      />
    );
    await user.hover(screen.getByText("Yuri Silveira"));
    expect(screen.getByText("Telefone não informado")).toBeInTheDocument();
    expect(screen.getByText("Email não informado")).toBeInTheDocument();
    expect(screen.getByText("Cidade não informada")).toBeInTheDocument();
  });

  it("abre o sheet de edição pré-preenchido", async () => {
    const user = userEvent.setup();
    render(<TeamMemberCard member={makeMember()} canManageAccess={false} />);
    // O gatilho de edição é o primeiro sheet-trigger (botão-ícone com lápis).
    const editTrigger = document.querySelector(
      'button[data-slot="sheet-trigger"]'
    ) as HTMLButtonElement;
    await user.click(editTrigger);

    expect(await screen.findByDisplayValue("Yuri Silveira")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Técnico de Som")).toBeInTheDocument();
    expect(screen.getByDisplayValue("São Paulo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Salvar alterações/i })).toBeInTheDocument();
  });

  it("não mostra botões de gestão de acesso quando canManageAccess é falso", () => {
    render(<TeamMemberCard member={makeMember()} canManageAccess={false} />);
    expect(screen.queryByTitle("Criar acesso ao app")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Redefinir senha")).not.toBeInTheDocument();
  });

  it("mostra 'Criar acesso' para membro sem userId quando pode gerir acesso", () => {
    render(<TeamMemberCard member={makeMember({ userId: null })} canManageAccess />);
    expect(screen.getByTitle("Criar acesso ao app")).toBeInTheDocument();
    expect(screen.queryByTitle("Redefinir senha")).not.toBeInTheDocument();
  });

  it("mostra 'Redefinir senha' para membro com userId quando pode gerir acesso", () => {
    render(<TeamMemberCard member={makeMember({ userId: "u-1" })} canManageAccess />);
    expect(screen.getByTitle("Redefinir senha")).toBeInTheDocument();
    expect(screen.queryByTitle("Criar acesso ao app")).not.toBeInTheDocument();
  });

  it("o sheet de provisionar acesso gera senha e exibe email", async () => {
    const user = userEvent.setup();
    render(<TeamMemberCard member={makeMember({ userId: null })} canManageAccess />);
    await user.click(screen.getByTitle("Criar acesso ao app"));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("yuri@example.com")).toBeInTheDocument();
    expect(within(dialog).getByRole("option", {
      name: "Funcionário — Eventos/OS e Manutenção",
    })).toHaveValue("employee");
    const pwInput = document.querySelector('input[name="password"]') as HTMLInputElement;
    expect(pwInput.value).toBe("");
    // Digitar dispara o onChange controlado (linha 339).
    await user.type(pwInput, "manual99");
    expect(pwInput.value).toBe("manual99");
    await user.click(screen.getByRole("button", { name: "Gerar" }));
    expect(pwInput.value.length).toBeGreaterThanOrEqual(8);
    expect(pwInput.value).not.toBe("manual99");
  });

  it("pede cadastro de email quando provisiona sem email", async () => {
    const user = userEvent.setup();
    render(
      <TeamMemberCard
        member={makeMember({ userId: null, email: null })}
        canManageAccess
      />
    );
    await user.click(screen.getByTitle("Criar acesso ao app"));
    expect(
      await screen.findByText(/Cadastre um email/i)
    ).toBeInTheDocument();
  });

  it("o sheet de redefinir senha gera senha e permite digitar", async () => {
    const user = userEvent.setup();
    render(<TeamMemberCard member={makeMember({ userId: "u-1" })} canManageAccess />);
    await user.click(screen.getByTitle("Redefinir senha"));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Gera nova senha/i)).toBeInTheDocument();

    const pwInput = document.querySelector('input[name="password"]') as HTMLInputElement;
    expect(pwInput.value).toBe("");

    // Digitar manualmente dispara o onChange (linha 264).
    await user.type(pwInput, "abc12345");
    expect(pwInput.value).toBe("abc12345");

    // O botão "Gerar" substitui por uma senha aleatória (linhas 270-272).
    await user.click(within(dialog).getByRole("button", { name: "Gerar" }));
    expect(pwInput.value.length).toBeGreaterThanOrEqual(8);
    expect(pwInput.value).not.toBe("abc12345");
  });

  it("gera senha via fallback Math.random quando window.crypto está ausente", async () => {
    const user = userEvent.setup();
    const originalCrypto = window.crypto;
    Object.defineProperty(window, "crypto", {
      value: undefined,
      configurable: true,
    });
    try {
      render(<TeamMemberCard member={makeMember({ userId: "u-1" })} canManageAccess />);
      await user.click(screen.getByTitle("Redefinir senha"));
      await screen.findByRole("dialog");
      const pwInput = document.querySelector(
        'input[name="password"]'
      ) as HTMLInputElement;
      await user.click(screen.getByRole("button", { name: "Gerar" }));
      expect(pwInput.value.length).toBe(14);
    } finally {
      Object.defineProperty(window, "crypto", {
        value: originalCrypto,
        configurable: true,
      });
    }
  });

  it("abre o diálogo de exclusão a partir do botão-ícone vermelho", async () => {
    const user = userEvent.setup();
    render(<TeamMemberCard member={makeMember()} canManageAccess={false} />);
    // O botão de excluir do card (DeleteTeamMemberButton) é o último botão sem título.
    const deleteIcon = document.querySelector(
      'button.border-red-500\\/20'
    ) as HTMLButtonElement;
    await user.click(deleteIcon);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Yuri Silveira")).toBeInTheDocument();
    expect(within(dialog).getAllByText(/Apagar técnico/i).length).toBeGreaterThanOrEqual(1);
  });
});

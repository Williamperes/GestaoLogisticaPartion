// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("framer-motion", () => {
  const React = require("react");
  const passthrough = (tag: string) =>
    React.forwardRef(({ children, ...props }: Record<string, unknown>, ref: unknown) => {
      // Remove props específicas de animação que não são atributos DOM válidos.
      const { animate, initial, exit, transition, ...rest } = props as Record<string, unknown>;
      void animate; void initial; void exit; void transition;
      return React.createElement(tag, { ...rest, ref }, children as React.ReactNode);
    });
  return {
    motion: new Proxy({}, { get: (_t, tag: string) => passthrough(tag) }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: Record<string, unknown>) => {
    const React = require("react");
    return React.createElement("img", { alt, ...props });
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

vi.mock("@/app/(auth)/actions", () => ({ signOut: vi.fn() }));

import { Sidebar, MobileSidebar } from "@/components/layout/Sidebar";

describe("Sidebar — filtro de navegação por papel", () => {
  it("admin vê todos os cadastros e configurações, mas não 'Bipar OS'", () => {
    render(<Sidebar userName="Yuri Silveira" userRole="Admin" role="admin" />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Eventos & OS")).toBeInTheDocument();
    expect(screen.getByText("Inventário")).toBeInTheDocument();
    expect(screen.getByText("Clientes")).toBeInTheDocument();
    expect(screen.getByText("Equipe")).toBeInTheDocument();
    expect(screen.getByText("Configurações")).toBeInTheDocument();
    expect(screen.queryByText("Bipar OS")).not.toBeInTheDocument();
  });

  it("warehouse vê apenas 'Bipar OS' e nada de configurações", () => {
    render(<Sidebar userName="Ana Paula" userRole="Almoxarife" role="warehouse" />);
    expect(screen.getByText("Bipar OS")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.queryByText("Inventário")).not.toBeInTheDocument();
    expect(screen.queryByText("Configurações")).not.toBeInTheDocument();
  });

  it("operations não vê configurações (admin-only)", () => {
    render(<Sidebar userName="Op" userRole="Operações" role="operations" />);
    expect(screen.getByText("Inventário")).toBeInTheDocument();
    expect(screen.queryByText("Configurações")).not.toBeInTheDocument();
  });

  it("employee vê somente Eventos & OS e Manutenção", () => {
    render(<Sidebar userName="Funcionário" userRole="Funcionário" role="employee" />);
    expect(screen.getByText("Eventos & OS")).toBeInTheDocument();
    expect(screen.getByText("Manutenção")).toBeInTheDocument();
    for (const hidden of [
      "Dashboard", "Bipar OS", "Inventário", "Clientes", "Equipe",
      "Sublocações", "Configurações",
    ]) {
      expect(screen.queryByText(hidden)).not.toBeInTheDocument();
    }
  });

  it("role null não renderiza nenhum grupo de navegação", () => {
    render(<Sidebar userName="X" userRole="—" role={null} />);
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.queryByText("Clientes")).not.toBeInTheDocument();
  });

  it("calcula as iniciais do usuário (2 primeiras, maiúsculas)", () => {
    render(<Sidebar userName="yuri silveira costa" userRole="Admin" role="admin" />);
    expect(screen.getByText("YS")).toBeInTheDocument();
  });

  it("mostra nome e cargo do usuário", () => {
    render(<Sidebar userName="Yuri Silveira" userRole="Administrador" role="admin" />);
    expect(screen.getByText("Yuri Silveira")).toBeInTheDocument();
    expect(screen.getByText("Administrador")).toBeInTheDocument();
  });
});

describe("MobileSidebar", () => {
  it("renderiza o gatilho do menu com aria-label", () => {
    render(<MobileSidebar userName="Yuri" userRole="Admin" role="admin" />);
    expect(screen.getByRole("button", { name: "Abrir menu" })).toBeInTheDocument();
  });
});

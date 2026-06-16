// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

let mockPathname = "/dashboard";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

// MobileSidebar arrasta muitas dependências (framer-motion, server actions, etc.)
vi.mock("@/components/layout/Sidebar", () => ({
  MobileSidebar: () => {
    const React = require("react");
    return React.createElement("div", { "data-testid": "mobile-sidebar" });
  },
}));

import { TopBar } from "@/components/layout/TopBar";

function renderAt(path: string) {
  mockPathname = path;
  return render(<TopBar userName="Yuri" userRole="Admin" role={null} />);
}

describe("TopBar", () => {
  it("mostra um único crumb para rota de nível único", () => {
    renderAt("/dashboard");
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Detalhe")).not.toBeInTheDocument();
  });

  it("mapeia o label conhecido da rota", () => {
    renderAt("/inventory");
    expect(screen.getByText("Inventário")).toBeInTheDocument();
  });

  it("cai no segmento bruto quando a rota é desconhecida", () => {
    renderAt("/desconhecido");
    expect(screen.getByText("desconhecido")).toBeInTheDocument();
  });

  it("mostra crumb pai + 'Detalhe' para rotas aninhadas", () => {
    renderAt("/events/festival-aurora");
    expect(screen.getByText("Eventos & OS")).toBeInTheDocument();
    expect(screen.getByText("Detalhe")).toBeInTheDocument();
  });

  it("renderiza o MobileSidebar mockado e a busca", () => {
    renderAt("/dashboard");
    expect(screen.getByTestId("mobile-sidebar")).toBeInTheDocument();
    expect(screen.getByText("Buscar...")).toBeInTheDocument();
  });
});

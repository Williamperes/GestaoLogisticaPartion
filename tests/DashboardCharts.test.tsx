// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock leve do recharts: renderiza os filhos e, crucialmente, invoca as
// callbacks `tickFormatter` (YAxis) e `formatter` (Tooltip) para exercitar
// as funções inline do componente — que de outra forma nunca rodam em jsdom
// (o ResponsiveContainer tem tamanho 0 e o recharts não monta os eixos).
vi.mock("recharts", () => {
  const React = require("react");
  const Pass = (name: string) =>
    function MockChartPart(props: Record<string, unknown>) {
      // Exercita tickFormatter (ex.: "40%").
      if (typeof props.tickFormatter === "function") {
        (props.tickFormatter as (v: unknown) => unknown)(40);
      }
      // Exercita formatter do Tooltip (ex.: ["40%", "Utilização"]).
      if (typeof props.formatter === "function") {
        (props.formatter as (v: unknown) => unknown)(40);
      }
      return React.createElement(
        "div",
        { "data-recharts": name },
        props.children as React.ReactNode
      );
    };
  return {
    ResponsiveContainer: Pass("ResponsiveContainer"),
    AreaChart: Pass("AreaChart"),
    Area: Pass("Area"),
    XAxis: Pass("XAxis"),
    YAxis: Pass("YAxis"),
    Tooltip: Pass("Tooltip"),
    PieChart: Pass("PieChart"),
    Pie: Pass("Pie"),
    Cell: Pass("Cell"),
  };
});

import { DashboardCharts } from "@/app/(dashboard)/dashboard/DashboardCharts";
import type { CategoryStat, UtilizationPoint } from "@/lib/dashboard";

const HISTORY: UtilizationPoint[] = [
  { month: "Jan", utilization: 40 },
  { month: "Fev", utilization: 65 },
  { month: "Mar", utilization: 80 },
];

const CATEGORIES: CategoryStat[] = [
  { name: "Som", count: 30 },
  { name: "Luz", count: 10 },
];

describe("DashboardCharts", () => {
  it("renderiza os títulos das seções", () => {
    render(<DashboardCharts categoryStats={CATEGORIES} utilizationHistory={HISTORY} />);
    expect(screen.getByText("Taxa de Utilização de Equipamentos")).toBeInTheDocument();
    expect(screen.getByText("Por Categoria")).toBeInTheDocument();
  });

  it("calcula e exibe os percentuais por categoria", () => {
    render(<DashboardCharts categoryStats={CATEGORIES} utilizationHistory={HISTORY} />);
    // Total = 40. Som 30 → 75%, Luz 10 → 25%.
    expect(screen.getByText("Som")).toBeInTheDocument();
    expect(screen.getByText("Luz")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
  });

  it("mostra mensagem de vazio quando não há categorias", () => {
    render(<DashboardCharts categoryStats={[]} utilizationHistory={HISTORY} />);
    expect(screen.getByText("Nenhum equipamento cadastrado.")).toBeInTheDocument();
  });

  it("exibe 0% quando o total de itens é zero", () => {
    render(
      <DashboardCharts
        categoryStats={[{ name: "Som", count: 0 }]}
        utilizationHistory={HISTORY}
      />
    );
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("renderiza o gráfico de área e o de pizza", () => {
    const { container } = render(
      <DashboardCharts categoryStats={CATEGORIES} utilizationHistory={HISTORY} />
    );
    expect(
      container.querySelector("[data-recharts='AreaChart']")
    ).toBeInTheDocument();
    expect(
      container.querySelector("[data-recharts='PieChart']")
    ).toBeInTheDocument();
  });

  it("não quebra com histórico de utilização vazio", () => {
    render(<DashboardCharts categoryStats={CATEGORIES} utilizationHistory={[]} />);
    expect(
      screen.getByText("Taxa de Utilização de Equipamentos")
    ).toBeInTheDocument();
  });
});

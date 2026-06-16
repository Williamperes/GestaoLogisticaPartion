// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { StatusBadge, SpecialtyBadge } from "@/components/ui/StatusBadge";

describe("StatusBadge — evento", () => {
  it("renderiza o label do status de evento", () => {
    render(<StatusBadge status="planning" type="event" />);
    expect(screen.getByText("Planejamento")).toBeInTheDocument();
  });

  it("usa o mapa de eventos para cada status", () => {
    const { rerender } = render(<StatusBadge status="in_field" type="event" />);
    expect(screen.getByText("Em Campo")).toBeInTheDocument();
    rerender(<StatusBadge status="cancelled" type="event" />);
    expect(screen.getByText("Cancelado")).toBeInTheDocument();
  });

  it("propaga className extra", () => {
    render(<StatusBadge status="completed" type="event" className="custom-x" />);
    expect(screen.getByText("Concluído")).toHaveClass("custom-x");
  });
});

describe("StatusBadge — item", () => {
  it("renderiza label + dot de status de item", () => {
    const { container } = render(<StatusBadge status="available" type="item" />);
    expect(screen.getByText("Disponível")).toBeInTheDocument();
    // O dot é um span extra com a cor.
    expect(container.querySelectorAll("span").length).toBeGreaterThan(1);
  });

  it("mapeia manutenção", () => {
    render(<StatusBadge status="maintenance" type="item" />);
    expect(screen.getByText("Manutenção")).toBeInTheDocument();
  });
});

describe("SpecialtyBadge", () => {
  it("usa label fixo para especialidade conhecida (normalizando acento)", () => {
    render(<SpecialtyBadge specialty="Sound" />);
    expect(screen.getByText("Som")).toBeInTheDocument();
  });

  it("usa o próprio texto como fallback para especialidade desconhecida", () => {
    render(<SpecialtyBadge specialty="Drone" />);
    expect(screen.getByText("Drone")).toBeInTheDocument();
  });

  it("é determinístico: mesma entrada → mesma classe de cor (hash)", () => {
    const { container: a } = render(<SpecialtyBadge specialty="Pirotecnia" />);
    const { container: b } = render(<SpecialtyBadge specialty="Pirotecnia" />);
    expect(a.firstElementChild?.className).toBe(b.firstElementChild?.className);
  });
});

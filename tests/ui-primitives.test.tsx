// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { SubmitButton } from "@/components/ui/SubmitButton";

describe("Button", () => {
  it("renderiza o texto e marca data-slot", () => {
    render(<Button>Salvar</Button>);
    const btn = screen.getByRole("button", { name: "Salvar" });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("data-slot", "button");
  });

  it("aplica variant destructive nas classes", () => {
    render(<Button variant="destructive">Apagar</Button>);
    expect(screen.getByRole("button", { name: "Apagar" }).className).toContain("destructive");
  });

  it("repassa disabled", () => {
    render(<Button disabled>X</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});

describe("Badge", () => {
  it("renderiza como span por padrão", () => {
    render(<Badge>Novo</Badge>);
    const el = screen.getByText("Novo");
    expect(el.tagName).toBe("SPAN");
    expect(el).toHaveAttribute("data-slot", "badge");
  });
});

describe("Progress", () => {
  it("expõe o valor via aria (role progressbar)", () => {
    render(<Progress value={42} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "42");
  });

  it("renderiza ProgressLabel e ProgressValue", () => {
    const { container } = render(
      <Progress value={75}>
        <ProgressLabel>Uso de estoque</ProgressLabel>
        <ProgressValue />
      </Progress>
    );
    expect(screen.getByText("Uso de estoque")).toHaveAttribute(
      "data-slot",
      "progress-label"
    );
    expect(
      container.querySelector("[data-slot='progress-value']")
    ).toBeInTheDocument();
  });
});

describe("SubmitButton", () => {
  it("mostra o idleLabel e fica habilitado fora de submit", () => {
    render(<SubmitButton idleLabel="Enviar" pendingLabel="Enviando..." />);
    const btn = screen.getByRole("button", { name: "Enviar" });
    expect(btn).toBeEnabled();
    expect(btn).toHaveAttribute("type", "submit");
  });
});

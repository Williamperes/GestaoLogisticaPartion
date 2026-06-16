// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";

import { CardSpotlight } from "@/components/ui/aceternity/card-spotlight";

describe("CardSpotlight", () => {
  it("renderiza os children", () => {
    render(
      <CardSpotlight>
        <p>Conteúdo do card</p>
      </CardSpotlight>
    );
    expect(screen.getByText("Conteúdo do card")).toBeInTheDocument();
  });

  it("aplica className extra na raiz", () => {
    const { container } = render(
      <CardSpotlight className="custom-card">x</CardSpotlight>
    );
    expect(container.firstElementChild).toHaveClass("custom-card");
  });

  it("aplica as classes base", () => {
    const { container } = render(<CardSpotlight>x</CardSpotlight>);
    expect(container.firstElementChild?.className).toContain("rounded-xl");
    expect(container.firstElementChild?.className).toContain("bg-card");
  });

  it("reage aos eventos de mouse e foco sem quebrar", () => {
    const { container } = render(<CardSpotlight>x</CardSpotlight>);
    const root = container.firstElementChild as HTMLElement;
    fireEvent.mouseEnter(root);
    fireEvent.mouseMove(root, { clientX: 10, clientY: 20 });
    fireEvent.mouseLeave(root);
    fireEvent.focus(root);
    fireEvent.blur(root);
    expect(screen.getByText("x")).toBeInTheDocument();
  });
});

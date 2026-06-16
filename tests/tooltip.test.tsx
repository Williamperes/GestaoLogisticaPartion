// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

function Example({ open = false }: { open?: boolean }) {
  return (
    <TooltipProvider>
      <Tooltip open={open}>
        <TooltipTrigger>Passe o mouse</TooltipTrigger>
        <TooltipContent>Dica útil</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

describe("Tooltip", () => {
  it("renderiza o trigger com data-slot", () => {
    render(<Example />);
    expect(screen.getByText("Passe o mouse")).toHaveAttribute(
      "data-slot",
      "tooltip-trigger"
    );
  });

  it("não mostra o conteúdo enquanto fechado", () => {
    render(<Example />);
    expect(screen.queryByText("Dica útil")).not.toBeInTheDocument();
  });

  it("mostra o conteúdo quando open é true", () => {
    render(<Example open />);
    expect(screen.getByText("Dica útil")).toBeInTheDocument();
  });

  it("aplica data-slot no conteúdo aberto", () => {
    render(<Example open />);
    const content = document.querySelector("[data-slot='tooltip-content']");
    expect(content).toBeInTheDocument();
    expect(content).toHaveTextContent("Dica útil");
  });
});

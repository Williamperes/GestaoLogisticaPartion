// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

function Example({
  defaultOpen = false,
  showCloseButton = true,
  side = "right" as const,
}: {
  defaultOpen?: boolean;
  showCloseButton?: boolean;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <Sheet defaultOpen={defaultOpen}>
      <SheetTrigger>Abrir painel</SheetTrigger>
      <SheetContent side={side} showCloseButton={showCloseButton}>
        <SheetHeader>
          <SheetTitle>Título do painel</SheetTitle>
          <SheetDescription>Descrição do painel</SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <span>Rodapé</span>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

describe("Sheet", () => {
  it("renderiza o trigger com data-slot", () => {
    render(<Example />);
    expect(screen.getByText("Abrir painel")).toHaveAttribute(
      "data-slot",
      "sheet-trigger"
    );
  });

  it("não mostra o conteúdo enquanto fechado", () => {
    render(<Example />);
    expect(screen.queryByText("Título do painel")).not.toBeInTheDocument();
  });

  it("mostra título e descrição quando aberto", () => {
    render(<Example defaultOpen />);
    expect(screen.getByText("Título do painel")).toBeInTheDocument();
    expect(screen.getByText("Descrição do painel")).toBeInTheDocument();
  });

  it("aplica data-side no content", () => {
    render(<Example defaultOpen side="left" />);
    const content = document.querySelector("[data-slot='sheet-content']");
    expect(content).toHaveAttribute("data-side", "left");
  });

  it("renderiza o botão de fechar por padrão", () => {
    render(<Example defaultOpen />);
    expect(screen.getByText("Close")).toBeInTheDocument();
  });

  it("omite o botão de fechar quando showCloseButton é false", () => {
    render(<Example defaultOpen showCloseButton={false} />);
    expect(screen.queryByText("Close")).not.toBeInTheDocument();
  });

  it("abre ao clicar no trigger", async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByText("Abrir painel"));
    expect(screen.getByText("Título do painel")).toBeInTheDocument();
  });

  it("renderiza header e footer com data-slots", () => {
    render(<Example defaultOpen />);
    expect(
      document.querySelector("[data-slot='sheet-header']")
    ).toBeInTheDocument();
    expect(
      document.querySelector("[data-slot='sheet-footer']")
    ).toBeInTheDocument();
  });
});

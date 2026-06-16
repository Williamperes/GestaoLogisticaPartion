// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";

function Example({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger>Abrir menu</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Ações</DropdownMenuLabel>
          <DropdownMenuItem>Editar</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive">
            Apagar
            <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe("DropdownMenu", () => {
  it("renderiza o trigger com data-slot", () => {
    render(<Example />);
    const trigger = screen.getByText("Abrir menu");
    expect(trigger).toHaveAttribute("data-slot", "dropdown-menu-trigger");
  });

  it("não mostra o conteúdo enquanto fechado", () => {
    render(<Example />);
    expect(screen.queryByText("Editar")).not.toBeInTheDocument();
  });

  it("mostra o conteúdo quando aberto via defaultOpen", () => {
    render(<Example defaultOpen />);
    expect(screen.getByText("Editar")).toBeInTheDocument();
    expect(screen.getByText("Ações")).toBeInTheDocument();
  });

  it("aplica data-variant=destructive no item", () => {
    render(<Example defaultOpen />);
    const item = screen.getByText("Apagar").closest("[data-slot='dropdown-menu-item']");
    expect(item).toHaveAttribute("data-variant", "destructive");
  });

  it("reflete o estado aberto via prop open (controlado)", () => {
    const { rerender } = render(
      <DropdownMenu open={false}>
        <DropdownMenuTrigger>Abrir menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Editar</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    expect(screen.getByText("Abrir menu")).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(screen.queryByText("Editar")).not.toBeInTheDocument();

    rerender(
      <DropdownMenu open>
        <DropdownMenuTrigger>Abrir menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Editar</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    expect(screen.getByText("Abrir menu")).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByText("Editar")).toBeInTheDocument();
  });

  it("renderiza o shortcut com data-slot", () => {
    render(<Example defaultOpen />);
    expect(screen.getByText("⌘⌫")).toHaveAttribute(
      "data-slot",
      "dropdown-menu-shortcut"
    );
  });

  it("abre o conteúdo ao clicar no trigger (user-event)", async () => {
    const user = userEvent.setup();
    render(<Example />);
    expect(screen.queryByText("Editar")).not.toBeInTheDocument();
    await user.click(screen.getByText("Abrir menu"));
    expect(await screen.findByText("Editar")).toBeInTheDocument();
    expect(screen.getByText("Ações")).toHaveAttribute(
      "data-slot",
      "dropdown-menu-label"
    );
    expect(
      document.querySelector("[data-slot='dropdown-menu-content']")
    ).toBeInTheDocument();
    expect(
      document.querySelector("[data-slot='dropdown-menu-separator']")
    ).toBeInTheDocument();
    expect(
      document.querySelector("[data-slot='dropdown-menu-group']")
    ).toBeInTheDocument();
  });

  it("renderiza checkbox e radio items quando aberto", () => {
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem checked>
            Mostrar grade
          </DropdownMenuCheckboxItem>
          <DropdownMenuRadioGroup value="a">
            <DropdownMenuRadioItem value="a">Opção A</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="b">Opção B</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    expect(
      document.querySelector("[data-slot='dropdown-menu-checkbox-item']")
    ).toBeInTheDocument();
    expect(
      document.querySelector("[data-slot='dropdown-menu-radio-group']")
    ).toBeInTheDocument();
    expect(
      document.querySelectorAll("[data-slot='dropdown-menu-radio-item']")
    ).toHaveLength(2);
    expect(screen.getByText("Mostrar grade")).toBeInTheDocument();
    expect(screen.getByText("Opção A")).toBeInTheDocument();
  });

  it("renderiza submenu trigger e abre o sub-content", async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Mais</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Sub item</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    const subTrigger = screen.getByText("Mais");
    expect(subTrigger.closest("[data-slot='dropdown-menu-sub-trigger']")).toBeInTheDocument();
    await user.click(subTrigger);
    expect(await screen.findByText("Sub item")).toBeInTheDocument();
    expect(
      document.querySelector("[data-slot='dropdown-menu-sub-content']")
    ).toBeInTheDocument();
  });

  it("renderiza itens dentro de um DropdownMenuPortal explícito", () => {
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuItem>Em portal</DropdownMenuItem>
        </DropdownMenuPortal>
      </DropdownMenu>
    );
    expect(screen.getByText("Em portal")).toBeInTheDocument();
  });
});

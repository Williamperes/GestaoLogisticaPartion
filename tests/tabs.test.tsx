// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  tabsListVariants,
} from "@/components/ui/tabs";

function Example({ variant }: { variant?: "default" | "line" }) {
  return (
    <Tabs defaultValue="a">
      <TabsList variant={variant}>
        <TabsTrigger value="a">Aba A</TabsTrigger>
        <TabsTrigger value="b">Aba B</TabsTrigger>
      </TabsList>
      <TabsContent value="a">Conteúdo A</TabsContent>
      <TabsContent value="b">Conteúdo B</TabsContent>
    </Tabs>
  );
}

describe("Tabs", () => {
  it("renderiza triggers e o painel ativo inicial", () => {
    render(<Example />);
    expect(screen.getByText("Aba A")).toBeInTheDocument();
    expect(screen.getByText("Conteúdo A")).toBeInTheDocument();
  });

  it("aplica data-slot na raiz", () => {
    render(<Example />);
    expect(document.querySelector("[data-slot='tabs']")).toBeInTheDocument();
  });

  it("usa variant default por padrão na list", () => {
    render(<Example />);
    const list = document.querySelector("[data-slot='tabs-list']");
    expect(list).toHaveAttribute("data-variant", "default");
    expect(list?.className).toContain("bg-muted");
  });

  it("aplica variant line", () => {
    render(<Example variant="line" />);
    const list = document.querySelector("[data-slot='tabs-list']");
    expect(list).toHaveAttribute("data-variant", "line");
    expect(list?.className).toContain("bg-transparent");
  });

  it("troca de aba ao clicar no trigger", async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByText("Aba B"));
    expect(screen.getByText("Conteúdo B")).toBeInTheDocument();
  });

  it("tabsListVariants gera classes por variante", () => {
    expect(tabsListVariants({ variant: "default" })).toContain("bg-muted");
    expect(tabsListVariants({ variant: "line" })).toContain("bg-transparent");
  });
});

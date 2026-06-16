// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  AvatarBadge,
  AvatarGroup,
  AvatarGroupCount,
} from "@/components/ui/avatar";

describe("Card family", () => {
  it("renderiza todas as partes com seus data-slots", () => {
    const { container } = render(
      <Card size="sm">
        <CardHeader>
          <CardTitle>Título</CardTitle>
          <CardDescription>Descrição</CardDescription>
          <CardAction>Ação</CardAction>
        </CardHeader>
        <CardContent>Conteúdo</CardContent>
        <CardFooter>Rodapé</CardFooter>
      </Card>
    );

    expect(container.querySelector("[data-slot=card]")).toHaveAttribute("data-size", "sm");
    expect(screen.getByText("Título")).toHaveAttribute("data-slot", "card-title");
    expect(screen.getByText("Descrição")).toHaveAttribute("data-slot", "card-description");
    expect(screen.getByText("Ação")).toHaveAttribute("data-slot", "card-action");
    expect(screen.getByText("Conteúdo")).toHaveAttribute("data-slot", "card-content");
    expect(screen.getByText("Rodapé")).toHaveAttribute("data-slot", "card-footer");
  });

  it("usa data-size default quando não informado", () => {
    const { container } = render(<Card>X</Card>);
    expect(container.querySelector("[data-slot=card]")).toHaveAttribute("data-size", "default");
  });
});

describe("Separator", () => {
  it("renderiza horizontal por padrão", () => {
    const { container } = render(<Separator />);
    const sep = container.querySelector("[data-slot=separator]");
    expect(sep).toBeTruthy();
    expect(sep).toHaveAttribute("data-orientation", "horizontal");
  });

  it("aceita orientação vertical", () => {
    const { container } = render(<Separator orientation="vertical" />);
    expect(container.querySelector("[data-slot=separator]")).toHaveAttribute(
      "data-orientation",
      "vertical"
    );
  });
});

describe("Avatar", () => {
  it("mostra o fallback quando não há imagem", () => {
    render(
      <Avatar>
        <AvatarFallback>YS</AvatarFallback>
      </Avatar>
    );
    expect(screen.getByText("YS")).toBeInTheDocument();
  });

  it("propaga o tamanho via data-size", () => {
    const { container } = render(
      <Avatar size="lg">
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>
    );
    expect(container.querySelector("[data-slot=avatar]")).toHaveAttribute("data-size", "lg");
  });

  it("renderiza AvatarImage e AvatarBadge com seus data-slots", () => {
    const { container } = render(
      <Avatar>
        <AvatarImage src="/foo.png" alt="Foto" />
        <AvatarBadge>•</AvatarBadge>
        <AvatarFallback>YS</AvatarFallback>
      </Avatar>
    );
    expect(
      container.querySelector("[data-slot=avatar-badge]")
    ).toBeInTheDocument();
    // AvatarImage só insere o <img> após carregar; o slot pode ser substituído
    // pelo fallback, mas o badge e o fallback devem existir.
    expect(screen.getByText("YS")).toHaveAttribute("data-slot", "avatar-fallback");
  });

  it("renderiza AvatarGroup e AvatarGroupCount", () => {
    const { container } = render(
      <AvatarGroup>
        <Avatar>
          <AvatarFallback>A</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarFallback>B</AvatarFallback>
        </Avatar>
        <AvatarGroupCount>+3</AvatarGroupCount>
      </AvatarGroup>
    );
    expect(
      container.querySelector("[data-slot=avatar-group]")
    ).toBeInTheDocument();
    expect(screen.getByText("+3")).toHaveAttribute(
      "data-slot",
      "avatar-group-count"
    );
  });
});

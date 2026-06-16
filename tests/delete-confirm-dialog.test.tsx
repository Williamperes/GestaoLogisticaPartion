// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { Button } from "@/components/ui/button";

function noop() {}

describe("DeleteConfirmDialog", () => {
  it("não mostra o conteúdo enquanto fechado", () => {
    render(
      <DeleteConfirmDialog
        action={noop}
        itemId="1"
        itemName="Cabo XLR"
        itemLabel="o item"
        render={<Button>Apagar</Button>}
      />
    );
    expect(screen.queryByText("Cancelar")).not.toBeInTheDocument();
  });

  it("usa labels padrão derivados de itemLabel ao abrir", async () => {
    const user = userEvent.setup();
    render(
      <DeleteConfirmDialog
        action={noop}
        itemId="1"
        itemName="Cabo XLR"
        itemLabel="o item"
        render={<Button>Apagar</Button>}
      />
    );
    await user.click(screen.getByRole("button", { name: "Apagar" }));

    // título e confirmLabel padrão compartilham o texto "Apagar o item"
    expect(screen.getAllByText("Apagar o item").length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByText("Esta ação remove o item Cabo XLR e não pode ser desfeita.")
    ).toBeInTheDocument();
    expect(screen.getByText("Cabo XLR")).toBeInTheDocument();
    expect(screen.getByText("Cancelar")).toBeInTheDocument();
    // confirmLabel padrão no botão de submit
    expect(
      screen.getByRole("button", { name: "Apagar o item" })
    ).toBeInTheDocument();
  });

  it("respeita title/description/confirmLabel customizados", async () => {
    const user = userEvent.setup();
    render(
      <DeleteConfirmDialog
        action={noop}
        itemId="42"
        itemName="Mesa de som"
        itemLabel="o equipamento"
        title="Remover mesa?"
        description="Tem certeza?"
        confirmLabel="Sim, remover"
        render={<Button>Excluir</Button>}
      />
    );
    await user.click(screen.getByRole("button", { name: "Excluir" }));

    expect(screen.getByText("Remover mesa?")).toBeInTheDocument();
    expect(screen.getByText("Tem certeza?")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sim, remover" })
    ).toBeInTheDocument();
  });

  it("renderiza os campos ocultos do form (id + extras)", async () => {
    const user = userEvent.setup();
    render(
      <DeleteConfirmDialog
        action={noop}
        itemId="99"
        itemName="Tripé"
        itemLabel="o item"
        hiddenFieldName="unitId"
        extraFields={{ eventId: "ev-7" }}
        render={<Button>Apagar</Button>}
      />
    );
    await user.click(screen.getByRole("button", { name: "Apagar" }));

    const idField = document.querySelector(
      "input[name='unitId']"
    ) as HTMLInputElement;
    expect(idField).not.toBeNull();
    expect(idField.value).toBe("99");

    const extra = document.querySelector(
      "input[name='eventId']"
    ) as HTMLInputElement;
    expect(extra.value).toBe("ev-7");
  });
});

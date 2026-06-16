// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/(dashboard)/events/actions", () => ({
  setEventEquipmentBatch: vi.fn(),
}));

import { AddEquipmentSheet } from "@/app/(dashboard)/events/[id]/AddEquipmentSheet";
import { setEventEquipmentBatch } from "@/app/(dashboard)/events/actions";

const EQUIPMENT_WITH_VARIANTS = [
  {
    id: "eq-v",
    name: "Microfone",
    type: "serialized" as const,
    categoryName: "Áudio",
    hasVariants: true,
    total: 0,
    allocatedByOthers: 0,
    available: 0,
    variants: [
      {
        id: "var-a",
        label: "SM58",
        total: 10,
        allocatedByOthers: 2,
        available: 8,
      },
      {
        id: "var-b",
        label: "SM57",
        total: 5,
        allocatedByOthers: 5,
        available: 0,
      },
    ],
  },
];

const EQUIPMENT = [
  {
    id: "eq-1",
    name: "Mesa de Som X32",
    type: "serialized" as const,
    categoryName: "Áudio",
    hasVariants: false,
    total: 5,
    allocatedByOthers: 1,
    available: 4,
  },
  {
    id: "eq-2",
    name: "Cabo XLR",
    type: "bulk" as const,
    categoryName: "Cabos",
    hasVariants: false,
    total: 100,
    allocatedByOthers: 0,
    available: 50,
  },
];

describe("AddEquipmentSheet", () => {
  it("renderiza o gatilho 'Gerenciar equipamentos'", () => {
    render(
      <AddEquipmentSheet
        eventId="ev-1"
        eventStatus="planning"
        equipment={EQUIPMENT}
        currentQtyByKey={{}}
      />
    );
    expect(
      screen.getByRole("button", { name: /Gerenciar equipamentos/i })
    ).toBeInTheDocument();
    expect(screen.queryByText("Mesa de Som X32")).not.toBeInTheDocument();
  });

  it("abre o sheet e lista os equipamentos agrupados por categoria", async () => {
    const user = userEvent.setup();
    render(
      <AddEquipmentSheet
        eventId="ev-1"
        eventStatus="planning"
        equipment={EQUIPMENT}
        currentQtyByKey={{}}
      />
    );

    await user.click(screen.getByRole("button", { name: /Gerenciar equipamentos/i }));

    expect(await screen.findByText("Mesa de Som X32")).toBeInTheDocument();
    expect(screen.getByText("Cabo XLR")).toBeInTheDocument();
    expect(screen.getByText("Áudio")).toBeInTheDocument();
    expect(screen.getByText("Cabos")).toBeInTheDocument();
    expect(screen.getByText("Equipamentos da OS")).toBeInTheDocument();
  });

  it("filtra equipamentos pela busca", async () => {
    const user = userEvent.setup();
    render(
      <AddEquipmentSheet
        eventId="ev-1"
        eventStatus="planning"
        equipment={EQUIPMENT}
        currentQtyByKey={{}}
      />
    );
    await user.click(screen.getByRole("button", { name: /Gerenciar equipamentos/i }));
    await screen.findByText("Mesa de Som X32");

    const searchInput = screen.getByPlaceholderText("Buscar por nome ou categoria...");
    await user.type(searchInput, "Cabo");

    expect(screen.queryByText("Mesa de Som X32")).not.toBeInTheDocument();
    expect(screen.getByText("Cabo XLR")).toBeInTheDocument();
  });

  it("incrementa a quantidade pelo stepper", async () => {
    const user = userEvent.setup();
    render(
      <AddEquipmentSheet
        eventId="ev-1"
        eventStatus="planning"
        equipment={EQUIPMENT}
        currentQtyByKey={{}}
      />
    );
    await user.click(screen.getByRole("button", { name: /Gerenciar equipamentos/i }));
    await screen.findByText("Mesa de Som X32");

    await user.click(screen.getByRole("button", { name: "Aumentar Mesa de Som X32" }));

    // O contador de seleção deve atualizar.
    expect(screen.getByText(/1 item selecionado/)).toBeInTheDocument();
  });

  it("mostra estado vazio quando não há equipamentos", async () => {
    const user = userEvent.setup();
    render(
      <AddEquipmentSheet
        eventId="ev-1"
        eventStatus="planning"
        equipment={[]}
        currentQtyByKey={{}}
      />
    );
    await user.click(screen.getByRole("button", { name: /Gerenciar equipamentos/i }));

    expect(
      await screen.findByText("Nenhum equipamento cadastrado no inventário.")
    ).toBeInTheDocument();
  });

  it("avisa sobre overbooking quando a quantidade excede o disponível (planning)", async () => {
    const user = userEvent.setup();
    render(
      <AddEquipmentSheet
        eventId="ev-1"
        eventStatus="planning"
        equipment={[
          {
            id: "eq-3",
            name: "Item Raro",
            type: "bulk" as const,
            categoryName: "Outros",
            hasVariants: false,
            total: 2,
            allocatedByOthers: 0,
            available: 1,
          },
        ]}
        currentQtyByKey={{ "eq-3": 5 }}
      />
    );
    await user.click(screen.getByRole("button", { name: /Gerenciar equipamentos/i }));
    await screen.findByText("Item Raro");

    expect(screen.getByText(/item acima do disponível/i)).toBeInTheDocument();
  });

  it("renderiza grupos de variantes e exercita o stepper de variante", async () => {
    const user = userEvent.setup();
    render(
      <AddEquipmentSheet
        eventId="ev-1"
        eventStatus="planning"
        equipment={EQUIPMENT_WITH_VARIANTS}
        currentQtyByKey={{ "eq-v__var-a": 99 }}
      />
    );
    await user.click(screen.getByRole("button", { name: /Gerenciar equipamentos/i }));
    await screen.findByText("Microfone");

    // currentQtyByKey acima do disponível dispara a branch de overbooking de variante.
    expect(screen.getByText(/item acima do disponível/i)).toBeInTheDocument();

    // Variante com disponibilidade aparece; a header de grupo mostra contagem.
    expect(screen.getByText("SM58")).toBeInTheDocument();
    expect(screen.getByText(/2 variantes/)).toBeInTheDocument();

    // Estado inicial: 1 item selecionado (a variante var-a com qty 99).
    expect(screen.getByText(/1 item selecionado/)).toBeInTheDocument();
    expect(screen.getByText(/99 un\. selec\./)).toBeInTheDocument();

    // Incrementa a variante (planning permite exceder).
    await user.click(screen.getByRole("button", { name: "Aumentar Microfone SM58" }));
    expect(screen.getByText(/100 unidades/)).toBeInTheDocument();

    // Diminui — cobre o caminho de decremento do stepper.
    await user.click(screen.getByRole("button", { name: "Diminuir Microfone SM58" }));
    expect(screen.getByText(/99 un\. selec\./)).toBeInTheDocument();
  });

  it("digita a quantidade direto no input numérico", async () => {
    const user = userEvent.setup();
    render(
      <AddEquipmentSheet
        eventId="ev-1"
        eventStatus="planning"
        equipment={EQUIPMENT}
        currentQtyByKey={{}}
      />
    );
    await user.click(screen.getByRole("button", { name: /Gerenciar equipamentos/i }));
    await screen.findByText("Mesa de Som X32");

    const inputs = screen.getAllByRole("spinbutton");
    await user.clear(inputs[0]);
    await user.type(inputs[0], "3");
    expect(screen.getByText(/1 item selecionado/)).toBeInTheDocument();
    expect(screen.getByText(/3 unidades/)).toBeInTheDocument();

    // Limpar o input volta para 0 (parseInt("" || "0")).
    await user.clear(inputs[0]);
    expect(screen.getByText(/0 itens selecionados/)).toBeInTheDocument();
  });

  it("hardBlock: trava o incremento e o cap ao exceder o disponível", async () => {
    const user = userEvent.setup();
    render(
      <AddEquipmentSheet
        eventId="ev-1"
        eventStatus="ready_for_load"
        equipment={[
          {
            id: "eq-cap",
            name: "Projetor",
            type: "serialized" as const,
            categoryName: "Vídeo",
            hasVariants: false,
            total: 2,
            allocatedByOthers: 0,
            available: 1,
          },
        ]}
        currentQtyByKey={{}}
      />
    );
    await user.click(screen.getByRole("button", { name: /Gerenciar equipamentos/i }));
    await screen.findByText("Projetor");

    const inc = screen.getByRole("button", { name: "Aumentar Projetor" });
    await user.click(inc);
    expect(screen.getByText(/1 unidade/)).toBeInTheDocument();
    // Já no limite (available=1) — botão fica desabilitado.
    expect(inc).toBeDisabled();

    // Tentar digitar acima do cap é limitado a `available`.
    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "9");
    expect(screen.getByText(/1 unidade/)).toBeInTheDocument();
  });

  it("envia o batch e fecha o sheet ao salvar", async () => {
    const user = userEvent.setup();
    render(
      <AddEquipmentSheet
        eventId="ev-1"
        eventStatus="planning"
        equipment={EQUIPMENT}
        currentQtyByKey={{}}
      />
    );
    await user.click(screen.getByRole("button", { name: /Gerenciar equipamentos/i }));
    await screen.findByText("Mesa de Som X32");

    await user.click(screen.getByRole("button", { name: "Aumentar Mesa de Som X32" }));
    await user.click(screen.getByRole("button", { name: /^Salvar/ }));

    expect(setEventEquipmentBatch).toHaveBeenCalledTimes(1);
    const fd = (setEventEquipmentBatch as ReturnType<typeof vi.fn>).mock.calls[0][0] as FormData;
    expect(fd.get("eventId")).toBe("ev-1");
    expect(fd.get("qty_eq-1")).toBe("1");
  });

  it("mostra mensagem específica quando há equipamento mas nada disponível", async () => {
    const user = userEvent.setup();
    render(
      <AddEquipmentSheet
        eventId="ev-1"
        eventStatus="planning"
        equipment={[
          {
            id: "eq-zero",
            name: "Esgotado",
            type: "bulk" as const,
            categoryName: "Outros",
            hasVariants: false,
            total: 3,
            allocatedByOthers: 3,
            available: 0,
          },
        ]}
        currentQtyByKey={{}}
      />
    );
    await user.click(screen.getByRole("button", { name: /Gerenciar equipamentos/i }));

    expect(
      await screen.findByText("Nenhum equipamento disponível para o período da OS.")
    ).toBeInTheDocument();
  });

  it("mostra mensagem de busca sem resultados", async () => {
    const user = userEvent.setup();
    render(
      <AddEquipmentSheet
        eventId="ev-1"
        eventStatus="planning"
        equipment={EQUIPMENT}
        currentQtyByKey={{}}
      />
    );
    await user.click(screen.getByRole("button", { name: /Gerenciar equipamentos/i }));
    await screen.findByText("Mesa de Som X32");

    await user.type(
      screen.getByPlaceholderText("Buscar por nome ou categoria..."),
      "zzzzz"
    );
    expect(screen.getByText(/Nenhum equipamento encontrado para/)).toBeInTheDocument();
  });
});

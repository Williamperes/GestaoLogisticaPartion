// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/(dashboard)/inventory/actions", () => ({
  createCategory: vi.fn(),
  renameCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));

import {
  createCategory,
  renameCategory,
} from "@/app/(dashboard)/inventory/actions";
import { CategoryManager } from "@/app/(dashboard)/inventory/categories/CategoryManager";
import type { EquipmentCategory } from "@/lib/inventory";

const CATEGORIES: EquipmentCategory[] = [
  {
    id: "c-1",
    name: "Mesas",
    parentCategoryId: null,
    parentCategoryName: null,
    equipmentCount: 0,
  } as unknown as EquipmentCategory,
  {
    id: "c-2",
    name: "Digitais",
    parentCategoryId: "c-1",
    parentCategoryName: "Mesas",
    equipmentCount: 3,
  } as unknown as EquipmentCategory,
];

describe("CategoryManager", () => {
  it("mostra estado vazio sem categorias", () => {
    render(<CategoryManager categories={[]} />);
    expect(screen.getByText(/Nenhuma categoria cadastrada/i)).toBeInTheDocument();
    expect(screen.getByText("0 categorias")).toBeInTheDocument();
  });

  it("usa singular para 1 categoria", () => {
    render(<CategoryManager categories={[CATEGORIES[0]]} />);
    expect(screen.getByText("1 categoria")).toBeInTheDocument();
  });

  it("lista categorias com pai e contagem de equipamentos", () => {
    render(<CategoryManager categories={CATEGORIES} />);
    expect(screen.getByText("2 categorias")).toBeInTheDocument();
    // "Mesas" aparece como linha e também como badge de pai da subcategoria.
    expect(screen.getAllByText("Mesas").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Digitais")).toBeInTheDocument();
  });

  it("abre o form inline de criação com select de pai (apenas raízes)", async () => {
    const user = userEvent.setup();
    render(<CategoryManager categories={CATEGORIES} />);
    await user.click(screen.getByRole("button", { name: /Nova Categoria/i }));

    expect(
      screen.getByPlaceholderText("Nome da nova categoria")
    ).toBeInTheDocument();
    // Só a raiz "Mesas" deve aparecer como opção de pai.
    expect(screen.getByRole("option", { name: "Subcategoria de: Mesas" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Subcategoria de: Digitais" })
    ).not.toBeInTheDocument();
  });

  it("permite renomear inline e exclui a própria categoria das opções de pai", async () => {
    const user = userEvent.setup();
    render(<CategoryManager categories={CATEGORIES} />);
    const renameButtons = screen.getAllByTitle("Renomear");
    await user.click(renameButtons[0]); // renomear "Mesas" (raiz)

    expect(screen.getByDisplayValue("Mesas")).toBeInTheDocument();
    // "Mesas" é a própria, então não pode ser pai de si mesma.
    expect(
      screen.queryByRole("option", { name: "Subcategoria de: Mesas" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "— Sem pai —" })).toBeInTheDocument();
  });

  it("cria uma categoria e fecha o form ao submeter", async () => {
    const user = userEvent.setup();
    vi.mocked(createCategory).mockResolvedValueOnce(undefined as never);
    render(<CategoryManager categories={CATEGORIES} />);
    await user.click(screen.getByRole("button", { name: /Nova Categoria/i }));
    await user.type(
      screen.getByPlaceholderText("Nome da nova categoria"),
      "Microfones"
    );
    const select = document.querySelector(
      'select[name="parentCategoryId"]'
    ) as HTMLSelectElement;
    await user.selectOptions(select, "c-1");
    expect(select.value).toBe("c-1");
    await user.click(screen.getByRole("button", { name: "Criar" }));
    await waitFor(() => expect(createCategory).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen.queryByPlaceholderText("Nome da nova categoria")
      ).not.toBeInTheDocument()
    );
  });

  it("cancela o form de criação pelo X", async () => {
    const user = userEvent.setup();
    render(<CategoryManager categories={CATEGORIES} />);
    await user.click(screen.getByRole("button", { name: /Nova Categoria/i }));
    const form = screen
      .getByPlaceholderText("Nome da nova categoria")
      .closest("form") as HTMLFormElement;
    const cancel = within(form)
      .getAllByRole("button")
      .find((b) => b.getAttribute("type") === "button")!;
    await user.click(cancel);
    expect(
      screen.queryByPlaceholderText("Nome da nova categoria")
    ).not.toBeInTheDocument();
  });

  it("renomeia uma categoria e sai do modo de edição ao submeter", async () => {
    const user = userEvent.setup();
    vi.mocked(renameCategory).mockResolvedValueOnce(undefined as never);
    render(<CategoryManager categories={CATEGORIES} />);
    await user.click(screen.getAllByTitle("Renomear")[0]);
    const input = screen.getByDisplayValue("Mesas");
    await user.clear(input);
    await user.type(input, "Mesas de Som");
    const form = input.closest("form") as HTMLFormElement;
    await user.click(within(form).getAllByRole("button")[0]);
    await waitFor(() => expect(renameCategory).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByDisplayValue("Mesas de Som")).not.toBeInTheDocument()
    );
  });

  it("lista outras raízes como opções de pai ao renomear uma raiz", async () => {
    const user = userEvent.setup();
    const cats: EquipmentCategory[] = [
      {
        id: "c-1",
        name: "Mesas",
        parentCategoryId: null,
        parentCategoryName: null,
        equipmentCount: 0,
      } as unknown as EquipmentCategory,
      {
        id: "c-3",
        name: "Microfones",
        parentCategoryId: null,
        parentCategoryName: null,
        equipmentCount: 0,
      } as unknown as EquipmentCategory,
    ];
    render(<CategoryManager categories={cats} />);
    await user.click(screen.getAllByTitle("Renomear")[0]); // renomeia "Mesas"
    // A outra raiz ("Microfones") aparece como opção de pai.
    expect(
      screen.getByRole("option", { name: "Subcategoria de: Microfones" })
    ).toBeInTheDocument();
    // A própria ("Mesas") não.
    expect(
      screen.queryByRole("option", { name: "Subcategoria de: Mesas" })
    ).not.toBeInTheDocument();
  });

  it("cancela a renomeação pelo X", async () => {
    const user = userEvent.setup();
    render(<CategoryManager categories={CATEGORIES} />);
    await user.click(screen.getAllByTitle("Renomear")[0]);
    const input = screen.getByDisplayValue("Mesas");
    const form = input.closest("form") as HTMLFormElement;
    const buttons = within(form).getAllByRole("button");
    await user.click(buttons[buttons.length - 1]);
    expect(screen.queryByDisplayValue("Mesas")).not.toBeInTheDocument();
  });

  it("permite excluir categoria sem equipamentos e bloqueia as que têm", async () => {
    const user = userEvent.setup();
    render(<CategoryManager categories={CATEGORIES} />);
    // "Mesas" (count 0) tem botão habilitado; "Digitais" (count 3) está desabilitado.
    const deleteButtons = screen.getAllByTitle("Excluir");
    expect(deleteButtons).toHaveLength(1);
    const blocked = screen.getByTitle("Categoria possui equipamentos vinculados");
    expect(blocked).toBeDisabled();

    await user.click(deleteButtons[0]);
    expect(await screen.findByText(/Excluir categoria/i)).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Excluir" })).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ThemeToggle } from "@/components/layout/ThemeToggle";

const storage = new Map<string, string>();

describe("ThemeToggle", () => {
  beforeEach(() => {
    storage.clear();
    document.documentElement.classList.remove("dark");
    delete document.documentElement.dataset.theme;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn((key: string) => storage.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      },
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: false })),
    });
  });

  it("aplica a preferencia salva ao carregar", async () => {
    storage.set("partion-theme", "dark");
    render(<ThemeToggle />);

    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(screen.getByRole("button", { name: "Ativar tema claro" })).toBeInTheDocument();
  });

  it("alterna o tema e salva a escolha", async () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button", { name: "Ativar tema escuro" });

    fireEvent.click(button);

    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.setItem).toHaveBeenCalledWith("partion-theme", "dark");
  });
});

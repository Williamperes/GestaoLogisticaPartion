// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace, refresh: vi.fn() }),
  usePathname: () => "/clients",
  useSearchParams: () => nav.searchParams,
}));

vi.mock("sonner", () => ({ toast: toastMock }));

import { ClientsToastSync } from "@/app/(dashboard)/clients/ClientsToastSync";

afterEach(() => {
  nav.replace.mockClear();
  toastMock.success.mockClear();
  toastMock.error.mockClear();
});

describe("ClientsToastSync", () => {
  it("não dispara nada quando não há mensagem", () => {
    nav.searchParams = new URLSearchParams();
    render(<ClientsToastSync />);
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("dispara toast de sucesso e limpa a URL", () => {
    nav.searchParams = new URLSearchParams("success=Cliente%20criado&q=neon");
    render(<ClientsToastSync />);
    expect(toastMock.success).toHaveBeenCalledWith("Cliente criado");
    expect(nav.replace).toHaveBeenCalledWith("/clients?q=neon", { scroll: false });
  });

  it("dispara toast de erro e limpa a URL sem query restante", () => {
    nav.searchParams = new URLSearchParams("error=Falhou");
    render(<ClientsToastSync />);
    expect(toastMock.error).toHaveBeenCalledWith("Falhou");
    expect(nav.replace).toHaveBeenCalledWith("/clients", { scroll: false });
  });
});

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
  usePathname: () => "/team",
  useSearchParams: () => nav.searchParams,
}));

vi.mock("sonner", () => ({ toast: toastMock }));

import { TeamToastSync } from "@/app/(dashboard)/team/TeamToastSync";

afterEach(() => {
  nav.replace.mockClear();
  toastMock.success.mockClear();
  toastMock.error.mockClear();
});

describe("TeamToastSync", () => {
  it("dispara toast de sucesso comum sem opções e limpa a URL", () => {
    nav.searchParams = new URLSearchParams("success=Tecnico%20criado");
    render(<TeamToastSync />);
    expect(toastMock.success).toHaveBeenCalledWith("Tecnico criado", undefined);
    expect(nav.replace).toHaveBeenCalledWith("/team", { scroll: false });
  });

  it("mensagens com senha temporária ficam persistentes (duration Infinity)", () => {
    nav.searchParams = new URLSearchParams(
      "success=" + encodeURIComponent("Acesso criado. Senha temporária: abc12345")
    );
    render(<TeamToastSync />);
    expect(toastMock.success).toHaveBeenCalledWith(
      expect.stringContaining("Senha temporária"),
      { duration: Infinity, closeButton: true }
    );
  });

  it("dispara toast de erro", () => {
    nav.searchParams = new URLSearchParams("error=Deu%20ruim");
    render(<TeamToastSync />);
    expect(toastMock.error).toHaveBeenCalledWith("Deu ruim", undefined);
  });

  it("não faz nada sem mensagem", () => {
    nav.searchParams = new URLSearchParams();
    render(<TeamToastSync />);
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});

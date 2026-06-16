// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => "/events/ev-1",
  useSearchParams: () => mocks.searchParams,
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

import { EventToastSync } from "@/app/(dashboard)/events/[id]/EventToastSync";

describe("EventToastSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
  });

  it("não dispara toast sem parâmetros", () => {
    render(<EventToastSync />);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("dispara toast de sucesso e limpa o query param", () => {
    mocks.searchParams = new URLSearchParams("success=Salvo");
    render(<EventToastSync />);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Salvo");
    expect(mocks.replace).toHaveBeenCalledWith("/events/ev-1", { scroll: false });
  });

  it("dispara toast de erro", () => {
    mocks.searchParams = new URLSearchParams("error=Falhou");
    render(<EventToastSync />);
    expect(mocks.toastError).toHaveBeenCalledWith("Falhou");
  });

  it("preserva outros params ao limpar success/error", () => {
    mocks.searchParams = new URLSearchParams("success=Ok&tab=equip");
    render(<EventToastSync />);
    expect(mocks.replace).toHaveBeenCalledWith("/events/ev-1?tab=equip", { scroll: false });
  });
});

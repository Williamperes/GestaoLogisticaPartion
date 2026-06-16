// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const setUnitQrCode = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("@/app/(dashboard)/inventory/actions", () => ({
  setUnitQrCode: (...args: unknown[]) => setUnitQrCode(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

// QrScanner usa câmera/decoders — substituímos por um stub leve.
vi.mock("@/components/inventory/QrScanner", () => ({
  QrScanner: () => {
    const React = require("react");
    return React.createElement("div", { "data-testid": "qr-scanner" });
  },
}));

import { LinkQrButton } from "@/components/inventory/LinkQrButton";

describe("LinkQrButton", () => {
  beforeEach(() => {
    setUnitQrCode.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it("mostra rótulo 'Vincular QR' quando não vinculado", () => {
    render(<LinkQrButton unitId="u1" unitSerial="SN-1" />);
    expect(screen.getByRole("button", { name: "Vincular QR" })).toBeInTheDocument();
  });

  it("mostra rótulo 'Vinculado · Trocar' quando já vinculado", () => {
    render(<LinkQrButton unitId="u1" unitSerial="SN-1" isLinked />);
    expect(screen.getByText("Vinculado · Trocar")).toBeInTheDocument();
  });

  it("abre o sheet e mostra o título correto ao clicar", async () => {
    const user = userEvent.setup();
    render(<LinkQrButton unitId="u1" unitSerial="SN-1" />);
    await user.click(screen.getByRole("button", { name: "Vincular QR" }));
    expect(screen.getByText("Vincular QR — SN-1")).toBeInTheDocument();
    expect(screen.getByTestId("qr-scanner")).toBeInTheDocument();
  });

  it("título usa 'Trocar QR' quando isLinked", async () => {
    const user = userEvent.setup();
    render(<LinkQrButton unitId="u1" unitSerial="SN-9" isLinked />);
    await user.click(screen.getByText("Vinculado · Trocar"));
    expect(screen.getByText("Trocar QR — SN-9")).toBeInTheDocument();
  });

  it("o botão de envio fica desabilitado sem texto e habilita ao digitar", async () => {
    const user = userEvent.setup();
    render(<LinkQrButton unitId="u1" unitSerial="SN-1" />);
    await user.click(screen.getByRole("button", { name: "Vincular QR" }));

    const submitBtn = screen.getByRole("button", { name: "Vincular" });
    expect(submitBtn).toBeDisabled();

    await user.type(screen.getByPlaceholderText("Ou digite o código"), "ABC123");
    expect(submitBtn).toBeEnabled();
  });

  it("submete o código manual e mostra toast de sucesso", async () => {
    setUnitQrCode.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<LinkQrButton unitId="u1" unitSerial="SN-1" />);
    await user.click(screen.getByRole("button", { name: "Vincular QR" }));
    await user.type(screen.getByPlaceholderText("Ou digite o código"), "CODE-42");
    await user.click(screen.getByRole("button", { name: "Vincular" }));

    await waitFor(() => {
      expect(setUnitQrCode).toHaveBeenCalledWith("u1", "CODE-42");
    });
    expect(toastSuccess).toHaveBeenCalledWith("QR vinculado a SN-1");
  });

  it("mostra toast de erro quando a action falha", async () => {
    setUnitQrCode.mockResolvedValue({ ok: false, error: "QR já usado" });
    const user = userEvent.setup();
    render(<LinkQrButton unitId="u1" unitSerial="SN-1" />);
    await user.click(screen.getByRole("button", { name: "Vincular QR" }));
    await user.type(screen.getByPlaceholderText("Ou digite o código"), "DUP");
    await user.click(screen.getByRole("button", { name: "Vincular" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("QR já usado");
    });
  });
});

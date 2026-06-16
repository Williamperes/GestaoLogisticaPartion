// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Captura o callback de decode registrado pelo componente para podermos
// simular um QR lido sem precisar de câmera real.
let decodeCallback: ((result: unknown, err: unknown) => void) | null = null;
const stopMock = vi.fn();
const decodeFromVideoDevice = vi.fn(
  async (_deviceId: unknown, _video: unknown, cb: (result: unknown, err: unknown) => void) => {
    decodeCallback = cb;
    return { stop: stopMock };
  }
);

vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatReader: class {
    decodeFromVideoDevice = decodeFromVideoDevice;
    reset = vi.fn();
    listVideoInputDevices = vi.fn(async () => []);
  },
}));

import { QrScanner } from "@/components/inventory/QrScanner";

beforeEach(() => {
  decodeCallback = null;
  decodeFromVideoDevice.mockClear();
  stopMock.mockClear();
});

describe("QrScanner — render e setup do reader", () => {
  it("monta o elemento de vídeo e inicializa o reader sem lançar", async () => {
    const onResult = vi.fn();
    const { container } = render(<QrScanner onResult={onResult} />);

    const video = container.querySelector("video");
    expect(video).toBeInTheDocument();

    await waitFor(() => expect(decodeFromVideoDevice).toHaveBeenCalled());
  });

  it("renderiza o botão de pausar e o input manual por padrão", () => {
    render(<QrScanner onResult={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Pausar" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Código manual")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeInTheDocument();
  });

  it("oculta o input manual quando showManualInput=false", () => {
    render(<QrScanner onResult={vi.fn()} showManualInput={false} />);
    expect(screen.queryByPlaceholderText("Código manual")).not.toBeInTheDocument();
  });
});

describe("QrScanner — callback de decode", () => {
  it("chama onResult com o texto quando um QR é decodificado", async () => {
    const onResult = vi.fn();
    render(<QrScanner onResult={onResult} />);

    await waitFor(() => expect(decodeCallback).not.toBeNull());

    decodeCallback?.({ getText: () => "QR-123" }, null);
    expect(onResult).toHaveBeenCalledWith("QR-123");
  });

  it("não propaga erros transitórios de decode (NotFoundException)", async () => {
    const onResult = vi.fn();
    const onError = vi.fn();
    render(<QrScanner onResult={onResult} onError={onError} />);

    await waitFor(() => expect(decodeCallback).not.toBeNull());

    decodeCallback?.(null, { name: "NotFoundException", message: "no code found" });
    expect(onError).not.toHaveBeenCalled();
    expect(onResult).not.toHaveBeenCalled();
  });

  it("propaga erros estruturais via onError", async () => {
    const onError = vi.fn();
    render(<QrScanner onResult={vi.fn()} onError={onError} />);

    await waitFor(() => expect(decodeCallback).not.toBeNull());

    const realErr = { name: "NotAllowedError", message: "permission denied" };
    decodeCallback?.(null, realErr);
    expect(onError).toHaveBeenCalledWith(realErr);
  });
});

describe("QrScanner — entrada manual", () => {
  it("submete o código manual via onResult e limpa o campo", async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(<QrScanner onResult={onResult} />);

    const input = screen.getByPlaceholderText("Código manual") as HTMLInputElement;
    await user.type(input, "  abc123  ");
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    expect(onResult).toHaveBeenCalledWith("abc123");
    expect(input.value).toBe("");
  });

  it("ignora submissão de código manual vazio", async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(<QrScanner onResult={onResult} />);

    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(onResult).not.toHaveBeenCalled();
  });
});

describe("QrScanner — toggle pausar/retomar", () => {
  it("alterna o rótulo do botão ao pausar", async () => {
    const user = userEvent.setup();
    render(<QrScanner onResult={vi.fn()} />);

    const toggle = screen.getByRole("button", { name: "Pausar" });
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Retomar" })).toBeInTheDocument();
  });
});

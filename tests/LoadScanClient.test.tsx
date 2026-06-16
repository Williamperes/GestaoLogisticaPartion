// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock do QrScanner: expõe o onResult recebido para podermos disparar
// um "scan" manualmente, sem precisar de câmera real.
let scannerOnResult: ((text: string) => void) | null = null;
let scannerOnError: ((e: { message: string }) => void) | null = null;
vi.mock("@/components/inventory/QrScanner", () => ({
  QrScanner: ({
    onResult,
    onError,
  }: {
    onResult: (text: string) => void;
    onError: (e: { message: string }) => void;
  }) => {
    scannerOnResult = onResult;
    scannerOnError = onError;
    const React = require("react");
    return React.createElement("button", {
      type: "button",
      "data-testid": "fake-scan",
      onClick: () => onResult("QR-SCAN"),
    }, "scan");
  },
}));

vi.mock("@/lib/scanFeedback", () => ({
  scanFeedbackSuccess: vi.fn(),
  scanFeedbackError: vi.fn(),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) },
}));

const scanLoadUnit = vi.fn(async () => ({ ok: true, eventEquipmentId: "e1" }));
const unscanLoadUnit = vi.fn(async () => ({ ok: true, eventEquipmentId: "e1" }));
const manualLoadUnit = vi.fn(async () => ({ ok: true }));
const manualUnloadUnit = vi.fn(async () => ({ ok: true }));
vi.mock("@/app/(dashboard)/scan/actions", () => ({
  scanLoadUnit: (...a: unknown[]) => scanLoadUnit(...(a as [])),
  unscanLoadUnit: (...a: unknown[]) => unscanLoadUnit(...(a as [])),
  manualLoadUnit: (...a: unknown[]) => manualLoadUnit(...(a as [])),
  manualUnloadUnit: (...a: unknown[]) => manualUnloadUnit(...(a as [])),
}));

import { LoadScanClient } from "@/app/(dashboard)/scan/load/[eventId]/LoadScanClient";
import { scanFeedbackSuccess, scanFeedbackError } from "@/lib/scanFeedback";

const items = [
  { id: "e1", equipmentName: "Cabo XLR", variantLabel: "10m", qty: 3, loadedUnitsCount: 1 },
  { id: "e2", equipmentName: "Microfone", variantLabel: null, qty: 2, loadedUnitsCount: 2 },
];

beforeEach(() => {
  scannerOnResult = null;
  scannerOnError = null;
  vi.clearAllMocks();
  scanLoadUnit.mockResolvedValue({ ok: true, eventEquipmentId: "e1" });
  unscanLoadUnit.mockResolvedValue({ ok: true, eventEquipmentId: "e1" });
  manualLoadUnit.mockResolvedValue({ ok: true });
  manualUnloadUnit.mockResolvedValue({ ok: true });
});

describe("LoadScanClient — render default", () => {
  it("mostra os modos, scanner, progresso e listas", () => {
    render(<LoadScanClient eventId="ev1" initialItems={items} />);

    expect(screen.getByRole("button", { name: "Bipar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desbipar" })).toBeInTheDocument();
    expect(screen.getByTestId("fake-scan")).toBeInTheDocument();

    // Progresso: e1 -> min(1,3)=1, e2 -> min(2,2)=2 = 3 de 5
    expect(screen.getByText("3/5 unidades")).toBeInTheDocument();

    // Pendente x carregado
    expect(screen.getByText("Pendentes")).toBeInTheDocument();
    expect(screen.getByText("Cabo XLR · 10m")).toBeInTheDocument();
    expect(screen.getByText("Carregados (1)")).toBeInTheDocument();
    expect(screen.getByText("Microfone")).toBeInTheDocument();
  });

  it("mostra mensagem de vazio sem itens", () => {
    render(<LoadScanClient eventId="ev1" initialItems={[]} />);
    expect(screen.getByText("Nenhum equipamento nesta OS.")).toBeInTheDocument();
  });
});

describe("LoadScanClient — scan", () => {
  it("ao escanear com sucesso no modo load incrementa e dá feedback", async () => {
    render(<LoadScanClient eventId="ev1" initialItems={items} />);

    await waitFor(() => expect(scannerOnResult).not.toBeNull());
    scannerOnResult?.("QR-SCAN");

    await waitFor(() => expect(scanLoadUnit).toHaveBeenCalledWith("ev1", "QR-SCAN"));
    await waitFor(() => expect(scanFeedbackSuccess).toHaveBeenCalled());
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Carregado: QR-SCAN"));
    // e1 vai de 1 -> 2: progresso 4/5
    await waitFor(() => expect(screen.getByText("4/5 unidades")).toBeInTheDocument());
  });

  it("ao escanear com erro mostra toast de erro e feedback de erro", async () => {
    scanLoadUnit.mockResolvedValueOnce({ ok: false, error: "Inválido" });
    render(<LoadScanClient eventId="ev1" initialItems={items} />);

    await waitFor(() => expect(scannerOnResult).not.toBeNull());
    scannerOnResult?.("QR-X");

    await waitFor(() => expect(scanFeedbackError).toHaveBeenCalled());
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Inválido"));
  });

  it("no modo desbipar usa unscanLoadUnit", async () => {
    const user = userEvent.setup();
    render(<LoadScanClient eventId="ev1" initialItems={items} />);

    await user.click(screen.getByRole("button", { name: "Desbipar" }));
    await waitFor(() => expect(scannerOnResult).not.toBeNull());
    scannerOnResult?.("QR-SCAN");

    await waitFor(() => expect(unscanLoadUnit).toHaveBeenCalledWith("ev1", "QR-SCAN"));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Removido: QR-SCAN"));
  });
});

describe("LoadScanClient — manual counter", () => {
  it("o botão Bipar 1 chama manualLoadUnit e incrementa", async () => {
    const user = userEvent.setup();
    render(<LoadScanClient eventId="ev1" initialItems={items} />);

    const plus = screen.getAllByRole("button", { name: "Bipar 1" })[0];
    await user.click(plus);

    await waitFor(() => expect(manualLoadUnit).toHaveBeenCalledWith("ev1", "e1"));
    await waitFor(() => expect(screen.getByText("4/5 unidades")).toBeInTheDocument());
  });

  it("o botão Desbipar 1 chama manualUnloadUnit", async () => {
    const user = userEvent.setup();
    render(<LoadScanClient eventId="ev1" initialItems={items} />);

    const minus = screen.getAllByRole("button", { name: "Desbipar 1" })[0];
    await user.click(minus);

    await waitFor(() => expect(manualUnloadUnit).toHaveBeenCalledWith("ev1", "e1"));
  });

  it("erro no manual mostra toast e feedback de erro sem aplicar delta", async () => {
    const user = userEvent.setup();
    manualLoadUnit.mockResolvedValueOnce({ ok: false, error: "Sem estoque" });
    render(<LoadScanClient eventId="ev1" initialItems={items} />);

    const plus = screen.getAllByRole("button", { name: "Bipar 1" })[0];
    await user.click(plus);

    await waitFor(() => expect(scanFeedbackError).toHaveBeenCalled());
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Sem estoque"));
    // O progresso permanece 3/5 (delta não aplicado).
    expect(screen.getByText("3/5 unidades")).toBeInTheDocument();
  });
});

describe("LoadScanClient — modo e erro de scanner", () => {
  it("alterna de volta para o modo Bipar", async () => {
    const user = userEvent.setup();
    render(<LoadScanClient eventId="ev1" initialItems={items} />);

    await user.click(screen.getByRole("button", { name: "Desbipar" }));
    await user.click(screen.getByRole("button", { name: "Bipar" }));

    scannerOnResult?.("QR-SCAN");
    await waitFor(() => expect(scanLoadUnit).toHaveBeenCalledWith("ev1", "QR-SCAN"));
  });

  it("propaga erro do scanner como toast de erro", async () => {
    render(<LoadScanClient eventId="ev1" initialItems={items} />);
    await waitFor(() => expect(scannerOnError).not.toBeNull());
    scannerOnError?.({ message: "Câmera negada" });
    expect(toastError).toHaveBeenCalledWith("Câmera negada");
  });

  it("desabilita os contadores enquanto uma operação manual está pendente", async () => {
    let resolveFirst: (v: { ok: boolean }) => void = () => {};
    manualLoadUnit.mockImplementationOnce(
      () => new Promise((res) => { resolveFirst = res; })
    );
    render(<LoadScanClient eventId="ev1" initialItems={items} />);

    const plus = screen.getAllByRole("button", { name: "Bipar 1" })[0];
    await act(async () => {
      fireEvent.click(plus);
    });

    // Enquanto a promise não resolve, busy=true desabilita todos os contadores.
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Bipar 1" })[0]).toBeDisabled()
    );
    expect(manualLoadUnit).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst({ ok: true });
    });
    await waitFor(() => expect(scanFeedbackSuccess).toHaveBeenCalled());
  });
});

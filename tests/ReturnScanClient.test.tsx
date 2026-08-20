// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";

// Mock do QrScanner: expõe o onResult para simular um "scan" sem câmera.
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
    return createElement("button", {
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

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

interface ScanActionResult {
  ok: boolean;
  error?: string;
  eventEquipmentId?: string;
  returnedUnitsCount?: number;
}

const scanReturnUnit = vi.fn(async (): Promise<ScanActionResult> => ({
  ok: true,
  eventEquipmentId: "e1",
}));
const unscanReturnUnit = vi.fn(async (): Promise<ScanActionResult> => ({
  ok: true,
  eventEquipmentId: "e1",
}));
const manualReturnUnit = vi.fn(async (): Promise<ScanActionResult> => ({ ok: true }));
const manualUnreturnUnit = vi.fn(async (): Promise<ScanActionResult> => ({ ok: true }));
const manualReturnBulk = vi.fn(async (): Promise<ScanActionResult> => ({
  ok: true,
  returnedUnitsCount: 1,
}));
const manualUnreturnBulk = vi.fn(async (): Promise<ScanActionResult> => ({
  ok: true,
  returnedUnitsCount: 0,
}));
const finalizeReturn = vi.fn(async (): Promise<ScanActionResult> => ({ ok: true }));
vi.mock("@/app/(dashboard)/scan/actions", () => ({
  scanReturnUnit: (...a: unknown[]) => scanReturnUnit(...(a as [])),
  unscanReturnUnit: (...a: unknown[]) => unscanReturnUnit(...(a as [])),
  manualReturnUnit: (...a: unknown[]) => manualReturnUnit(...(a as [])),
  manualUnreturnUnit: (...a: unknown[]) => manualUnreturnUnit(...(a as [])),
  manualReturnBulk: (...a: unknown[]) => manualReturnBulk(...(a as [])),
  manualUnreturnBulk: (...a: unknown[]) => manualUnreturnBulk(...(a as [])),
  finalizeReturn: (...a: unknown[]) => finalizeReturn(...(a as [])),
}));

import { ReturnScanClient } from "@/app/(dashboard)/scan/return/[eventId]/ReturnScanClient";
import { scanFeedbackSuccess, scanFeedbackError } from "@/lib/scanFeedback";

const items = [
  { id: "e1", equipmentName: "Cabo XLR", variantLabel: "10m", equipmentType: "serialized" as const, loadedUnitsCount: 3, returnedUnitsCount: 1 },
  { id: "e2", equipmentName: "Microfone", variantLabel: null, equipmentType: "serialized" as const, loadedUnitsCount: 2, returnedUnitsCount: 2 },
];

beforeEach(() => {
  scannerOnResult = null;
  scannerOnError = null;
  vi.clearAllMocks();
  scanReturnUnit.mockResolvedValue({ ok: true, eventEquipmentId: "e1" });
  unscanReturnUnit.mockResolvedValue({ ok: true, eventEquipmentId: "e1" });
  manualReturnUnit.mockResolvedValue({ ok: true });
  manualUnreturnUnit.mockResolvedValue({ ok: true });
  manualReturnBulk.mockResolvedValue({ ok: true, returnedUnitsCount: 1 });
  manualUnreturnBulk.mockResolvedValue({ ok: true, returnedUnitsCount: 0 });
  finalizeReturn.mockResolvedValue({ ok: true });
});

describe("ReturnScanClient — render default", () => {
  it("mostra modos, scanner, progresso e listas", () => {
    render(<ReturnScanClient eventId="ev1" eventStatus="in_field" initialItems={items} />);

    expect(screen.getByRole("button", { name: "Bipar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desbipar" })).toBeInTheDocument();
    expect(screen.getByTestId("fake-scan")).toBeInTheDocument();

    // Retornados: e1 -> min(1,3)=1, e2 -> min(2,2)=2 = 3 de 5 carregados
    expect(screen.getByText("3/5 unidades")).toBeInTheDocument();

    expect(screen.getByText("Pendentes")).toBeInTheDocument();
    expect(screen.getByText("Cabo XLR · 10m")).toBeInTheDocument();
    expect(screen.getByText("Retornados (1)")).toBeInTheDocument();
    expect(screen.getByText("Microfone")).toBeInTheDocument();
  });

  it("mostra mensagem de vazio sem itens", () => {
    render(<ReturnScanClient eventId="ev1" eventStatus="in_field" initialItems={[]} />);
    expect(screen.getByText("Nenhum equipamento carregado nesta OS.")).toBeInTheDocument();
  });
});

describe("ReturnScanClient — scan", () => {
  it("ao escanear com sucesso no modo return incrementa e dá feedback", async () => {
    render(<ReturnScanClient eventId="ev1" eventStatus="in_field" initialItems={items} />);

    await waitFor(() => expect(scannerOnResult).not.toBeNull());
    scannerOnResult?.("QR-SCAN");

    await waitFor(() => expect(scanReturnUnit).toHaveBeenCalledWith("ev1", "QR-SCAN"));
    await waitFor(() => expect(scanFeedbackSuccess).toHaveBeenCalled());
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Retornado: QR-SCAN"));
    // e1 vai de 1 -> 2: progresso 4/5
    await waitFor(() => expect(screen.getByText("4/5 unidades")).toBeInTheDocument());
  });

  it("ao escanear com erro mostra toast e feedback de erro", async () => {
    scanReturnUnit.mockResolvedValueOnce({ ok: false, error: "Inválido" });
    render(<ReturnScanClient eventId="ev1" eventStatus="in_field" initialItems={items} />);

    await waitFor(() => expect(scannerOnResult).not.toBeNull());
    scannerOnResult?.("QR-X");

    await waitFor(() => expect(scanFeedbackError).toHaveBeenCalled());
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Inválido"));
  });

  it("no modo desbipar usa unscanReturnUnit", async () => {
    const user = userEvent.setup();
    render(<ReturnScanClient eventId="ev1" eventStatus="in_field" initialItems={items} />);

    await user.click(screen.getByRole("button", { name: "Desbipar" }));
    await waitFor(() => expect(scannerOnResult).not.toBeNull());
    scannerOnResult?.("QR-SCAN");

    await waitFor(() => expect(unscanReturnUnit).toHaveBeenCalledWith("ev1", "QR-SCAN"));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Removido: QR-SCAN"));
  });
});

describe("ReturnScanClient — manual counter", () => {
  it("o botão Bipar 1 chama manualReturnUnit e incrementa", async () => {
    const user = userEvent.setup();
    render(<ReturnScanClient eventId="ev1" eventStatus="in_field" initialItems={items} />);

    const plus = screen.getAllByRole("button", { name: "Bipar 1" })[0];
    await user.click(plus);

    await waitFor(() => expect(manualReturnUnit).toHaveBeenCalledWith("ev1", "e1"));
    await waitFor(() => expect(screen.getByText("4/5 unidades")).toBeInTheDocument());
  });

  it("o botão Desbipar 1 chama manualUnreturnUnit", async () => {
    const user = userEvent.setup();
    render(<ReturnScanClient eventId="ev1" eventStatus="in_field" initialItems={items} />);

    const minus = screen.getAllByRole("button", { name: "Desbipar 1" })[0];
    await user.click(minus);

    await waitFor(() => expect(manualUnreturnUnit).toHaveBeenCalledWith("ev1", "e1"));
  });

  it("erro no manual mostra toast e feedback de erro sem aplicar delta", async () => {
    const user = userEvent.setup();
    manualReturnUnit.mockResolvedValueOnce({ ok: false, error: "Falha" });
    render(<ReturnScanClient eventId="ev1" eventStatus="in_field" initialItems={items} />);

    const plus = screen.getAllByRole("button", { name: "Bipar 1" })[0];
    await user.click(plus);

    await waitFor(() => expect(scanFeedbackError).toHaveBeenCalled());
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Falha"));
    expect(screen.getByText("3/5 unidades")).toBeInTheDocument();
  });

  it("despacha lote para a action bulk e mantém pendente até 5/5", async () => {
    const user = userEvent.setup();
    const bulkItems = [
      {
        id: "ee-bulk",
        equipmentName: "Cabo XLR",
        variantLabel: null,
        equipmentType: "bulk" as const,
        loadedUnitsCount: 5,
        returnedUnitsCount: 0,
      },
    ];
    render(<ReturnScanClient eventId="event-1" eventStatus="in_field" initialItems={bulkItems} />);

    await user.click(screen.getByRole("button", { name: "Bipar 1" }));

    await waitFor(() =>
      expect(manualReturnBulk).toHaveBeenCalledWith("event-1", "ee-bulk", 1)
    );
    expect(manualReturnUnit).not.toHaveBeenCalled();
    expect(screen.getByText("1/5")).toBeInTheDocument();
    expect(screen.getByText("Pendentes")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Finalizar OS/ })).not.toBeInTheDocument();
  });

  it("usa a contagem absoluta devolvida pela action ao desfazer lote", async () => {
    const user = userEvent.setup();
    manualUnreturnBulk.mockResolvedValueOnce({ ok: true, returnedUnitsCount: 2 });
    const bulkItems = [
      {
        id: "ee-bulk",
        equipmentName: "Cabo XLR",
        variantLabel: null,
        equipmentType: "bulk" as const,
        loadedUnitsCount: 5,
        returnedUnitsCount: 4,
      },
    ];
    render(<ReturnScanClient eventId="event-1" eventStatus="in_field" initialItems={bulkItems} />);

    await user.click(screen.getByRole("button", { name: "Desbipar 1" }));

    await waitFor(() =>
      expect(manualUnreturnBulk).toHaveBeenCalledWith("event-1", "ee-bulk", 1)
    );
    expect(screen.getByText("2/5")).toBeInTheDocument();
  });

  it("libera a finalização apenas quando o lote chega a 5/5", async () => {
    const user = userEvent.setup();
    manualReturnBulk.mockResolvedValueOnce({ ok: true, returnedUnitsCount: 5 });
    render(
      <ReturnScanClient
        eventId="event-1"
        eventStatus="in_field"
        initialItems={[
          {
            id: "ee-bulk",
            equipmentName: "Cabo XLR",
            variantLabel: null,
            equipmentType: "bulk",
            loadedUnitsCount: 5,
            returnedUnitsCount: 4,
          },
        ]}
      />
    );

    expect(screen.queryByRole("button", { name: /Finalizar OS/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Bipar 1" }));

    await waitFor(() => expect(screen.getByText("5/5")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Finalizar OS/ })).toBeEnabled();
  });

  it("não oferece defeito manual para lote", () => {
    render(
      <ReturnScanClient
        eventId="event-1"
        eventStatus="in_field"
        initialItems={[
          {
            id: "ee-bulk",
            equipmentName: "Cabo XLR",
            variantLabel: null,
            equipmentType: "bulk",
            loadedUnitsCount: 5,
            returnedUnitsCount: 0,
          },
        ]}
      />
    );

    expect(screen.queryByRole("button", { name: "Marcar defeito" })).not.toBeInTheDocument();
  });
});

describe("ReturnScanClient — modo e erro de scanner", () => {
  it("alterna de volta para o modo Bipar (return)", async () => {
    const user = userEvent.setup();
    render(<ReturnScanClient eventId="ev1" eventStatus="in_field" initialItems={items} />);

    await user.click(screen.getByRole("button", { name: "Desbipar" }));
    await user.click(screen.getByRole("button", { name: "Bipar" }));

    scannerOnResult?.("QR-SCAN");
    await waitFor(() => expect(scanReturnUnit).toHaveBeenCalledWith("ev1", "QR-SCAN"));
  });

  it("propaga erro do scanner como toast de erro", async () => {
    render(<ReturnScanClient eventId="ev1" eventStatus="in_field" initialItems={items} />);
    await waitFor(() => expect(scannerOnError).not.toBeNull());
    scannerOnError?.({ message: "Sem câmera" });
    expect(toastError).toHaveBeenCalledWith("Sem câmera");
  });

  it("desabilita os contadores enquanto uma operação manual está pendente", async () => {
    let resolveFirst: (v: { ok: boolean }) => void = () => {};
    manualReturnUnit.mockImplementationOnce(
      () => new Promise((res) => { resolveFirst = res; })
    );
    render(<ReturnScanClient eventId="ev1" eventStatus="in_field" initialItems={items} />);

    const plus = screen.getAllByRole("button", { name: "Bipar 1" })[0];
    await act(async () => {
      fireEvent.click(plus);
    });

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Bipar 1" })[0]).toBeDisabled()
    );
    expect(manualReturnUnit).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst({ ok: true });
    });
    await waitFor(() => expect(scanFeedbackSuccess).toHaveBeenCalled());
  });
});

describe("ReturnScanClient — finalizar OS", () => {
  const allReturned = [
    { id: "e1", equipmentName: "Cabo XLR", variantLabel: null, equipmentType: "serialized" as const, loadedUnitsCount: 2, returnedUnitsCount: 2 },
  ];

  it("in_field: botão conclui a OS, navega e dá toast", async () => {
    const user = userEvent.setup();
    render(<ReturnScanClient eventId="ev1" eventStatus="in_field" initialItems={allReturned} />);

    await user.click(screen.getByRole("button", { name: /Finalizar OS/ }));

    await waitFor(() => expect(finalizeReturn).toHaveBeenCalledWith("ev1"));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/events/ev1"));
    expect(toastSuccess).toHaveBeenCalledWith("OS concluída. Estoque liberado.");
  });

  it("ready_to_load: botão desabilitado pedindo fechar a carga antes", () => {
    render(<ReturnScanClient eventId="ev1" eventStatus="ready_to_load" initialItems={allReturned} />);
    const btn = screen.getByRole("button", { name: /Feche a carga/ });
    expect(btn).toBeDisabled();
  });

  it("completed: indica OS concluída, sem botão", () => {
    render(<ReturnScanClient eventId="ev1" eventStatus="completed" initialItems={allReturned} />);
    expect(screen.getByText("OS concluída ✓")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Finalizar OS/ })).not.toBeInTheDocument();
  });

  it("erro ao finalizar mostra toast e não navega", async () => {
    finalizeReturn.mockResolvedValueOnce({ ok: false, error: "Falhou" });
    const user = userEvent.setup();
    render(<ReturnScanClient eventId="ev1" eventStatus="in_field" initialItems={allReturned} />);

    await user.click(screen.getByRole("button", { name: /Finalizar OS/ }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Falhou"));
    expect(routerPush).not.toHaveBeenCalled();
  });
});

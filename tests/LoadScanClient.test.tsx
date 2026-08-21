// @vitest-environment jsdom
import { createElement } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act, within } from "@testing-library/react";
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
  eventEquipmentId?: string;
  loadedUnitsCount?: number;
  error?: string;
}

const scanLoadUnit = vi.fn(async (): Promise<ScanActionResult> => ({
  ok: true,
  eventEquipmentId: "e1",
  loadedUnitsCount: 2,
}));
const unscanLoadUnit = vi.fn(async (): Promise<ScanActionResult> => ({
  ok: true,
  eventEquipmentId: "e1",
  loadedUnitsCount: 0,
}));
const manualLoadUnit = vi.fn(async (): Promise<ScanActionResult> => ({
  ok: true,
  eventEquipmentId: "e1",
  loadedUnitsCount: 2,
}));
const manualUnloadUnit = vi.fn(async (): Promise<ScanActionResult> => ({
  ok: true,
  eventEquipmentId: "e1",
  loadedUnitsCount: 0,
}));
const finalizeLoad = vi.fn(async (): Promise<ScanActionResult> => ({ ok: true }));
vi.mock("@/app/(dashboard)/scan/actions", () => ({
  scanLoadUnit: (...a: unknown[]) => scanLoadUnit(...(a as [])),
  unscanLoadUnit: (...a: unknown[]) => unscanLoadUnit(...(a as [])),
  manualLoadUnit: (...a: unknown[]) => manualLoadUnit(...(a as [])),
  manualUnloadUnit: (...a: unknown[]) => manualUnloadUnit(...(a as [])),
  finalizeLoad: (...a: unknown[]) => finalizeLoad(...(a as [])),
}));

import { LoadScanClient } from "@/app/(dashboard)/scan/load/[eventId]/LoadScanClient";
import { scanFeedbackSuccess, scanFeedbackError } from "@/lib/scanFeedback";

const items = [
  { id: "e1", equipmentName: "Cabo XLR", variantLabel: "10m", qty: 3, loadedUnitsCount: 1 },
  { id: "e2", equipmentName: "Microfone", variantLabel: null, qty: 2, loadedUnitsCount: 2 },
];

const extraCandidates = [
  {
    equipmentId: "eq-extra",
    equipmentName: "Cabo reserva",
    equipmentType: "bulk" as const,
    variantId: null,
    variantLabel: null,
    availableQty: 4,
    unit: "unidades",
    availableUnits: [],
  },
];

const initialExtraLog = [
  {
    id: "log-1",
    eventEquipmentId: "ee-extra",
    equipmentId: "eq-extra",
    equipmentName: "Cabo reserva",
    variantId: null,
    variantLabel: null,
    equipmentUnitId: null,
    qty: 1,
    reason: "Reforço solicitado",
    addedBy: "user-1",
    addedByName: "Ana",
    createdAt: "2026-08-20T18:00:00.000Z",
  },
];

const defaultProps = {
  eventId: "ev1",
  eventStatus: "ready_to_load" as const,
  initialItems: items,
  role: "admin" as const,
  extraCandidates: [],
  initialExtraLog: [],
};

function renderClient(overrides: Partial<Parameters<typeof LoadScanClient>[0]> = {}) {
  return render(<LoadScanClient {...defaultProps} {...overrides} />);
}

beforeEach(() => {
  scannerOnResult = null;
  scannerOnError = null;
  vi.clearAllMocks();
  scanLoadUnit.mockResolvedValue({ ok: true, eventEquipmentId: "e1", loadedUnitsCount: 2 });
  unscanLoadUnit.mockResolvedValue({ ok: true, eventEquipmentId: "e1", loadedUnitsCount: 0 });
  manualLoadUnit.mockResolvedValue({ ok: true, eventEquipmentId: "e1", loadedUnitsCount: 2 });
  manualUnloadUnit.mockResolvedValue({ ok: true, eventEquipmentId: "e1", loadedUnitsCount: 0 });
  finalizeLoad.mockResolvedValue({ ok: true });
});

describe("LoadScanClient — render default", () => {
  it("mostra os modos, scanner, progresso e listas", () => {
    renderClient();

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
    renderClient({ initialItems: [] });
    expect(screen.getByText("Nenhum equipamento nesta OS.")).toBeInTheDocument();
  });

  it("não reaplica carga quando props canônicas avançam durante a action", async () => {
    let resolveAction: (result: ScanActionResult) => void = () => {};
    manualLoadUnit.mockImplementationOnce(
      () => new Promise((resolve) => { resolveAction = resolve; })
    );
    const user = userEvent.setup();
    const { rerender } = renderClient();

    await user.click(screen.getAllByRole("button", { name: "Bipar 1" })[0]);
    rerender(
      <LoadScanClient
        {...defaultProps}
        initialItems={[{ ...items[0], loadedUnitsCount: 2 }, items[1]]}
      />
    );
    expect(screen.getByText("4/5 unidades")).toBeInTheDocument();

    await act(async () => {
      resolveAction({ ok: true, eventEquipmentId: "e1", loadedUnitsCount: 2 });
    });

    expect(screen.getByText("4/5 unidades")).toBeInTheDocument();
    expect(screen.queryByText("5/5 unidades")).not.toBeInTheDocument();
  });

  it("fica somente leitura sem permissão para mutar carga", () => {
    renderClient({ canMutateLoad: false });

    expect(screen.queryByTestId("fake-scan")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bipar 1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Desbipar 1" })).not.toBeInTheDocument();
  });

  it("mostra Material a mais somente para warehouse e abre o painel real", async () => {
    const user = userEvent.setup();
    const { rerender } = renderClient({
      role: "warehouse",
      extraCandidates,
      initialExtraLog,
    });

    await user.click(screen.getByRole("button", { name: "Material a mais" }));

    expect(screen.getByLabelText("Motivo do material extra")).toBeRequired();
    expect(
      within(screen.getByRole("list", { name: "Materiais disponíveis" })).getByText(
        "Cabo reserva"
      )
    ).toBeInTheDocument();
    expect(screen.queryByText("Progresso")).not.toBeInTheDocument();

    rerender(<LoadScanClient {...defaultProps} role="admin" />);

    expect(screen.queryByRole("button", { name: "Material a mais" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Motivo do material extra")).not.toBeInTheDocument();
  });

  it("reconcilia itens canônicos após material extra sem apagar uma bipagem local válida", async () => {
    const user = userEvent.setup();
    const { rerender } = renderClient({
      role: "warehouse",
      extraCandidates,
    });

    await user.click(screen.getAllByRole("button", { name: "Bipar 1" })[0]);
    await waitFor(() => expect(screen.getByText("4/5 unidades")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Material a mais" }));
    const repeatedCanonicalSnapshot = items.map((item) => ({ ...item }));
    rerender(
      <LoadScanClient
        {...defaultProps}
        role="warehouse"
        initialItems={repeatedCanonicalSnapshot}
        extraCandidates={extraCandidates}
        initialExtraLog={initialExtraLog}
      />
    );
    await user.click(screen.getByRole("button", { name: "Bipar" }));

    expect(screen.getByText("4/5 unidades")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Material a mais" }));
    const afterExistingExtra = [
      { ...items[0], qty: 4, loadedUnitsCount: 3 },
      items[1],
    ];
    rerender(
      <LoadScanClient
        {...defaultProps}
        role="warehouse"
        initialItems={afterExistingExtra}
        extraCandidates={extraCandidates}
        initialExtraLog={initialExtraLog}
      />
    );
    await user.click(screen.getByRole("button", { name: "Bipar" }));

    expect(screen.getByText("5/6 unidades")).toBeInTheDocument();
    expect(screen.getByText("Cabo XLR · 10m")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Material a mais" }));
    const afterNewExtra = [
      ...afterExistingExtra,
      {
        id: "e3",
        equipmentName: "Adaptador extra",
        variantLabel: null,
        qty: 2,
        loadedUnitsCount: 2,
      },
    ];
    rerender(
      <LoadScanClient
        {...defaultProps}
        role="warehouse"
        initialItems={afterNewExtra}
        extraCandidates={extraCandidates}
        initialExtraLog={initialExtraLog}
      />
    );
    await user.click(screen.getByRole("button", { name: "Bipar" }));

    expect(screen.getByText("7/8 unidades")).toBeInTheDocument();
    expect(screen.getByText("Carregados (2)")).toBeInTheDocument();
    expect(screen.getByText("Adaptador extra")).toBeInTheDocument();
  });
});

describe("LoadScanClient — scan", () => {
  it("ao escanear com sucesso no modo load incrementa e dá feedback", async () => {
    renderClient();

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
    renderClient();

    await waitFor(() => expect(scannerOnResult).not.toBeNull());
    scannerOnResult?.("QR-X");

    await waitFor(() => expect(scanFeedbackError).toHaveBeenCalled());
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Inválido"));
  });

  it("no modo desbipar usa unscanLoadUnit", async () => {
    const user = userEvent.setup();
    renderClient();

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
    renderClient();

    const plus = screen.getAllByRole("button", { name: "Bipar 1" })[0];
    await user.click(plus);

    await waitFor(() => expect(manualLoadUnit).toHaveBeenCalledWith("ev1", "e1"));
    await waitFor(() => expect(screen.getByText("4/5 unidades")).toBeInTheDocument());
  });

  it("o botão Desbipar 1 chama manualUnloadUnit", async () => {
    const user = userEvent.setup();
    renderClient();

    const minus = screen.getAllByRole("button", { name: "Desbipar 1" })[0];
    await user.click(minus);

    await waitFor(() => expect(manualUnloadUnit).toHaveBeenCalledWith("ev1", "e1"));
  });

  it("erro no manual mostra toast e feedback de erro sem aplicar delta", async () => {
    const user = userEvent.setup();
    manualLoadUnit.mockResolvedValueOnce({ ok: false, error: "Sem estoque" });
    renderClient();

    const plus = screen.getAllByRole("button", { name: "Bipar 1" })[0];
    await user.click(plus);

    await waitFor(() => expect(scanFeedbackError).toHaveBeenCalled());
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Sem estoque"));
    // O progresso permanece 3/5 (delta não aplicado).
    expect(screen.getByText("3/5 unidades")).toBeInTheDocument();
  });
});

describe("LoadScanClient — finalizar carga", () => {
  const allLoaded = [
    { id: "e1", equipmentName: "Cabo XLR", variantLabel: null, qty: 2, loadedUnitsCount: 2 },
  ];

  it("ready_to_load: botão fecha a OS, navega e dá toast", async () => {
    const user = userEvent.setup();
    renderClient({ initialItems: allLoaded });

    await user.click(screen.getByRole("button", { name: /Fechar OS/ }));

    await waitFor(() => expect(finalizeLoad).toHaveBeenCalledWith("ev1"));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/events/ev1"));
    expect(toastSuccess).toHaveBeenCalledWith("OS em campo. Carga concluída.");
  });

  it("in_field: indica que já está em campo, sem botão", () => {
    renderClient({ eventStatus: "in_field", initialItems: allLoaded });
    expect(screen.getByText("OS já está em campo ✓")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Fechar OS/ })).not.toBeInTheDocument();
  });

  it("erro ao finalizar mostra toast e não navega", async () => {
    finalizeLoad.mockResolvedValueOnce({ ok: false, error: "Falhou" });
    const user = userEvent.setup();
    renderClient({ initialItems: allLoaded });

    await user.click(screen.getByRole("button", { name: /Fechar OS/ }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Falhou"));
    expect(routerPush).not.toHaveBeenCalled();
  });
});

describe("LoadScanClient — modo e erro de scanner", () => {
  it("alterna de volta para o modo Bipar", async () => {
    const user = userEvent.setup();
    renderClient();

    await user.click(screen.getByRole("button", { name: "Desbipar" }));
    await user.click(screen.getByRole("button", { name: "Bipar" }));

    scannerOnResult?.("QR-SCAN");
    await waitFor(() => expect(scanLoadUnit).toHaveBeenCalledWith("ev1", "QR-SCAN"));
  });

  it("propaga erro do scanner como toast de erro", async () => {
    renderClient();
    await waitFor(() => expect(scannerOnError).not.toBeNull());
    scannerOnError?.({ message: "Câmera negada" });
    expect(toastError).toHaveBeenCalledWith("Câmera negada");
  });

  it("desabilita os contadores enquanto uma operação manual está pendente", async () => {
    let resolveFirst: (v: { ok: boolean }) => void = () => {};
    manualLoadUnit.mockImplementationOnce(
      () => new Promise((res) => { resolveFirst = res; })
    );
    renderClient();

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

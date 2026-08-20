// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  registerExtraSerializedMaterial: vi.fn(),
  registerExtraSerializedMaterialByUnitId: vi.fn(),
  registerExtraBulkMaterial: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  scanFeedbackError: vi.fn(),
  scanFeedbackSuccess: vi.fn(),
  scannerOnResult: null as ((text: string) => void) | null,
}));

vi.mock("@/app/(dashboard)/scan/actions", () => ({
  registerExtraSerializedMaterial: mocks.registerExtraSerializedMaterial,
  registerExtraSerializedMaterialByUnitId: mocks.registerExtraSerializedMaterialByUnitId,
  registerExtraBulkMaterial: mocks.registerExtraBulkMaterial,
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
  },
}));

vi.mock("@/lib/scanFeedback", () => ({
  scanFeedbackError: mocks.scanFeedbackError,
  scanFeedbackSuccess: mocks.scanFeedbackSuccess,
}));

vi.mock("@/components/inventory/QrScanner", () => ({
  QrScanner: ({ onResult }: { onResult: (text: string) => void }) => {
    mocks.scannerOnResult = onResult;
    return <button type="button" onClick={() => onResult("QR-123")}>Simular QR</button>;
  },
}));

import { ExtraMaterialPanel } from "@/app/(dashboard)/scan/load/[eventId]/ExtraMaterialPanel";

const candidates = [
  {
    equipmentId: "eq-1",
    equipmentName: "Cabo XLR",
    equipmentType: "serialized" as const,
    variantId: "variant-1",
    variantLabel: "10 m",
    availableQty: 4,
    unit: "unidades",
    availableUnits: [
      { id: "unit-1", serial: "XLR-10-001", patrimony: "PAT-10" },
      { id: "unit-2", serial: "XLR-10-002", patrimony: null },
    ],
  },
  {
    equipmentId: "eq-1",
    equipmentName: "Cabo XLR",
    equipmentType: "serialized" as const,
    variantId: "variant-2",
    variantLabel: "20 m",
    availableQty: 1,
    unit: "unidades",
    availableUnits: [
      { id: "unit-20", serial: "XLR-20-001", patrimony: null },
    ],
  },
  {
    equipmentId: "eq-2",
    equipmentName: "Fita gaffer",
    equipmentType: "bulk" as const,
    variantId: null,
    variantLabel: null,
    availableQty: 12,
    unit: "rolos",
    availableUnits: [],
  },
];

const initialLog = [
  {
    id: "log-1",
    eventEquipmentId: "ee-1",
    equipmentId: "eq-1",
    equipmentName: "Cabo XLR",
    variantId: "variant-1",
    variantLabel: "10 m",
    equipmentUnitId: "unit-1",
    qty: 1,
    reason: "Cliente pediu reforço",
    addedBy: "user-1",
    addedByName: "Maria Souza",
    createdAt: "2026-08-20T18:00:00.000Z",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scannerOnResult = null;
  mocks.registerExtraSerializedMaterial.mockResolvedValue({
    ok: true,
    equipmentId: "eq-1",
    eventEquipmentId: "ee-new-serialized",
    unitId: "unit-new",
    qty: 2,
    extraQty: 1,
    variantId: "variant-1",
    addedQty: 1,
    logId: "log-new-serialized",
    addedAt: "2026-08-20T19:00:00.000Z",
    addedBy: "user-current",
  });
  mocks.registerExtraSerializedMaterialByUnitId.mockResolvedValue({
    ok: true,
    equipmentId: "eq-1",
    variantId: "variant-1",
    eventEquipmentId: "ee-new-manual",
    unitId: "unit-2",
    qty: 2,
    extraQty: 1,
    addedQty: 1,
    logId: "log-new-manual",
    addedAt: "2026-08-20T19:05:00.000Z",
    addedBy: "user-current",
  });
  mocks.registerExtraBulkMaterial.mockResolvedValue({
    ok: true,
    equipmentId: "eq-2",
    eventEquipmentId: "ee-new-bulk",
    qty: 3,
    extraQty: 3,
    variantId: null,
    addedQty: 3,
    logId: "log-new-bulk",
    addedAt: "2026-08-20T19:10:00.000Z",
    addedBy: "user-current",
  });
});

describe("ExtraMaterialPanel", () => {
  it("renderiza motivo obrigatório, busca, candidatos e histórico inicial", () => {
    render(
      <ExtraMaterialPanel eventId="event-1" candidates={candidates} initialLog={initialLog} />
    );

    expect(screen.getByLabelText("Motivo do material extra")).toBeRequired();
    expect(screen.getByPlaceholderText("Buscar material no estoque...")).toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: "Materiais disponíveis" })).getByText(
        "Cabo XLR · 10 m"
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Cliente pediu reforço")).toBeInTheDocument();
    expect(screen.getByText(/Maria Souza/)).toHaveTextContent("20/08/2026 às 15:00");
  });

  it("filtra os candidatos por nome e variante", async () => {
    const user = userEvent.setup();
    render(
      <ExtraMaterialPanel eventId="event-1" candidates={candidates} initialLog={initialLog} />
    );

    await user.type(screen.getByPlaceholderText("Buscar material no estoque..."), "10 m");

    const availableMaterials = within(
      screen.getByRole("list", { name: "Materiais disponíveis" })
    );
    expect(availableMaterials.getByText("Cabo XLR · 10 m")).toBeInTheDocument();
    expect(availableMaterials.queryByText("Fita gaffer")).not.toBeInTheDocument();
  });

  it("não chama nenhuma action quando o motivo contém somente espaços", async () => {
    const user = userEvent.setup();
    render(
      <ExtraMaterialPanel eventId="event-1" candidates={candidates} initialLog={initialLog} />
    );

    await user.type(screen.getByLabelText("Motivo do material extra"), "   ");
    fireEvent.click(screen.getByRole("button", { name: "Simular QR" }));
    await user.click(screen.getByRole("button", { name: "Selecionar Fita gaffer" }));
    fireEvent.submit(screen.getByRole("form", { name: "Adicionar material em lote" }));

    expect(mocks.registerExtraSerializedMaterial).not.toHaveBeenCalled();
    expect(mocks.registerExtraBulkMaterial).not.toHaveBeenCalled();
  });

  it("registra QR serializado com o motivo normalizado e atualiza o histórico", async () => {
    const user = userEvent.setup();
    render(
      <ExtraMaterialPanel eventId="event-1" candidates={candidates} initialLog={initialLog} />
    );

    const reason = screen.getByLabelText("Motivo do material extra");
    await user.type(reason, "  Cliente pediu reforço  ");
    fireEvent.click(screen.getByRole("button", { name: "Simular QR" }));

    await waitFor(() =>
      expect(mocks.registerExtraSerializedMaterial).toHaveBeenCalledWith(
        "event-1",
        "QR-123",
        "Cliente pediu reforço"
      )
    );
    expect(reason).toHaveValue("  Cliente pediu reforço  ");
    expect(
      within(screen.getByRole("list", { name: "Histórico de materiais extras" })).getAllByText(
        "Cliente pediu reforço"
      )
    ).toHaveLength(2);
  });

  it("não fabrica quantidade nem auditoria para QR idempotente", async () => {
    const user = userEvent.setup();
    mocks.registerExtraSerializedMaterial.mockResolvedValueOnce({
      ok: true,
      equipmentId: "eq-1",
      variantId: "variant-1",
      eventEquipmentId: "ee-1",
      unitId: "unit-1",
      qty: 2,
      extraQty: 1,
      addedQty: 0,
    });
    render(
      <ExtraMaterialPanel eventId="event-1" candidates={candidates} initialLog={initialLog} />
    );

    await user.type(screen.getByLabelText("Motivo do material extra"), "QR já bipado");
    await user.click(screen.getByRole("button", { name: "Simular QR" }));

    await waitFor(() => expect(mocks.registerExtraSerializedMaterial).toHaveBeenCalledOnce());
    expect(
      within(screen.getByRole("list", { name: "Histórico de materiais extras" })).queryByText(
        "QR já bipado"
      )
    ).not.toBeInTheDocument();
    expect(mocks.toastInfo).toHaveBeenCalledWith("Esta unidade já estava carregada nesta OS.");
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.scanFeedbackSuccess).not.toHaveBeenCalled();
  });

  it("usa equipmentId e variantId para identificar a variante serializada exata", async () => {
    const user = userEvent.setup();
    mocks.registerExtraSerializedMaterial.mockResolvedValueOnce({
      ok: true,
      equipmentId: "eq-1",
      variantId: "variant-2",
      eventEquipmentId: "ee-variant-2",
      unitId: "unit-20",
      qty: 1,
      extraQty: 1,
      addedQty: 1,
      logId: "log-variant-2",
      addedAt: "2026-08-20T19:20:00.000Z",
      addedBy: "user-current",
    });
    render(
      <ExtraMaterialPanel eventId="event-1" candidates={candidates} initialLog={initialLog} />
    );

    await user.type(screen.getByLabelText("Motivo do material extra"), "Cabo mais longo");
    await user.click(screen.getByRole("button", { name: "Simular QR" }));

    const history = within(screen.getByRole("list", { name: "Histórico de materiais extras" }));
    await waitFor(() => expect(history.getByText("Cabo XLR · 20 m")).toBeInTheDocument());
    expect(history.queryAllByText("Cabo XLR · 10 m")).toHaveLength(1);
  });

  it("reconcilia logs otimistas com props canônicas sem perder inserções concorrentes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ExtraMaterialPanel eventId="event-1" candidates={candidates} initialLog={initialLog} />
    );

    await user.type(screen.getByLabelText("Motivo do material extra"), "Operação local");
    await user.click(screen.getByRole("button", { name: "Simular QR" }));
    await waitFor(() =>
      expect(
        within(screen.getByRole("list", { name: "Histórico de materiais extras" })).getByText(
          "Operação local"
        )
      ).toBeInTheDocument()
    );

    const concurrentLog = {
      ...initialLog[0],
      id: "log-concurrent",
      reason: "Operação concorrente",
      createdAt: "2026-08-20T19:30:00.000Z",
    };
    rerender(
      <ExtraMaterialPanel
        eventId="event-1"
        candidates={candidates}
        initialLog={[concurrentLog, ...initialLog]}
      />
    );
    let history = within(screen.getByRole("list", { name: "Histórico de materiais extras" }));
    expect(history.getByText("Operação local")).toBeInTheDocument();
    expect(history.getByText("Operação concorrente")).toBeInTheDocument();

    const canonicalLocalLog = {
      ...initialLog[0],
      id: "log-new-serialized",
      reason: "Operação local",
      addedByName: "João Canônico",
      createdAt: "2026-08-20T19:00:00.000Z",
    };
    rerender(
      <ExtraMaterialPanel
        eventId="event-1"
        candidates={candidates}
        initialLog={[concurrentLog, canonicalLocalLog, ...initialLog]}
      />
    );

    history = within(screen.getByRole("list", { name: "Histórico de materiais extras" }));
    expect(history.getAllByText("Operação local")).toHaveLength(1);
    expect(history.getByText(/João Canônico/)).toBeInTheDocument();
    expect(history.getByText("Operação concorrente")).toBeInTheDocument();
  });

  it("seleciona e registra manualmente uma unidade serializada sem QR", async () => {
    const user = userEvent.setup();
    render(
      <ExtraMaterialPanel eventId="event-1" candidates={candidates} initialLog={initialLog} />
    );

    await user.type(screen.getByLabelText("Motivo do material extra"), "Etiqueta ilegível");
    await user.click(
      screen.getByRole("button", { name: "Selecionar unidade de Cabo XLR · 10 m" })
    );
    await user.selectOptions(screen.getByLabelText("Unidade de Cabo XLR · 10 m"), "unit-2");
    await user.click(screen.getByRole("button", { name: "Adicionar unidade" }));

    await waitFor(() =>
      expect(mocks.registerExtraSerializedMaterialByUnitId).toHaveBeenCalledWith(
        "event-1",
        "unit-2",
        "Etiqueta ilegível"
      )
    );
    expect(screen.queryByLabelText("Unidade de Cabo XLR · 10 m")).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: "Histórico de materiais extras" })).getByText(
        "Etiqueta ilegível"
      )
    ).toBeInTheDocument();
  });

  it("registra a quantidade selecionada de material em lote", async () => {
    const user = userEvent.setup();
    render(
      <ExtraMaterialPanel eventId="event-1" candidates={candidates} initialLog={initialLog} />
    );

    await user.type(screen.getByLabelText("Motivo do material extra"), "Reserva técnica");
    await user.click(screen.getByRole("button", { name: "Selecionar Fita gaffer" }));
    const quantity = screen.getByLabelText("Quantidade de Fita gaffer");
    await user.clear(quantity);
    await user.type(quantity, "3");
    await user.click(screen.getByRole("button", { name: "Adicionar material" }));

    await waitFor(() =>
      expect(mocks.registerExtraBulkMaterial).toHaveBeenCalledWith({
        eventId: "event-1",
        equipmentId: "eq-2",
        variantId: null,
        qty: 3,
        reason: "Reserva técnica",
      })
    );
    expect(screen.queryByLabelText("Quantidade de Fita gaffer")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Motivo do material extra")).toHaveValue("Reserva técnica");
    expect(
      within(screen.getByRole("list", { name: "Histórico de materiais extras" })).getByText(
        "Reserva técnica"
      )
    ).toBeInTheDocument();
  });

  it("mantém o motivo após falha da action", async () => {
    const user = userEvent.setup();
    mocks.registerExtraSerializedMaterial.mockResolvedValueOnce({
      ok: false,
      error: "Material indisponível.",
    });
    render(
      <ExtraMaterialPanel eventId="event-1" candidates={candidates} initialLog={initialLog} />
    );

    const reason = screen.getByLabelText("Motivo do material extra");
    await user.type(reason, "Reserva para contingência");
    fireEvent.click(screen.getByRole("button", { name: "Simular QR" }));

    await waitFor(() => expect(mocks.registerExtraSerializedMaterial).toHaveBeenCalledOnce());
    expect(reason).toHaveValue("Reserva para contingência");
  });
});

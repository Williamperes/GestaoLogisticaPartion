import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { Equipment } from "@/lib/inventory";
import { buildInventoryPdfRows, generateInventoryPdf } from "@/lib/inventory-pdf";

const baseEquipment: Equipment = {
  id: "eq-1",
  organizationId: "org-1",
  categoryId: "cat-1",
  categoryName: "Mesas",
  parentCategoryId: "parent-1",
  parentCategoryName: "Áudio",
  name: "Mesa X32",
  brand: "Behringer",
  model: "X32",
  type: "serialized",
  status: "available",
  hasVariants: false,
  serial: "SN-001",
  patrimony: "PAT-001",
  purchaseDate: null,
  purchaseValueCents: null,
  qrCode: null,
  notes: null,
  createdAt: "2026-01-01",
};

describe("inventory PDF", () => {
  it("inclui serializados, consumíveis e todas as variantes nas linhas", () => {
    const items: Equipment[] = [
      baseEquipment,
      {
        ...baseEquipment,
        id: "eq-2",
        name: "Fita Gaffer",
        type: "bulk",
        serial: null,
        patrimony: null,
        bulk: {
          id: "bulk-1",
          equipmentId: "eq-2",
          variantId: null,
          unit: "rolos",
          totalQty: 20,
          availableQty: 12,
        },
      },
      {
        ...baseEquipment,
        id: "eq-3",
        name: "Cabo XLR",
        type: "bulk",
        hasVariants: true,
        serial: null,
        patrimony: null,
        variants: [
          { id: "v-1", equipmentId: "eq-3", label: "5 m", sortValue: 5, position: 0, notes: null, totalQty: 8, availableQty: 6 },
          { id: "v-2", equipmentId: "eq-3", label: "10 m", sortValue: 10, position: 1, notes: null, totalQty: 4, availableQty: 3 },
        ],
      },
    ];

    expect(buildInventoryPdfRows(items)).toEqual([
      expect.objectContaining({ name: "Mesa X32", category: "Áudio › Mesas", type: "Serializado", identifier: "PAT-001 / SN-001", total: "1", available: "1" }),
      expect.objectContaining({ name: "Fita Gaffer", type: "Estoque", total: "20 rolos", available: "12 rolos" }),
      expect.objectContaining({ name: "Cabo XLR — 5 m", total: "8", available: "6" }),
      expect.objectContaining({ name: "Cabo XLR — 10 m", total: "4", available: "3" }),
    ]);
  });

  it("gera um documento PDF válido mesmo sem itens", async () => {
    const bytes = await generateInventoryPdf([], new Date("2026-08-17T12:00:00-03:00"));
    const document = await PDFDocument.load(bytes);

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(document.getPageCount()).toBe(1);
  });
});

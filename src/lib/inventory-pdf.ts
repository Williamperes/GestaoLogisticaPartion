import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Equipment, EquipmentStatus } from "@/lib/inventory";

export interface InventoryPdfRow {
  category: string;
  name: string;
  type: string;
  identifier: string;
  total: string;
  available: string;
  status: string;
}

const STATUS_LABELS: Record<EquipmentStatus, string> = {
  available: "Disponível",
  reserved: "Reservado",
  in_field: "Em campo",
  maintenance: "Manutenção",
  inactive: "Inativo",
};

function equipmentCategory(item: Equipment) {
  if (item.parentCategoryName && item.categoryName) {
    return `${item.parentCategoryName} › ${item.categoryName}`;
  }
  return item.categoryName ?? item.parentCategoryName ?? "Sem categoria";
}

function serializedIdentifier(item: Equipment) {
  return [item.patrimony, item.serial].filter(Boolean).join(" / ") || "—";
}

export function buildInventoryPdfRows(items: Equipment[]): InventoryPdfRow[] {
  return items.flatMap((item) => {
    const base = {
      category: equipmentCategory(item),
      type: item.type === "serialized" ? "Serializado" : "Estoque",
      identifier: item.type === "serialized" ? serializedIdentifier(item) : "—",
      status: STATUS_LABELS[item.status],
    };

    if (item.hasVariants && item.variants?.length) {
      return item.variants.map((variant) => ({
        ...base,
        name: `${item.name} — ${variant.label}`,
        total: String(variant.totalQty ?? 0),
        available: String(variant.availableQty ?? 0),
      }));
    }

    if (item.type === "bulk") {
      const unit = item.bulk?.unit ? ` ${item.bulk.unit}` : "";
      return [{
        ...base,
        name: item.name,
        total: `${item.bulk?.totalQty ?? 0}${unit}`,
        available: `${item.bulk?.availableQty ?? 0}${unit}`,
      }];
    }

    return [{
      ...base,
      name: item.name,
      total: String(item.unitCount ?? 1),
      available: String(item.availableUnitCount ?? (item.status === "available" ? 1 : 0)),
    }];
  });
}

const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const MARGIN = 36;
const ROW_HEIGHT = 22;
const TABLE_HEADER_HEIGHT = 25;
const COLUMNS = [
  { key: "category", label: "Categoria", width: 135 },
  { key: "name", label: "Item", width: 200 },
  { key: "type", label: "Tipo", width: 75 },
  { key: "identifier", label: "Patrimônio / série", width: 120 },
  { key: "total", label: "Total", width: 70 },
  { key: "available", label: "Disponível", width: 70 },
  { key: "status", label: "Situação", width: 100 },
] as const;

function fitText(text: string, font: PDFFont, size: number, width: number) {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let shortened = text;
  while (shortened.length > 1 && font.widthOfTextAtSize(`${shortened}…`, size) > width) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}…`;
}

function drawTableHeader(page: PDFPage, font: PDFFont, y: number) {
  page.drawRectangle({ x: MARGIN, y: y - TABLE_HEADER_HEIGHT, width: PAGE_WIDTH - MARGIN * 2, height: TABLE_HEADER_HEIGHT, color: rgb(0.12, 0.15, 0.2) });
  let x = MARGIN;
  for (const column of COLUMNS) {
    page.drawText(column.label, { x: x + 5, y: y - 16, size: 8, font, color: rgb(1, 1, 1) });
    x += column.width;
  }
  return y - TABLE_HEADER_HEIGHT;
}

function drawDocumentHeader(page: PDFPage, bold: PDFFont, regular: PDFFont, itemCount: number, rowCount: number, generatedAt: Date) {
  page.drawText("PARTION", { x: MARGIN, y: PAGE_HEIGHT - 48, size: 11, font: bold, color: rgb(0.93, 0.22, 0.3) });
  page.drawText("Inventário completo", { x: MARGIN, y: PAGE_HEIGHT - 76, size: 22, font: bold, color: rgb(0.08, 0.1, 0.14) });
  const generatedLabel = generatedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  page.drawText(`Emitido em ${generatedLabel}`, { x: PAGE_WIDTH - MARGIN - 150, y: PAGE_HEIGHT - 48, size: 8, font: regular, color: rgb(0.4, 0.43, 0.48) });
  page.drawText(`${itemCount} itens cadastrados • ${rowCount} linhas de estoque`, { x: MARGIN, y: PAGE_HEIGHT - 96, size: 9, font: regular, color: rgb(0.4, 0.43, 0.48) });
}

export async function generateInventoryPdf(items: Equipment[], generatedAt = new Date()): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const rows = buildInventoryPdfRows(items).sort((a, b) =>
    `${a.category}\u0000${a.name}`.localeCompare(`${b.category}\u0000${b.name}`, "pt-BR")
  );

  let page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawDocumentHeader(page, bold, regular, items.length, rows.length, generatedAt);
  let y = drawTableHeader(page, bold, PAGE_HEIGHT - 120);

  if (rows.length === 0) {
    page.drawText("Nenhum item cadastrado no inventário.", { x: MARGIN + 5, y: y - 25, size: 10, font: regular, color: rgb(0.4, 0.43, 0.48) });
  }

  rows.forEach((row, rowIndex) => {
    if (y - ROW_HEIGHT < 42) {
      page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      drawDocumentHeader(page, bold, regular, items.length, rows.length, generatedAt);
      y = drawTableHeader(page, bold, PAGE_HEIGHT - 120);
    }

    const background = rowIndex % 2 === 0 ? rgb(0.97, 0.975, 0.98) : rgb(1, 1, 1);
    page.drawRectangle({ x: MARGIN, y: y - ROW_HEIGHT, width: PAGE_WIDTH - MARGIN * 2, height: ROW_HEIGHT, color: background });
    let x = MARGIN;
    for (const column of COLUMNS) {
      const value = row[column.key];
      page.drawText(fitText(value, regular, 7.5, column.width - 10), {
        x: x + 5,
        y: y - 14,
        size: 7.5,
        font: regular,
        color: rgb(0.16, 0.18, 0.22),
      });
      x += column.width;
    }
    y -= ROW_HEIGHT;
  });

  const pages = document.getPages();
  pages.forEach((currentPage, index) => {
    currentPage.drawText(`Página ${index + 1} de ${pages.length}`, {
      x: PAGE_WIDTH - MARGIN - 70,
      y: 22,
      size: 8,
      font: regular,
      color: rgb(0.45, 0.47, 0.52),
    });
  });

  return document.save();
}

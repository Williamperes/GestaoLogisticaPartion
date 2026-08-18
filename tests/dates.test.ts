import { describe, expect, it } from "vitest";

import { parseLocalDate, formatDateBR, formatDateTimeBR } from "@/lib/dates";

describe("parseLocalDate", () => {
  it("cria um Date no fuso local (sem deslocamento UTC)", () => {
    const d = parseLocalDate("2026-02-28");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(1); // fevereiro = 1
    expect(d.getDate()).toBe(28);
    expect(d.getHours()).toBe(0);
  });

  it("não regride para o dia anterior em fusos negativos", () => {
    // O bug que esta util previne: new Date('2026-01-01') seria UTC midnight.
    const d = parseLocalDate("2026-01-01");
    expect(d.getDate()).toBe(1);
    expect(d.getMonth()).toBe(0);
  });
});

describe("formatDateBR", () => {
  it("formata YYYY-MM-DD em DD/MM/YYYY", () => {
    expect(formatDateBR("2026-02-28")).toBe("28/02/2026");
  });

  it("preserva o primeiro dia do ano", () => {
    expect(formatDateBR("2026-01-01")).toBe("01/01/2026");
  });
});

describe("formatDateTimeBR", () => {
  it("formata instante no fuso de Sao Paulo", () => {
    expect(formatDateTimeBR("2026-08-17T15:30:00.000Z")).toBe("17/08/2026 às 12:30");
  });
});

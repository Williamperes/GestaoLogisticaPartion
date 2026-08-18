// Util compartilhado para parse / format de colunas `date` (sem hora).
// Motivo: `new Date("2026-02-28")` interpreta como UTC midnight, então em
// fusos negativos o toLocaleDateString mostra o dia anterior. Aqui criamos
// um Date no fuso LOCAL, garantindo que "2026-02-28" exibe "28/02/2026".

/** Converte "YYYY-MM-DD" em Date local (00:00 no fuso do navegador/servidor). */
export function parseLocalDate(yyyymmdd: string): Date {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Formata "YYYY-MM-DD" em "DD/MM/YYYY" sem deslocamento de fuso. */
export function formatDateBR(yyyymmdd: string): string {
  return parseLocalDate(yyyymmdd).toLocaleDateString("pt-BR");
}

/** Formata um timestamptz no fuso operacional da Partion. */
export function formatDateTimeBR(iso: string): string {
  const formatted = new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return formatted.replace(",", " às");
}

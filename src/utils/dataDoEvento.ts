/**
 * Data de evento vem como "AAAA-MM-DD" (sem hora). `new Date("2026-10-10")` lê
 * como meia-noite em UTC, que no Brasil ainda é dia 9 às 21h — o cartão do
 * evento mostrava "sex. 9" para um evento do dia 10. Lê como meio-dia local.
 */
export function dataDoEvento(valor: string | null | undefined): Date {
  const s = String(valor || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00`) : new Date(s);
}

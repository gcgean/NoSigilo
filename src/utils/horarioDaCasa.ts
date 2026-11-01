/**
 * Horário d'A Casa (espelha HORA_DE_FECHAR do backend/src/casa.ts): sexta das 22h
 * até 1h e, desde 07/11/2026, sábado das 22h até 2h.
 */
export const HORARIO_DA_CASA_TEXTO = 'sexta e sábado às 22h (sexta até 1h, sábado até 2h)';

/** Hora em que fecha a noite de hoje (ou a que está rolando na madrugada): "1h" ou "2h". */
export function fechaHoje(agora = Date.now()) {
  const brasilia = new Date(agora - 3 * 3_600_000);
  const dia = brasilia.getUTCDay();
  const hora = brasilia.getUTCHours();
  return dia === 6 || (dia === 0 && hora < 12) ? '2h' : '1h';
}

/**
 * Horário d'A Casa (espelha HORA_DE_FECHAR do backend/src/casa.ts): sexta das 22h
 * até 1h e, desde 07/11/2026, sábado das 22h até 2h.
 */
export const HORARIO_DA_CASA_TEXTO = 'sexta e sábado às 22h (sexta até 1h, sábado até 2h)';

/** Hora de Brasília (ex.: 22, ou 25 = 1h do dia seguinte) em Lisboa, com o horário de verão de lá. */
export function horaEmLisboa(horaBrasilia: number, agora = Date.now()) {
  const hoje = new Date(agora - 3 * 3_600_000);
  const instante = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate(), horaBrasilia + 3));
  const h = new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', hour: 'numeric', hourCycle: 'h23' }).format(instante);
  return `${Number(h)}h`;
}

/** Para quem é de Portugal: o horário d'A Casa no relógio de Lisboa. */
export function horarioDaCasaEmLisboa(agora = Date.now()) {
  return `em Lisboa: abre às ${horaEmLisboa(22, agora)} e fecha às ${horaEmLisboa(25, agora)} na sexta e às ${horaEmLisboa(26, agora)} no sábado`;
}

/** Hora em que fecha a noite de hoje (ou a que está rolando na madrugada): "1h" ou "2h". */
export function fechaHoje(agora = Date.now()) {
  const brasilia = new Date(agora - 3 * 3_600_000);
  const dia = brasilia.getUTCDay();
  const hora = brasilia.getUTCHours();
  return dia === 6 || (dia === 0 && hora < 12) ? '2h' : '1h';
}

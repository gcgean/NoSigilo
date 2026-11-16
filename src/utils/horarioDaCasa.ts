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
  // Em Lisboa a noite de Brasília já é madrugada: sexta 22h aqui = sábado 1h lá.
  const abre = horaEmLisboa(22, agora);
  return `em Lisboa: na madrugada de sábado, ${deHora(abre)} ${aHora(horaEmLisboa(25, agora))}, e na de domingo, ${deHora(abre)} ${aHora(horaEmLisboa(26, agora))}`;
}

/** Hora em que fecha a noite de hoje (ou a que está rolando na madrugada): "1h" ou "2h". */
export function fechaHoje(agora = Date.now()) {
  const brasilia = new Date(agora - 3 * 3_600_000);
  const dia = brasilia.getUTCDay();
  const hora = brasilia.getUTCHours();
  return dia === 6 || (dia === 0 && hora < 12) ? '2h' : '1h';
}

/** "à 1h" / "às 22h" (com o artigo certo para a 1h). */
export const aHora = (h: string) => (h === '1h' ? `à ${h}` : `às ${h}`);
/** "da 1h" / "das 2h". */
export const deHora = (h: string) => (h === '1h' ? `da ${h}` : `das ${h}`);

/** Visitante sem conta: o fuso do navegador diz se está em Portugal (continente, Madeira ou Açores). */
export function navegadorEmPortugal() {
  try {
    return /^(Europe\/Lisbon|Atlantic\/Madeira|Atlantic\/Azores)$/.test(Intl.DateTimeFormat().resolvedOptions().timeZone || '');
  } catch {
    return false;
  }
}

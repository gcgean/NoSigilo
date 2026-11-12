// Avisos de stories (11/11/2026). Regras e textos, sem banco — o agendador
// fica em app.ts (startAvisosDeStoriesScheduler).
//
// Dados que motivaram (30 dias até 11/11): só 1 em 3 pessoas ativas abriu os
// stories; o pico de visualização é 22h–23h; mulheres postam pouco (99 em 30
// dias) e são as mais curtidas (18 curtidas por story contra 0,8 dos homens).

/** Aviso "stories novos" vai às 21h (BRT), antes do pico das 22h–23h. */
export const HORA_STORIES_NOVOS = 21;
/** Incentivo para mulheres vai às 20h (BRT): dá tempo de postar antes do pico. */
export const HORA_INCENTIVO_MULHER = 20;
/** Mínimo de stories não vistos da região para valer o aviso. */
export const MIN_STORIES_PARA_AVISO = 3;
/** Stories novos: no máximo 1 por dia e 3 por semana por pessoa. */
export const MAX_STORIES_NOVOS_POR_SEMANA = 3;
/** Incentivo: no máximo 1 a cada 3 dias por mulher. */
export const INTERVALO_INCENTIVO_DIAS = 3;
/** Só incentiva quem teve público de verdade no último story. */
export const MIN_VIEWS_PARA_INCENTIVO = 30;
/** Tokens do primeiro story da semana (só mulheres). */
export const TOKENS_PRIMEIRO_STORY_SEMANA = 15;

export function textoStoriesNovos(n: number, uf: string | null): { title: string; body: string } {
  const lugar = uf ? `de ${uf.toUpperCase()}` : 'perto de você';
  return {
    title: '👀 Stories novos hoje',
    body: n === 1 ? `Tem 1 story novo de gente ${lugar}. Veja antes que suma!` : `Tem ${n} stories novos de gente ${lugar}. Veja antes que sumam!`,
  };
}

export function textoIncentivoMulher(views: number): { title: string; body: string } {
  return {
    title: `🔥 Seu story teve ${views} visualizações`,
    body: `A galera gostou! Poste outro hoje — o primeiro story da semana vale +${TOKENS_PRIMEIRO_STORY_SEMANA} tokens.`,
  };
}

/** Identificador da semana (segunda a domingo, horário de Brasília), ex. "2026-W46". */
export function semanaDoStory(agora = Date.now()): string {
  const brt = new Date(agora - 3 * 60 * 60 * 1000);
  const d = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate()));
  const diaSemana = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - diaSemana);
  const inicioAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((d.getTime() - inicioAno.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(semana).padStart(2, '0')}`;
}

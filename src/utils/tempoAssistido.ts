// Quanto tempo a pessoa ficou em cada vídeo do Reels. É o sinal principal do
// "Para você" (backend/src/videosParaVoce.ts): ficar mais, ver até o fim ou
// rever = gostou.
//
// Conta só o tempo em que o vídeo REALMENTE tocou (soma os avanços do
// currentTime entre um timeupdate e outro). Pausa, buffer e vídeo parado na
// tela não somam, e pular para frente não vale como tempo assistido.
// A sessão vai para o servidor quando a pessoa troca de vídeo, sai da tela ou
// fecha o app (fetch com keepalive, que sobrevive ao fechamento da página).
import { API_URL } from '@/utils/apiClient';

type Sessao = { postId: string; ms: number; duracaoMs: number; completou: boolean; ultimo: number | null };

const sessoes = new Map<string, Sessao>();

export function registrarTempo(reelId: string, postId: string, video: HTMLVideoElement) {
  if (!postId || video.paused) return;
  let s = sessoes.get(reelId);
  if (!s) { s = { postId, ms: 0, duracaoMs: 0, completou: false, ultimo: null }; sessoes.set(reelId, s); }
  if (Number.isFinite(video.duration) && video.duration > 0) s.duracaoMs = Math.round(video.duration * 1000);
  const agora = video.currentTime;
  if (s.ultimo !== null) {
    const passo = agora - s.ultimo;
    // timeupdate chega a cada ~250 ms; salto maior que 1,5 s é seek, não tempo visto.
    if (passo > 0 && passo < 1.5) s.ms += passo * 1000;
  }
  s.ultimo = agora;
}

/** Seek ou recomeço: o próximo timeupdate não soma o salto. */
export function marcarSalto(reelId: string) {
  const s = sessoes.get(reelId);
  if (s) s.ultimo = null;
}

export function marcarFim(reelId: string) {
  const s = sessoes.get(reelId);
  if (!s) return;
  s.completou = true;
  s.ultimo = null;
}

export function enviarSessao(reelId: string) {
  const s = sessoes.get(reelId);
  sessoes.delete(reelId);
  // Menos de meio segundo é só o vídeo passando na tela durante o deslize.
  if (!s || s.duracaoMs <= 0 || s.ms < 500) return;
  let token: string | null = null;
  try { token = localStorage.getItem('token'); } catch { /* sem storage */ }
  if (!token) return;
  void fetch(`${API_URL}/videos/assistido`, {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ postId: s.postId, assistidoMs: Math.round(s.ms), duracaoMs: s.duracaoMs, completou: s.completou }),
  }).catch(() => { /* métrica nunca atrapalha o vídeo */ });
}

export function enviarTodas() {
  for (const id of [...sessoes.keys()]) enviarSessao(id);
}

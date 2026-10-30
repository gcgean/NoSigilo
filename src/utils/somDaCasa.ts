/**
 * Sons dos efeitos d'A Casa (drinks, ações da cabine, avisos da Lola).
 * Baixinhos, por baixo da música da rádio, e com 🔇 que fica guardado.
 * Sem voz nem gemido: discrição em primeiro lugar.
 *
 * Cada efeito toca o arquivo de ARQUIVOS (public/sons/casa) quando existir;
 * sem arquivo, cai num som sintetizado aqui mesmo.
 */

const CHAVE = 'nosigilo:casa-efeitos-som';
const VOLUME = 0.5;

// Efeito → arquivo em public/sons/casa (Pixabay, licença livre). "vezes" repete
// o som no ritmo da ação (tapas do colo/de quatro/cavalgar).
type Arquivo = { arq: string; vezes?: number; intervalo?: number };
const A = (arq: string, vezes = 1, intervalo = 0): Arquivo => ({ arq: `/sons/casa/${arq}.mp3`, vezes, intervalo });
const ARQUIVOS: Record<string, Arquivo> = {
  cerveja: A('cerveja'), caipirinha: A('caipirinha'), gin: A('gin'), champanhe: A('champanhe'), brinde: A('brinde'),
  beijo: A('beijo'), pescoco: A('pescoco'), mao: A('mao'), roupa: A('roupa'),
  chupar: A('chupar', 2, 0.45), chupar_buceta: A('chupar', 2, 0.45), chupar_pica: A('chupar', 2, 0.45),
  colo: A('colo', 3, 0.42), quatro: A('colo', 4, 0.3), cavalgar: A('colo', 4, 0.34),
  papai: A('papai'), gozar: A('gozar'), dado: A('dado'), nivel: A('nivel'), chegou: A('chegou'),
};

const ouvintes = new Set<(v: boolean) => void>();

export function somLigado(): boolean {
  try { return localStorage.getItem(CHAVE) !== '0'; } catch { return true; }
}

export function ligarSom(v: boolean) {
  try { localStorage.setItem(CHAVE, v ? '1' : '0'); } catch { /* sem storage: vale só agora */ }
  ouvintes.forEach((f) => f(v));
}

export function aoMudarSom(f: (v: boolean) => void) {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}

let ctx: AudioContext | null = null;
function contexto(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return null;
      ctx = new Ctx();
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return ctx;
  } catch { return null; }
}

// iPhone só libera áudio depois de um toque: destrava no primeiro toque na tela.
if (typeof window !== 'undefined') {
  const destravar = () => { contexto(); window.removeEventListener('pointerdown', destravar); };
  window.addEventListener('pointerdown', destravar, { passive: true });
}

// ─── Blocos do sintetizador ───────────────────────────────────────────────
type No = { c: AudioContext; saida: AudioNode };

function ruido(c: AudioContext, seg: number) {
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * seg)), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function envelope(c: AudioContext, t0: number, ataque: number, dur: number, pico: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(pico, t0 + ataque);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  return g;
}

function tom({ c, saida }: No, t0: number, freq: number, dur: number, pico = 0.3, tipo: OscillatorType = 'sine', ate?: number) {
  const o = c.createOscillator();
  o.type = tipo;
  o.frequency.setValueAtTime(freq, t0);
  if (ate) o.frequency.exponentialRampToValueAtTime(ate, t0 + dur);
  const g = envelope(c, t0, Math.min(0.02, dur / 4), dur, pico);
  o.connect(g); g.connect(saida);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

function chiado({ c, saida }: No, t0: number, dur: number, filtro: BiquadFilterType, freq: number, pico = 0.3, ataque = 0.005, freqAte?: number, q = 1) {
  const s = c.createBufferSource();
  s.buffer = ruido(c, dur + 0.05);
  const f = c.createBiquadFilter();
  f.type = filtro;
  f.frequency.setValueAtTime(freq, t0);
  if (freqAte) f.frequency.exponentialRampToValueAtTime(freqAte, t0 + dur);
  f.Q.value = q;
  const g = envelope(c, t0, ataque, dur, pico);
  s.connect(f); f.connect(g); g.connect(saida);
  s.start(t0); s.stop(t0 + dur + 0.05);
}

// ─── Receitas ─────────────────────────────────────────────────────────────
const tilintar = (n: No, t: number) => [2093, 3136, 4186].forEach((f, i) => tom(n, t, f * (1 + i * 0.003), 0.6 - i * 0.12, 0.12 - i * 0.03));
const beijo = (n: No, t: number) => { chiado(n, t, 0.05, 'bandpass', 1800, 0.5, 0.002, undefined, 2); tom(n, t, 500, 0.06, 0.15, 'sine', 1300); };
const batida = (n: No, t: number, forca = 1) => { tom(n, t, 95, 0.18, 0.5 * forca, 'sine', 50); chiado(n, t, 0.05, 'bandpass', 1200, 0.25 * forca, 0.002); };
const suspiro = (n: No, t: number, dur = 0.9) => chiado(n, t, dur, 'bandpass', 700, 0.18, dur * 0.35, 500, 0.7);

const RECEITAS: Record<string, (n: No, t: number) => void> = {
  cerveja: (n, t) => { chiado(n, t, 0.03, 'highpass', 2000, 0.4); chiado(n, t + 0.03, 0.6, 'highpass', 5000, 0.15, 0.01, 7000); tilintar(n, t + 0.75); },
  caipirinha: (n, t) => { for (let i = 0; i < 4; i++) tom(n, t + i * 0.09 + Math.random() * 0.03, 2400 + Math.random() * 1400, 0.12, 0.08); },
  gin: (n, t) => { for (let i = 0; i < 3; i++) tom(n, t + i * 0.11, 2800 + Math.random() * 1200, 0.15, 0.08); },
  champanhe: (n, t) => { chiado(n, t, 0.06, 'lowpass', 1500, 0.7); tom(n, t, 420, 0.08, 0.4, 'sine', 120); chiado(n, t + 0.08, 1.2, 'highpass', 6000, 0.1, 0.05, 9000); },
  brinde: (n, t) => { tilintar(n, t); tilintar(n, t + 0.16); },
  beijo: (n, t) => { beijo(n, t); beijo(n, t + 0.28); },
  pescoco: (n, t) => { suspiro(n, t); beijo(n, t + 0.7); },
  mao: (n, t) => chiado(n, t, 0.9, 'bandpass', 400, 0.18, 0.3, 1400, 0.8),
  roupa: (n, t) => {
    // Zíper: estalinhos rápidos subindo de tom, depois o tecido.
    for (let i = 0; i < 18; i++) chiado(n, t + i * 0.022, 0.012, 'bandpass', 2500 + i * 150, 0.25, 0.001, undefined, 4);
    chiado(n, t + 0.45, 0.5, 'lowpass', 2500, 0.2, 0.05, 600);
  },
  colo: (n, t) => { for (let i = 0; i < 3; i++) batida(n, t + i * 0.42, 0.8); },
  chupar: (n, t) => { for (let i = 0; i < 3; i++) chiado(n, t + i * 0.3, 0.18, 'bandpass', 600, 0.25, 0.03, 1600, 3); },
  chupar_buceta: (n, t) => { for (let i = 0; i < 3; i++) chiado(n, t + i * 0.3, 0.18, 'bandpass', 700, 0.25, 0.03, 1800, 3); },
  chupar_pica: (n, t) => { for (let i = 0; i < 3; i++) chiado(n, t + i * 0.3, 0.2, 'bandpass', 500, 0.25, 0.03, 1400, 3); },
  tocar: (n, t) => suspiro(n, t, 1.1),
  cavalgar: (n, t) => { for (let i = 0; i < 4; i++) batida(n, t + i * 0.34, 0.9); },
  quatro: (n, t) => { for (let i = 0; i < 4; i++) batida(n, t + i * 0.3, 1); },
  papai: (n, t) => { for (let i = 0; i < 4; i++) { batida(n, t + i * 0.38, 0.7); tom(n, t + i * 0.38 + 0.05, 180, 0.12, 0.06, 'triangle', 140); } },
  gozar: (n, t) => {
    tom(n, t, 180, 1.1, 0.2, 'sine', 700);
    chiado(n, t, 1.1, 'bandpass', 400, 0.2, 0.9, 3000, 0.8);
    chiado(n, t + 1.1, 0.7, 'highpass', 1500, 0.35, 0.005, 4000);
  },
  // Avisos da Casa
  nivel: (n, t) => { tom(n, t, 55, 0.7, 0.5, 'sine', 40); [523, 659, 784, 1047].forEach((f, i) => tom(n, t + 0.1 + i * 0.09, f, 0.5, 0.1, 'triangle')); },
  dado: (n, t) => { for (let i = 0; i < 6; i++) chiado(n, t + i * 0.07 + Math.random() * 0.02, 0.03, 'bandpass', 1800 + Math.random() * 1500, 0.3 - i * 0.03, 0.001, undefined, 3); },
  porta: (n, t) => { tom(n, t, 140, 0.7, 0.08, 'sawtooth', 210); batida(n, t + 0.7, 0.5); },
  chegou: (n, t) => { tom(n, t, 1319, 0.35, 0.08); tom(n, t + 0.12, 1760, 0.45, 0.07); },
  // Eventos da Casa
  bater: (n, t) => { for (let i = 0; i < 3; i++) { tom(n, t + i * 0.16, 160, 0.09, 0.45, 'sine', 90); chiado(n, t + i * 0.16, 0.03, 'bandpass', 900, 0.2, 0.002); } },
  porta_abrir: (n, t) => { tom(n, t, 120, 0.8, 0.07, 'sawtooth', 260); chiado(n, t, 0.8, 'bandpass', 500, 0.06, 0.2, 900, 2); },
  porta_fechar: (n, t) => { chiado(n, t, 0.25, 'bandpass', 800, 0.06, 0.15, 400, 2); tom(n, t + 0.25, 80, 0.25, 0.6, 'sine', 45); chiado(n, t + 0.25, 0.06, 'lowpass', 600, 0.3, 0.002); },
  nao: (n, t) => { tom(n, t, 520, 0.18, 0.1, 'triangle'); tom(n, t + 0.18, 390, 0.3, 0.1, 'triangle'); },
  olhar: (n, t) => { chiado(n, t, 0.4, 'bandpass', 600, 0.12, 0.15, 2400, 2); tom(n, t + 0.3, 1568, 0.3, 0.06); },
  match: (n, t) => [784, 988, 1175, 1568].forEach((f, i) => tom(n, t + i * 0.08, f, 0.5, 0.09, 'triangle')),
  desafio: (n, t) => { tom(n, t, 110, 0.6, 0.35, 'sawtooth', 80); [440, 466, 523].forEach((f, i) => tom(n, t + 0.15 + i * 0.12, f, 0.3, 0.07, 'square')); },
  moedas: (n, t) => { for (let i = 0; i < 5; i++) tom(n, t + i * 0.07, 2400 + i * 180, 0.18, 0.08, 'square'); },
  fogo: (n, t) => { chiado(n, t, 1.0, 'lowpass', 300, 0.35, 0.5, 2500); tom(n, t, 70, 1.0, 0.25, 'sine', 50); },
  expulso: (n, t) => { tom(n, t, 140, 0.6, 0.25, 'square', 90); },
  jogo: (n, t) => [523, 659, 784].forEach((f, i) => tom(n, t + i * 0.1, f, 0.35, 0.09, 'triangle')),
  fechou: (n, t) => [784, 659, 523, 392].forEach((f, i) => tom(n, t + i * 0.14, f, 0.45, 0.08, 'triangle')),
};

const buffers = new Map<string, AudioBuffer | null>();
async function arquivo(c: AudioContext, id: string): Promise<AudioBuffer | null> {
  const url = ARQUIVOS[id]?.arq;
  if (!url) return null;
  if (buffers.has(url)) return buffers.get(url) ?? null;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(String(r.status));
    const buf = await c.decodeAudioData(await r.arrayBuffer());
    buffers.set(url, buf);
    return buf;
  } catch {
    buffers.set(url, null);
    return null;
  }
}

/** Toca o som de um efeito da Casa (se o som estiver ligado). */
export async function tocarSomDaCasa(id: string) {
  if (!somLigado()) return;
  const c = contexto();
  if (!c) return;
  try {
    const master = c.createGain();
    master.gain.value = VOLUME;
    master.connect(c.destination);
    setTimeout(() => master.disconnect(), 4000);
    const buf = await arquivo(c, id);
    if (buf) {
      const { vezes = 1, intervalo = 0 } = ARQUIVOS[id];
      for (let i = 0; i < vezes; i++) {
        const s = c.createBufferSource();
        s.buffer = buf;
        s.connect(master);
        s.start(c.currentTime + 0.02 + i * intervalo);
      }
      return;
    }
    const receita = RECEITAS[id];
    if (receita) receita({ c, saida: master }, c.currentTime + 0.02);
  } catch { /* sem som */ }
}

/**
 * Áudio dos contos: duração, disfarce de voz e conversão para WAV.
 *
 * Disfarce: a voz é reproduzida mais devagar (tom mais grave) e passa por um
 * modulador leve, que tira o timbre reconhecível sem perder as palavras. Tudo
 * acontece no celular: o arquivo original nunca sobe.
 */
export const AUDIO_MAX_SEG = 180;
export const AUDIOS_POR_CONTO = 5;

/** Duração em segundos (arredonda para cima; 0 se o navegador não souber ler). */
export function duracaoDoAudio(arquivo: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(arquivo);
    const el = new Audio();
    el.preload = 'metadata';
    const fim = (v: number) => { URL.revokeObjectURL(url); resolve(v); };
    el.onloadedmetadata = () => {
      // Gravação do Chrome (webm) vem com duração "Infinity" até tocar até o fim.
      if (!Number.isFinite(el.duration)) {
        el.currentTime = 1e9;
        el.ontimeupdate = () => { el.ontimeupdate = null; fim(Math.ceil(Number.isFinite(el.duration) ? el.duration : 0)); };
        return;
      }
      fim(Math.ceil(el.duration));
    };
    el.onerror = () => fim(0);
    el.src = url;
  });
}

/** Junta os canais num só e escreve um WAV 16-bit (mono). */
export function paraWav(buffer: AudioBuffer): Blob {
  const taxa = buffer.sampleRate;
  const n = buffer.length;
  const mono = new Float32Array(n);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const dados = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) mono[i] += dados[i] / buffer.numberOfChannels;
  }
  const bytes = new ArrayBuffer(44 + n * 2);
  const v = new DataView(bytes);
  const texto = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  texto(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); texto(8, 'WAVE');
  texto(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, taxa, true); v.setUint32(28, taxa * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  texto(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, mono[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([bytes], { type: 'audio/wav' });
}

/** Disfarça a voz e devolve um WAV (16 kHz, mono, leve o bastante para subir). */
export async function disfarcarVoz(arquivo: Blob): Promise<Blob> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const original = await ctx.decodeAudioData(await arquivo.arrayBuffer());
    const velocidade = 0.86; // mais grave
    const taxa = 16000;
    const off = new OfflineAudioContext(1, Math.ceil((original.duration / velocidade) * taxa), taxa);
    const fonte = off.createBufferSource();
    fonte.buffer = original;
    fonte.playbackRate.value = velocidade;
    // Modulador leve: mistura a voz com ela mesma "tremida" a 35 Hz.
    const seca = off.createGain();
    seca.gain.value = 0.55;
    const tremida = off.createGain();
    tremida.gain.value = 0;
    const lfo = off.createOscillator();
    lfo.frequency.value = 35;
    const fundo = off.createGain();
    fundo.gain.value = 0.45;
    lfo.connect(fundo).connect(tremida.gain);
    fonte.connect(seca).connect(off.destination);
    fonte.connect(tremida).connect(off.destination);
    lfo.start();
    fonte.start();
    return paraWav(await off.startRendering());
  } finally {
    void ctx.close();
  }
}

/** "3 min", "45 s", "2 min 10 s". */
export function textoDuracao(seg: number): string {
  if (seg < 60) return `${seg} s`;
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}

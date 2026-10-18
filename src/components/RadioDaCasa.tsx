import { useCallback, useEffect, useRef, useState } from 'react';
import { Music2, Volume1, Volume2, VolumeX } from 'lucide-react';
import apiClient from '@/utils/apiClient';
import { resolveServerUrl } from '@/utils/serverUrl';
import { cn } from '@/lib/utils';

/**
 * Rádio d'A Casa: todo mundo ouve a mesma faixa no mesmo ponto (o servidor diz
 * qual faixa e em que segundo). Começa sem som porque o celular só deixa tocar
 * depois de um toque; o volume e o "mudo" de cada pessoa ficam guardados.
 */
type Tocando = { id: string; titulo: string; artista: string; url: string; duracao: number; offset: number };

const CHAVE_VOLUME = 'nosigilo:casa-volume';
const CHAVE_LIGADO = 'nosigilo:casa-som';

function ler(chave: string, padrao: string) {
  try { return localStorage.getItem(chave) ?? padrao; } catch { return padrao; }
}
function gravar(chave: string, valor: string) {
  try { localStorage.setItem(chave, valor); } catch { /* modo restrito */ }
}

export default function RadioDaCasa() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [tocando, setTocando] = useState<Tocando | null>(null);
  const [ligado, setLigado] = useState(() => ler(CHAVE_LIGADO, '0') === '1');
  const [volume, setVolume] = useState(() => Number(ler(CHAVE_VOLUME, '0.6')) || 0.6);
  const [bloqueado, setBloqueado] = useState(false);
  const [mostrarVolume, setMostrarVolume] = useState(false);

  const sintonizar = useCallback(async () => {
    try {
      const pedidoEm = Date.now();
      const { data } = await apiClient.get('/casa/radio');
      const t: Tocando | null = data?.tocando ?? null;
      setTocando(t);
      const el = audio.current;
      if (!el || !t) return;
      const atraso = (Date.now() - pedidoEm) / 2000;
      const alvo = Math.min(t.offset + atraso, Math.max(0, t.duracao - 0.5));
      const src = resolveServerUrl(t.url);
      if (!el.src.endsWith(t.url)) el.src = src;
      const posicionar = () => { try { el.currentTime = alvo; } catch { /* ainda carregando */ } };
      if (el.readyState >= 1) posicionar(); else el.addEventListener('loadedmetadata', posicionar, { once: true });
      if (ligado) {
        el.play().then(() => setBloqueado(false)).catch(() => setBloqueado(true));
      }
    } catch { /* sem rádio agora */ }
  }, [ligado]);

  useEffect(() => { void sintonizar(); }, [sintonizar]);
  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
    gravar(CHAVE_VOLUME, String(volume));
  }, [volume]);
  useEffect(() => {
    gravar(CHAVE_LIGADO, ligado ? '1' : '0');
    const el = audio.current;
    if (!el) return;
    if (!ligado) el.pause();
  }, [ligado]);
  // Voltou para a aba: ressincroniza (o celular pausa o áudio em segundo plano).
  useEffect(() => {
    const aoVoltar = () => { if (document.visibilityState === 'visible') void sintonizar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, [sintonizar]);
  useEffect(() => () => { audio.current?.pause(); }, []);

  const alternar = () => {
    const novo = !(ligado && !bloqueado);
    setLigado(novo);
    if (novo) {
      // Toque do usuário: o celular libera o som aqui.
      audio.current?.play().then(() => setBloqueado(false)).catch(() => setBloqueado(true));
      void sintonizar();
    }
  };

  const somAtivo = ligado && !bloqueado;
  const IconeVolume = !somAtivo || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  return (
    // O <audio> fica sempre montado (mesmo sem faixa): a primeira sintonia precisa dele.
    <div className={cn('flex items-center gap-2 border-b border-white/10 bg-black/40 px-3 py-1.5', !tocando && 'hidden')}>
      <audio ref={audio} preload="auto" onEnded={() => void sintonizar()} />
      {tocando && (<>
      <Music2 className={cn('h-4 w-4 shrink-0 text-fuchsia-300', somAtivo && 'animate-pulse')} />
      <p className="min-w-0 flex-1 truncate text-[11px] text-white/80">
        <b className="text-white">{tocando.titulo}</b>{tocando.artista ? ` · ${tocando.artista}` : ''}
      </p>
      {mostrarVolume && somAtivo && (
        <input
          type="range" min={0} max={1} step={0.05} value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="w-24 accent-fuchsia-500" aria-label="Volume da música"
        />
      )}
      {somAtivo ? (
        <>
          <button type="button" onClick={() => setMostrarVolume((v) => !v)} className="rounded-full p-1.5 hover:bg-white/10" aria-label="Ajustar volume">
            <IconeVolume className="h-4 w-4" />
          </button>
          <button type="button" onClick={alternar} className="rounded-full px-2 py-1 text-[11px] text-white/70 hover:bg-white/10">Silenciar</button>
        </>
      ) : (
        <button type="button" onClick={alternar} className="rounded-full bg-fuchsia-600 px-3 py-1 text-[11px] font-semibold text-white">
          🔊 Ligar o som
        </button>
      )}
      </>)}
    </div>
  );
}

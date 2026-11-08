import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { resolveServerUrl } from '@/utils/serverUrl';
import { textoDuracao } from '@/utils/audioDoConto';
import { cn } from '@/lib/utils';

export type AudioDoConto = { id: string; url: string; duracaoSeg: number; transcricao?: string | null };

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Um player só para o conto inteiro: as partes em áudio tocam em sequência,
 * com uma barra única (tempo somado), play/pausa e velocidade 1x / 1,5x / 2x.
 */
export default function PlayerDoConto({ audios }: { audios: AudioDoConto[] }) {
  const el = useRef<HTMLAudioElement | null>(null);
  const [parte, setParte] = useState(0);
  const [tocando, setTocando] = useState(false);
  const [noTrecho, setNoTrecho] = useState(0); // segundos dentro da parte atual
  const [velocidade, setVelocidade] = useState(1);
  const [vendoTexto, setVendoTexto] = useState(false);
  // Duração real de cada parte (a do arquivo, quando o navegador souber; senão a gravada).
  const [duracoes, setDuracoes] = useState<number[]>(() => audios.map((a) => a.duracaoSeg));
  const continuarDepois = useRef(false);
  const pendente = useRef<number | null>(null); // posição a aplicar quando a próxima parte carregar

  const inicios = useMemo(() => duracoes.reduce<number[]>((acc, d, i) => { acc.push(i === 0 ? 0 : acc[i - 1] + duracoes[i - 1]); return acc; }, []), [duracoes]);
  const total = duracoes.reduce((a, d) => a + d, 0);
  const agora = (inicios[parte] ?? 0) + noTrecho;
  const transcricao = audios.map((a) => a.transcricao).filter(Boolean).join('\n\n');

  useEffect(() => { if (el.current) el.current.playbackRate = velocidade; }, [velocidade, parte]);

  if (audios.length === 0) return null;

  const tocarPausar = () => {
    const a = el.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => {});
    else a.pause();
  };

  // Pula para um ponto do conto inteiro (troca de parte se precisar).
  const irPara = (segundo: number) => {
    let i = inicios.length - 1;
    while (i > 0 && inicios[i] > segundo) i -= 1;
    const dentro = Math.max(0, segundo - inicios[i]);
    const a = el.current;
    if (i === parte && a) { a.currentTime = dentro; setNoTrecho(dentro); return; }
    continuarDepois.current = tocando;
    setParte(i);
    setNoTrecho(dentro);
    // A troca de src acontece no próximo render; o onLoadedMetadata posiciona.
    pendente.current = dentro;
  };

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">🎧 Ouvir o conto <span className="font-normal text-muted-foreground">({textoDuracao(Math.round(total))})</span></p>
        <div className="flex gap-1" role="group" aria-label="Velocidade">
          {[1, 1.5, 2].map((v) => (
            <button key={v} type="button" onClick={() => setVelocidade(v)}
              className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', velocidade === v ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground')}>
              {String(v).replace('.', ',')}x
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={tocarPausar} aria-label={tocando ? 'Pausar' : 'Ouvir'}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-600 to-fuchsia-600 text-white shadow">
          {tocando ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
        </button>
        <div className="min-w-0 flex-1">
          <input type="range" min={0} max={Math.max(1, total)} step={0.5} value={Math.min(agora, total)}
            onChange={(e) => irPara(Number(e.target.value))}
            className="w-full accent-rose-500" aria-label="Posição no conto" />
          <div className="flex justify-between text-[11px] tabular-nums text-muted-foreground">
            <span>{mmss(agora)}</span>
            {audios.length > 1 && <span>parte {parte + 1} de {audios.length}</span>}
            <span>{mmss(total)}</span>
          </div>
        </div>
      </div>

      <audio
        ref={el}
        src={resolveServerUrl(audios[parte].url)}
        preload="metadata"
        onPlay={() => setTocando(true)}
        onPause={() => setTocando(false)}
        onTimeUpdate={(e) => setNoTrecho(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const a = e.currentTarget;
          a.playbackRate = velocidade;
          if (Number.isFinite(a.duration) && a.duration > 0) setDuracoes((d) => d.map((x, i) => (i === parte ? a.duration : x)));
          if (pendente.current != null) { a.currentTime = pendente.current; pendente.current = null; }
          if (continuarDepois.current) { continuarDepois.current = false; void a.play().catch(() => {}); }
        }}
        // Acabou uma parte: emenda a próxima sem a pessoa fazer nada.
        onEnded={() => {
          if (parte < audios.length - 1) { continuarDepois.current = true; setNoTrecho(0); setParte(parte + 1); }
          else { setTocando(false); setNoTrecho(duracoes[parte] ?? 0); }
        }}
        className="hidden"
      />

      {transcricao && (
        <div>
          <button type="button" onClick={() => setVendoTexto((v) => !v)} className="text-xs font-semibold text-brand-pink hover:underline">
            {vendoTexto ? 'Esconder o texto do áudio' : 'Ler o texto do áudio'}
          </button>
          {vendoTexto && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{transcricao}</p>}
        </div>
      )}
    </div>
  );
}

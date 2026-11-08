import { useRef, useState } from 'react';
import { resolveServerUrl } from '@/utils/serverUrl';
import { textoDuracao } from '@/utils/audioDoConto';
import { cn } from '@/lib/utils';

export type AudioDoConto = { id: string; url: string; duracaoSeg: number; transcricao?: string | null };

/** Partes em áudio de um conto: tocam em sequência, com velocidade 1x / 1,5x / 2x. */
export default function PlayerDoConto({ audios }: { audios: AudioDoConto[] }) {
  const [velocidade, setVelocidade] = useState(1);
  const [vendoTexto, setVendoTexto] = useState(false);
  const refs = useRef<Array<HTMLAudioElement | null>>([]);
  if (audios.length === 0) return null;
  const total = audios.reduce((a, x) => a + x.duracaoSeg, 0);
  const transcricao = audios.map((a) => a.transcricao).filter(Boolean).join('\n\n');

  const mudarVelocidade = (v: number) => {
    setVelocidade(v);
    refs.current.forEach((el) => { if (el) el.playbackRate = v; });
  };

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">🎧 Ouvir {audios.length > 1 ? `(${audios.length} partes · ${textoDuracao(total)})` : `(${textoDuracao(total)})`}</p>
        <div className="flex gap-1" role="group" aria-label="Velocidade">
          {[1, 1.5, 2].map((v) => (
            <button key={v} type="button" onClick={() => mudarVelocidade(v)}
              className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', velocidade === v ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground')}>
              {String(v).replace('.', ',')}x
            </button>
          ))}
        </div>
      </div>
      {audios.map((a, i) => (
        <div key={a.id}>
          {audios.length > 1 && <p className="text-[11px] text-muted-foreground">Parte {i + 1} · {textoDuracao(a.duracaoSeg)}</p>}
          <audio
            ref={(el) => { refs.current[i] = el; if (el) el.playbackRate = velocidade; }}
            src={resolveServerUrl(a.url)}
            controls
            preload="none"
            className="h-9 w-full"
            // Acabou uma parte: toca a próxima.
            onEnded={() => { const prox = refs.current[i + 1]; if (prox) { prox.playbackRate = velocidade; void prox.play().catch(() => {}); } }}
          />
        </div>
      ))}
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

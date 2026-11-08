import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Upload, X, Loader2 } from 'lucide-react';
import { AUDIO_MAX_SEG, AUDIOS_POR_CONTO, disfarcarVoz, duracaoDoAudio, textoDuracao } from '@/utils/audioDoConto';
import { cn } from '@/lib/utils';

export type ParteDeAudio = { id: string; arquivo: Blob; nome: string; duracaoSeg: number; disfarcada: boolean; url: string };

const tipoDeGravacao = () => {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const t of ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return '';
};
const extensao = (mime: string) => (mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : mime.includes('wav') ? 'wav' : mime.includes('mpeg') ? 'mp3' : 'webm');
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * Grava (ou escolhe do celular) até 5 partes de áudio de até 3 min para um conto.
 * "Disfarçar minha voz" deixa o timbre irreconhecível antes de subir.
 */
export default function GravadorDeAudio({ partes, onChange, disabled }: { partes: ParteDeAudio[]; onChange: (p: ParteDeAudio[]) => void; disabled?: boolean }) {
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [disfarcar, setDisfarcar] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState('');
  const gravador = useRef<MediaRecorder | null>(null);
  const pedacos = useRef<Blob[]>([]);
  const relogio = useRef<number | null>(null);
  const seletor = useRef<HTMLInputElement>(null);
  const partesRef = useRef(partes);
  partesRef.current = partes;
  const cheio = partes.length >= AUDIOS_POR_CONTO;

  useEffect(() => () => {
    if (relogio.current) window.clearInterval(relogio.current);
    gravador.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  const adicionar = async (arquivo: Blob, duracaoSeg: number, nomeBase: string) => {
    setProcessando(true);
    try {
      let final = arquivo;
      let nome = `${nomeBase}.${extensao(arquivo.type)}`;
      if (disfarcar) {
        final = await disfarcarVoz(arquivo);
        nome = `${nomeBase}.wav`;
        duracaoSeg = Math.ceil(duracaoSeg / 0.86);
      }
      const parte: ParteDeAudio = { id: crypto.randomUUID(), arquivo: final, nome, duracaoSeg: Math.max(1, Math.min(duracaoSeg, 190)), disfarcada: disfarcar, url: URL.createObjectURL(final) };
      onChange([...partesRef.current, parte]);
    } catch {
      setErro('Não foi possível preparar esse áudio. Tente gravar de novo.');
    } finally {
      setProcessando(false);
    }
  };

  const parar = () => {
    if (relogio.current) { window.clearInterval(relogio.current); relogio.current = null; }
    gravador.current?.stop();
  };

  const gravar = async () => {
    setErro('');
    const tipo = tipoDeGravacao();
    if (tipo === null) { setErro('Seu navegador não grava áudio. Escolha um áudio do celular.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = tipo ? new MediaRecorder(stream, { mimeType: tipo }) : new MediaRecorder(stream);
      pedacos.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) pedacos.current.push(e.data); };
      const inicio = Date.now();
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setGravando(false);
        const dur = Math.max(1, Math.round((Date.now() - inicio) / 1000));
        const mime = (rec.mimeType || tipo || 'audio/webm').split(';')[0];
        const blob = new Blob(pedacos.current, { type: mime });
        if (blob.size > 0 && dur >= 2) void adicionar(blob, Math.min(dur, AUDIO_MAX_SEG), `parte${partesRef.current.length + 1}`);
        else setErro('A gravação ficou curta demais.');
      };
      gravador.current = rec;
      rec.start(1000);
      setSegundos(0);
      setGravando(true);
      relogio.current = window.setInterval(() => {
        const s = Math.round((Date.now() - inicio) / 1000);
        setSegundos(s);
        if (s >= AUDIO_MAX_SEG) parar();
      }, 500);
    } catch {
      setErro('Não deu para usar o microfone. Libere o microfone para o NoSigilo nas configurações do navegador.');
    }
  };

  const escolher = async (arquivo?: File) => {
    if (seletor.current) seletor.current.value = '';
    if (!arquivo) return;
    setErro('');
    if (!arquivo.type.startsWith('audio/')) { setErro('Escolha um arquivo de áudio.'); return; }
    if (arquivo.size > 15 * 1024 * 1024) { setErro('Esse áudio passou de 15 MB. Escolha um de até 3 minutos.'); return; }
    const dur = await duracaoDoAudio(arquivo);
    if (dur > AUDIO_MAX_SEG) { setErro('Cada parte pode ter até 3 minutos. Corte o áudio ou grave em partes.'); return; }
    await adicionar(arquivo, dur || 1, `parte${partesRef.current.length + 1}`);
  };

  const remover = (id: string) => {
    const p = partes.find((x) => x.id === id);
    if (p) URL.revokeObjectURL(p.url);
    onChange(partes.filter((x) => x.id !== id));
  };

  return (
    <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">🎙️ Conte em áudio <span className="font-normal text-muted-foreground">(opcional)</span></p>
        <span className="text-[11px] text-muted-foreground">{partes.length}/{AUDIOS_POR_CONTO} partes · até 3 min cada</span>
      </div>

      {partes.map((p, i) => (
        <div key={p.id} className="flex items-center gap-2 rounded-lg bg-background/70 p-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium">Parte {i + 1} · {textoDuracao(p.duracaoSeg)}{p.disfarcada ? ' · 🎭 voz disfarçada' : ''}</p>
            <audio src={p.url} controls preload="metadata" className="mt-1 h-8 w-full" />
          </div>
          <button type="button" onClick={() => remover(p.id)} disabled={disabled} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Remover parte ${i + 1}`}>
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}

      {gravando ? (
        <div className="flex items-center gap-3 rounded-lg bg-rose-500/10 p-2">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" aria-hidden />
          <span className="flex-1 text-sm font-semibold tabular-nums">Gravando {mmss(segundos)} / 3:00</span>
          <button type="button" onClick={parar} className="flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-bold text-white">
            <Square className="h-3.5 w-3.5" /> Parar
          </button>
        </div>
      ) : processando ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Preparando o áudio…</p>
      ) : !cheio && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void gravar()} disabled={disabled}
            className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-rose-600 to-fuchsia-600 px-3.5 py-2 text-xs font-bold text-white disabled:opacity-50">
            <Mic className="h-4 w-4" /> Gravar {partes.length ? `parte ${partes.length + 1}` : 'áudio'}
          </button>
          <button type="button" onClick={() => seletor.current?.click()} disabled={disabled}
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs font-medium disabled:opacity-50">
            <Upload className="h-3.5 w-3.5" /> Escolher do celular
          </button>
          <input ref={seletor} type="file" accept="audio/*" className="hidden" onChange={(e) => void escolher(e.target.files?.[0])} />
        </div>
      )}

      <label className={cn('flex items-start gap-2 text-xs', gravando && 'opacity-50')}>
        <input type="checkbox" className="mt-0.5" checked={disfarcar} disabled={gravando || processando} onChange={(e) => setDisfarcar(e.target.checked)} />
        <span><b>🎭 Disfarçar minha voz</b> nas próximas partes. Sem disfarce, quem ouvir escuta a sua voz de verdade.</span>
      </label>
      {erro && <p role="alert" className="text-xs font-medium text-destructive">{erro}</p>}
    </div>
  );
}

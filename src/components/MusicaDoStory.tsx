import { useCallback, useEffect, useRef, useState } from 'react';
import { Music2, Pause, Play, X } from 'lucide-react';
import { storiesService } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { cn } from '@/lib/utils';

/**
 * Música no story (21/11/2026): só faixas da Rádio d'A Casa. Quem posta escolhe a
 * música e o trecho (15s); quem assiste ouve o trecho em loop enquanto o story
 * está na tela, com o selo "🎵 nome · Rádio d'A Casa" que leva para A Casa.
 */
export type MusicaEscolhida = { id: string; titulo: string; url: string; inicio: number; duracao: number };
export type MusicaDoStory = { titulo: string; url: string; inicio: number; duracao: number };

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Toca o trecho da música em loop enquanto o story está aberto e não pausado. */
export function useTrechoDaMusica(musica: MusicaDoStory | null | undefined, chave: string, opts: { pausado: boolean; ligado: boolean }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [bloqueado, setBloqueado] = useState(false);
  const url = musica?.url ?? '';
  const inicio = musica?.inicio ?? 0;
  const duracao = musica?.duracao ?? 15;

  useEffect(() => {
    if (!url) { ref.current = null; return; }
    const a = new Audio(resolveServerUrl(url));
    a.preload = 'auto';
    ref.current = a;
    const posicionar = () => { try { a.currentTime = inicio; } catch { /* ainda carregando */ } };
    if (a.readyState >= 1) posicionar(); else a.addEventListener('loadedmetadata', posicionar, { once: true });
    const voltar = () => { if (a.currentTime >= inicio + duracao || a.currentTime < inicio - 1) posicionar(); };
    a.addEventListener('timeupdate', voltar);
    return () => {
      a.pause();
      a.removeEventListener('timeupdate', voltar);
      a.removeAttribute('src');
      a.load();
      if (ref.current === a) ref.current = null;
    };
  }, [url, inicio, duracao, chave]);

  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    if (opts.pausado || !opts.ligado) { a.pause(); return; }
    a.play().then(() => setBloqueado(false)).catch(() => setBloqueado(true));
  }, [opts.pausado, opts.ligado, url, inicio, chave]);

  const destravar = useCallback(() => {
    ref.current?.play().then(() => setBloqueado(false)).catch(() => {});
  }, []);

  return { bloqueado: !!url && bloqueado, destravar };
}

/** Selo no story: nome da música; tocar leva para A Casa. */
export function SeloDaMusica({ musica, onAbrir, className }: { musica: MusicaDoStory; onAbrir?: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onAbrir?.(); }}
      className={cn('inline-flex max-w-[80%] items-center gap-1.5 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white backdrop-blur', className)}
    >
      <Music2 className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{musica.titulo} · Rádio d'A Casa</span>
    </button>
  );
}

/** Botão do editor: "🎵 Música" ou a música escolhida (com ✕ para tirar). */
export function BotaoDeMusica({ musica, onMudar, tema }: { musica: MusicaEscolhida | null; onMudar: (m: MusicaEscolhida | null) => void; tema: 'escuro' | 'claro' }) {
  const [aberto, setAberto] = useState(false);
  const escuro = tema === 'escuro';
  return (
    <>
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setAberto(true)}
          className={cn(
            'flex max-w-[85%] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium',
            musica ? 'border-primary bg-primary/15 text-primary' : escuro ? 'border-white/20 text-white/70 hover:text-white' : 'border-border text-muted-foreground hover:text-foreground',
          )}
        >
          <Music2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{musica ? `${musica.titulo} · ${fmt(musica.inicio)}` : 'Música da Casa'}</span>
        </button>
        {musica && (
          <button type="button" onClick={() => onMudar(null)} aria-label="Tirar a música"
            className={cn('rounded-full p-1', escuro ? 'text-white/60 hover:text-white' : 'text-muted-foreground hover:text-foreground')}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {aberto && <EscolherMusica atual={musica} onFechar={() => setAberto(false)} onEscolher={(m) => { onMudar(m); setAberto(false); }} />}
    </>
  );
}

type Faixa = { id: string; titulo: string; url: string; duracao: number };

export function EscolherMusica({ atual, onFechar, onEscolher }: { atual: MusicaEscolhida | null; onFechar: () => void; onEscolher: (m: MusicaEscolhida) => void }) {
  const [faixas, setFaixas] = useState<Faixa[] | null>(null);
  const [trecho, setTrecho] = useState(15);
  const [sel, setSel] = useState<string | null>(atual?.id ?? null);
  const [inicio, setInicio] = useState(atual?.inicio ?? 0);
  const [tocando, setTocando] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let vivo = true;
    storiesService.musicas()
      .then((r) => { if (vivo) { setFaixas(r.musicas); setTrecho(r.trecho || 15); } })
      .catch(() => { if (vivo) setFaixas([]); });
    return () => { vivo = false; audio.current?.pause(); };
  }, []);

  const faixa = faixas?.find((f) => f.id === sel) ?? null;
  const maxInicio = faixa ? Math.max(0, Math.floor(faixa.duracao - trecho)) : 0;

  // Ouvir o trecho escolhido (em loop de 15s).
  const ouvir = (f: Faixa, desde: number) => {
    let a = audio.current;
    if (!a) { a = new Audio(); audio.current = a; }
    const src = resolveServerUrl(f.url);
    if (!a.src.endsWith(f.url)) a.src = src;
    const ir = () => { try { a!.currentTime = desde; } catch { /* carregando */ } };
    if (a.readyState >= 1) ir(); else a.addEventListener('loadedmetadata', ir, { once: true });
    a.ontimeupdate = () => { if (a!.currentTime >= desde + trecho) ir(); };
    void a.play().then(() => setTocando(true)).catch(() => setTocando(false));
  };
  const parar = () => { audio.current?.pause(); setTocando(false); };

  const escolher = (f: Faixa) => {
    const desde = sel === f.id ? inicio : Math.min(Math.floor(f.duracao * 0.3), Math.max(0, Math.floor(f.duracao - trecho)));
    setSel(f.id);
    setInicio(desde);
    ouvir(f, desde);
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/70 sm:items-center" onClick={() => { parar(); onFechar(); }}>
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl bg-background sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="font-semibold">🎵 Música da Casa</p>
            <p className="text-xs text-muted-foreground">Toca um trecho de {trecho}s no seu story</p>
          </div>
          <button type="button" onClick={() => { parar(); onFechar(); }} aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {faixas === null && <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>}
          {faixas?.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma música disponível agora.</p>}
          {faixas?.map((f) => {
            const ativa = sel === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => (ativa && tocando ? parar() : escolher(f))}
                className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left', ativa ? 'bg-primary/10' : 'hover:bg-secondary/50')}
              >
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', ativa ? 'bg-primary text-white' : 'bg-secondary')}>
                  {ativa && tocando ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{f.titulo}</span>
                  <span className="block text-xs text-muted-foreground">Rádio d'A Casa · {fmt(f.duracao)}</span>
                </span>
              </button>
            );
          })}
        </div>
        {faixa && (
          <div className="space-y-3 border-t px-4 py-3">
            <label className="block text-xs text-muted-foreground">
              Trecho: de {fmt(inicio)} a {fmt(inicio + trecho)}
              <input
                type="range"
                min={0}
                max={maxInicio}
                step={1}
                value={inicio}
                onChange={(e) => setInicio(Number(e.target.value))}
                onPointerUp={() => ouvir(faixa, inicio)}
                onKeyUp={() => ouvir(faixa, inicio)}
                className="mt-2 w-full accent-[hsl(var(--primary))]"
                aria-label="Início do trecho"
              />
            </label>
            <button
              type="button"
              onClick={() => { parar(); onEscolher({ id: faixa.id, titulo: faixa.titulo, url: faixa.url, inicio, duracao: trecho }); }}
              className="w-full rounded-xl bg-gradient-to-r from-primary to-violet-600 py-2.5 text-sm font-semibold text-white"
            >
              Usar esta música
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

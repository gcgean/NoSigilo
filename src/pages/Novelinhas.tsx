import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clapperboard, Play } from 'lucide-react';
import apiClient from '@/utils/apiClient';
import { resolveServerUrl } from '@/utils/serverUrl';
import { useAuth } from '@/contexts/AuthContext';
import { marcarPassoCadastro } from '@/services/api';
import { cn } from '@/lib/utils';

/**
 * Novelinhas (22/11/2026): histórias do meio liberal em episódios narrados.
 * - Pública (/historias): toca só o trecho e, no fim, convida a criar a conta.
 *   Página "limpa" (sem foto sensual), boa para o link do YouTube e do Instagram.
 * - No app (/novelinhas): episódio inteiro, lista de episódios e o convite d'A Casa.
 */
type Episodio = {
  numero: number; slug: string; titulo: string; descricao: string; duracaoSeg: number;
  capa: string | null; trailer: string | null; video: string | null; assistido: boolean;
};

const PERFIS = [
  { evento: 'nv_cadastro', perfil: 'Casal (Ele/Ela)', rotulo: 'Somos um casal', emoji: '👫' },
  { evento: 'nv_cadastro', perfil: 'Mulher', rotulo: 'Sou mulher', emoji: '👩' },
  { evento: 'nv_cadastro', perfil: 'Homem', rotulo: 'Sou homem', emoji: '👨' },
] as const;

const minutos = (s: number) => (s >= 60 ? `${Math.round(s / 60)} min` : `${s}s`);

export default function Novelinhas({ publica = false }: { publica?: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busca, setBusca] = useSearchParams();
  const [episodios, setEpisodios] = useState<Episodio[] | null>(null);
  const [erro, setErro] = useState(false);
  const [acabou, setAcabou] = useState(false);
  const video = useRef<HTMLVideoElement | null>(null);
  const marcado = useRef<string | null>(null);

  useEffect(() => {
    if (publica) marcarPassoCadastro('nv_abriu');
    let vivo = true;
    apiClient.get('/novelinhas')
      .then(({ data }) => { if (vivo) setEpisodios((data?.episodios ?? []) as Episodio[]); })
      .catch(() => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, [publica]);

  const atual = useMemo(() => {
    if (!episodios?.length) return null;
    const slug = busca.get('ep');
    return episodios.find((e) => e.slug === slug) ?? episodios[0];
  }, [episodios, busca]);
  const proximo = atual && episodios ? episodios.find((e) => e.numero === atual.numero + 1) ?? null : null;
  const fonte = atual ? (publica ? atual.trailer : atual.video ?? atual.trailer) : null;

  useEffect(() => { setAcabou(false); }, [atual?.slug]);

  if (publica && user) return <Navigate to={`/novelinhas${atual ? `?ep=${atual.slug}` : ''}`} replace />;

  const escolher = (e: Episodio) => {
    setBusca({ ep: e.slug }, { replace: false });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const marcarAssistido = () => {
    if (publica || !atual || marcado.current === atual.slug) return;
    marcado.current = atual.slug;
    void apiClient.post(`/novelinhas/${atual.slug}/assistiu`).catch(() => {});
    setEpisodios((l) => l?.map((e) => (e.slug === atual.slug ? { ...e, assistido: true } : e)) ?? l);
  };
  const aoTempo = () => {
    const v = video.current;
    if (v && v.currentTime > 60) marcarAssistido();
  };
  const aoAcabar = () => {
    setAcabou(true);
    if (publica) marcarPassoCadastro('nv_trailer_fim');
    else marcarAssistido();
  };

  const conteudo = (
    <div className={cn('mx-auto w-full max-w-3xl space-y-5', publica ? 'px-4 py-6' : 'pb-6')}>
      <header className="space-y-1">
        {publica && <p className="text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-300">NoSigilo · Só para maiores de 18</p>}
        <h1 className="flex items-center gap-2 text-2xl font-black"><Clapperboard className="h-6 w-6 text-fuchsia-400" /> Novelinhas</h1>
        <p className={cn('text-sm', publica ? 'text-white/75' : 'text-muted-foreground')}>
          Histórias do meio liberal, contadas em episódios. Inspiradas em relatos reais.
        </p>
      </header>

      {erro && <p className="text-sm text-destructive">Não foi possível carregar as novelinhas agora. Tente de novo daqui a pouco.</p>}
      {episodios === null && !erro && <div className="aspect-video w-full animate-pulse rounded-2xl bg-white/10" />}
      {episodios?.length === 0 && <p className="text-sm text-muted-foreground">O primeiro episódio chega em breve 🎬</p>}

      {atual && (
        <section className="space-y-3">
          <div className="relative overflow-hidden rounded-2xl bg-black shadow-lg">
            {fonte ? (
              <video
                key={fonte}
                ref={video}
                src={resolveServerUrl(fonte)}
                poster={atual.capa ? resolveServerUrl(atual.capa) : undefined}
                controls
                playsInline
                preload="metadata"
                controlsList="nodownload"
                onContextMenu={(e) => e.preventDefault()}
                onPlay={() => { if (publica) marcarPassoCadastro('nv_play'); }}
                onTimeUpdate={aoTempo}
                onEnded={aoAcabar}
                className="aspect-video w-full"
                data-testid="player-novelinha"
              />
            ) : (
              <div className="flex aspect-video items-center justify-center text-sm text-white/70">Episódio em preparação</div>
            )}

            {acabou && publica && (
              <div className="flex flex-col items-center gap-3 border-t border-white/10 bg-gradient-to-b from-zinc-900 to-black p-5 text-center text-white" data-testid="convite-novelinha">
                <p className="text-lg font-black leading-tight sm:text-2xl">Quer ver como essa história termina?</p>
                <p className="text-sm text-white/80">Crie sua conta no NoSigilo e assista ao episódio inteiro. É rápido e discreto.</p>
                <div className="grid w-full max-w-sm gap-2">
                  {PERFIS.map((p) => (
                    <Link key={p.perfil} to={`/register?profile=${encodeURIComponent(p.perfil)}`} onClick={() => marcarPassoCadastro(p.evento)}
                      className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-fuchsia-600 font-bold">
                      <span aria-hidden="true">{p.emoji}</span> {p.rotulo}
                    </Link>
                  ))}
                </div>
                <Link to="/login" className="text-xs text-white/70 underline underline-offset-2">Já tenho conta</Link>
              </div>
            )}

            {acabou && !publica && (
              <div className="flex flex-col items-center gap-3 border-t border-white/10 bg-gradient-to-b from-zinc-900 to-black p-5 text-center text-white" data-testid="fim-novelinha">
                <p className="text-lg font-black sm:text-2xl">Quer viver isso de verdade? 🔥</p>
                <p className="text-sm text-white/80">A Casa, a festa liberal online, abre sexta e sábado às 22h.</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <button type="button" onClick={() => navigate('/casa')} className="min-h-11 rounded-xl bg-gradient-to-r from-rose-600 to-fuchsia-600 px-5 font-bold">Conhecer A Casa</button>
                  {proximo && (
                    <button type="button" onClick={() => escolher(proximo)} className="min-h-11 rounded-xl bg-white px-5 font-bold text-rose-700">Próximo episódio ›</button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <p className={cn('text-xs font-semibold uppercase tracking-wide', publica ? 'text-fuchsia-300' : 'text-primary')}>
              Episódio {atual.numero}{atual.duracaoSeg ? ` · ${minutos(atual.duracaoSeg)}` : ''}{publica ? ' · trecho' : ''}
            </p>
            <h2 className="text-xl font-bold leading-snug">{atual.titulo}</h2>
            {atual.descricao && <p className={cn('whitespace-pre-line text-sm', publica ? 'text-white/80' : 'text-muted-foreground')}>{atual.descricao}</p>}
          </div>

          {publica && !acabou && (
            <Link to={`/register?profile=${encodeURIComponent('Casal (Ele/Ela)')}`} onClick={() => marcarPassoCadastro('nv_cadastro')}
              className="flex min-h-12 items-center justify-center rounded-2xl bg-gradient-to-r from-rose-600 to-fuchsia-600 font-bold text-white">
              Criar conta e ver o episódio inteiro
            </Link>
          )}
        </section>
      )}

      {episodios && episodios.length > 1 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Episódios</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {episodios.map((e) => (
              <button key={e.slug} type="button" onClick={() => escolher(e)}
                className={cn('flex items-center gap-3 rounded-xl border p-2 text-left transition',
                  e.slug === atual?.slug ? 'border-fuchsia-500 bg-fuchsia-500/10' : publica ? 'border-white/10 hover:bg-white/5' : 'hover:bg-secondary/50')}>
                <span className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-black">
                  {e.capa && <img src={resolveServerUrl(e.capa)} alt="" className="h-full w-full object-cover" loading="lazy" />}
                  <Play className="absolute inset-0 m-auto h-5 w-5 text-white drop-shadow" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs opacity-70">Episódio {e.numero}</span>
                  <span className="line-clamp-2 text-sm font-semibold">{e.titulo}</span>
                </span>
                {e.assistido && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-label="Assistido" />}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );

  if (!publica) return conteudo;
  return <main className="min-h-[100dvh] bg-zinc-950 text-white">{conteudo}</main>;
}

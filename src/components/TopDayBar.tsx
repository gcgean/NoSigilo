import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Crown, Lock, ChevronDown, ChevronUp } from 'lucide-react';
import { radarService, type TopDayPost } from '@/services/api';
import { resolveServerUrl, urlMiniatura } from '@/utils/serverUrl';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { hasPremiumAccess } from '@/utils/premium';
import { getUserProfileHref } from '@/utils/userProfileNavigation';

const RANK_STYLE: Record<number, string> = {
  1: 'text-amber-400',
  2: 'text-slate-300',
  3: 'text-orange-400',
};

/**
 * Régua horizontal "Top do Dia": posts mais curtidos das últimas 24h.
 * Prova social no topo do feed — tocar abre o perfil de quem publicou, que é
 * o que o card promete ao mostrar o rosto e o nome. Renova diariamente.
 */
const CHAVE_VISTO = 'ns_topdia_visto';
const hojeLocal = () => new Date().toLocaleDateString('sv-SE');

export default function TopDayBar() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const premium = hasPremiumAccess(user);
  const [posts, setPosts] = useState<TopDayPost[]>([]);
  const [loaded, setLoaded] = useState(false);
  // No celular a régua ocupa ~190px e empurrava o primeiro post para fora da
  // tela. Na primeira visita do dia ela aparece aberta; depois disso fica
  // recolhida numa linha (tocar abre de novo).
  const [aberto, setAberto] = useState(() => {
    try {
      if (!window.matchMedia('(max-width: 639px)').matches) return true;
      return localStorage.getItem(CHAVE_VISTO) !== hojeLocal();
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (posts.length === 0) return;
    try { localStorage.setItem(CHAVE_VISTO, hojeLocal()); } catch { /* sem storage: sempre aberto */ }
  }, [posts.length]);

  useEffect(() => {
    let active = true;
    const fetchTopDay = () => {
      radarService.getTopDay()
        .then((res) => { if (active) setPosts(res.posts); })
        .catch(() => {
          // Falha num poll periódico não deve apagar uma lista que já estava
          // valendo — só some se ainda não tínhamos carregado nada com sucesso.
          if (active) setPosts((prev) => (prev.length > 0 ? prev : []));
        })
        .finally(() => { if (active) setLoaded(true); });
    };
    fetchTopDay();
    // Sem isso, quem deixa o feed aberto por horas vê o ranking congelado no
    // momento em que a página carregou — o ranking em si é sempre calculado
    // na hora pelo backend, só o front nunca ia buscar de novo.
    const intervalId = window.setInterval(fetchTopDay, 3 * 60 * 1000);
    return () => { active = false; window.clearInterval(intervalId); };
  }, []);

  // Some enquanto carrega e quando não há nada em alta
  if (!loaded || posts.length === 0) return null;

  if (!aberto) {
    // Recolhido, mas chamando atenção: prévia borrada das 3 primeiras fotos
    // desperta a curiosidade de tocar para ver quem está em alta.
    const previas = posts.filter((p) => p.mediaUrl && !p.mimeType?.startsWith('video/')).slice(0, 3);
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="mb-3 flex min-h-[52px] w-full items-center gap-2.5 rounded-2xl border border-amber-400/40 bg-gradient-to-r from-amber-500/15 via-rose-500/10 to-primary/15 px-3 py-2 text-left shadow-[0_0_18px_rgba(245,158,11,0.18)]"
      >
        <div className="flex shrink-0 -space-x-2.5">
          {previas.map((p) => (
            <span key={p.id} className="h-9 w-9 overflow-hidden rounded-full ring-2 ring-amber-400/70">
              <img
                src={urlMiniatura(resolveServerUrl(p.mediaUrl!), 120)}
                alt=""
                loading="lazy"
                className="h-full w-full scale-125 object-cover blur-[3px]"
              />
            </span>
          ))}
          {previas.length === 0 && <Crown className="h-6 w-6 text-amber-400" />}
        </div>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 text-sm font-extrabold uppercase tracking-wide text-amber-300">
            <Crown className="h-4 w-4 shrink-0" /> Top do Dia
          </span>
          <span className="block truncate text-xs font-semibold text-foreground/90">
            🔥 {posts.length} em alta agora · quem será?
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-gradient-primary px-3 py-1.5 text-xs font-bold text-white shadow-[0_2px_10px_rgba(236,72,153,0.4)]">
          Ver <ChevronDown className="h-3.5 w-3.5" />
        </span>
      </button>
    );
  }

  return (
    <div className="mb-3 sm:mb-4">
      <div className="mb-2 flex items-center gap-1.5 px-0.5">
        <Crown className="h-4 w-4 text-amber-400" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Top do Dia</span>
        <span className="flex-1 text-xs text-muted-foreground/60">· mais curtidos</span>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="-my-2 flex min-h-[36px] items-center gap-0.5 px-2 text-xs text-muted-foreground sm:hidden"
        >
          Recolher <ChevronUp className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {posts.map((p, i) => {
          // Amostra grátis: só o 1º item fica liberado para não-assinante; o
          // resto pede assinatura para ver.
          const unlocked = premium || i === 0;
          return (
          <button
            key={p.id}
            type="button"
            onClick={() =>
              unlocked
                ? navigate(getUserProfileHref(p.author.id, user?.id))
                : navigate('/subscriptions')
            }
            className="group relative w-28 shrink-0 overflow-hidden rounded-2xl bg-black"
            title={unlocked ? `Ver perfil de ${p.author.name} · ${p.likeCount} curtidas` : 'Assine o Premium para ver o Top do Dia'}
          >
            <div className="aspect-[3/4] w-full">
              {p.mediaUrl && p.mimeType?.startsWith('video/') ? (
                <video
                  src={resolveServerUrl(p.mediaUrl)}
                  className={cn('h-full w-full object-cover', !unlocked && 'scale-110 blur-lg')}
                  muted
                  playsInline
                />
              ) : p.mediaUrl ? (
                <img
                  src={urlMiniatura(resolveServerUrl(p.mediaUrl), 360)}
                  alt={unlocked ? p.author.name : 'Top do Dia'}
                  loading="lazy"
                  decoding="async"
                  className={cn('h-full w-full object-cover', !unlocked && 'scale-110 blur-lg')}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-secondary text-lg font-bold">
                  {unlocked ? p.author.name[0] : '★'}
                </div>
              )}
            </div>

            {/* Gradiente */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/20" />

            {/* Coroa + rank */}
            <div className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 backdrop-blur-sm">
              <Crown className={cn('h-3 w-3', RANK_STYLE[p.rank] ?? 'text-white/80')} />
              <span className="text-[10px] font-bold text-white">{p.rank}</span>
            </div>

            {/* Curtidas */}
            <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-full bg-black/55 px-1.5 py-0.5 backdrop-blur-sm">
              <Heart className="h-3 w-3 text-rose-400" fill="currentColor" />
              <span className="text-[10px] font-bold text-white">{p.likeCount}</span>
            </div>

            {/* Selo "amostra grátis" no item liberado (não-assinante) */}
            {!premium && unlocked && (
              <div className="absolute left-1.5 bottom-6 rounded-full bg-emerald-500/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                Amostra grátis
              </div>
            )}

            {/* Cadeado premium (itens bloqueados) */}
            {!unlocked && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm">
                  <Lock className="h-4 w-4 text-amber-300" />
                </div>
                <span className="rounded-full bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-black">
                  Premium
                </span>
              </div>
            )}

            {/* Autor */}
            <p className="absolute bottom-1.5 left-1.5 right-1.5 truncate text-[11px] font-semibold text-white">
              {unlocked ? p.author.name : 'Assine para ver'}
            </p>
          </button>
          );
        })}
      </div>
    </div>
  );
}

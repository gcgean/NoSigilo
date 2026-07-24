import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Crown, Lock } from 'lucide-react';
import { radarService, type TopDayPost } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { hasPremiumAccess } from '@/utils/premium';

const RANK_STYLE: Record<number, string> = {
  1: 'text-amber-400',
  2: 'text-slate-300',
  3: 'text-orange-400',
};

/**
 * Régua horizontal "Top do Dia": posts mais curtidos das últimas 24h.
 * Prova social no topo do feed — tocar abre o post. Renova diariamente.
 */
export default function TopDayBar() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const premium = hasPremiumAccess(user);
  const [posts, setPosts] = useState<TopDayPost[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    radarService.getTopDay()
      .then((res) => { if (active) setPosts(res.posts); })
      .catch(() => { if (active) setPosts([]); })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  // Some enquanto carrega e quando não há nada em alta
  if (!loaded || posts.length === 0) return null;

  return (
    <div className="mb-3 sm:mb-4">
      <div className="mb-2 flex items-center gap-1.5 px-0.5">
        <Crown className="h-4 w-4 text-amber-400" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Top do Dia</span>
        <span className="text-xs text-muted-foreground/60">· mais curtidos</span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {posts.map((p, i) => {
          // Gostinho grátis: o 1º item fica liberado mesmo para não-assinante; o resto bloqueia.
          const unlocked = premium || i === 0;
          return (
          <button
            key={p.id}
            type="button"
            onClick={() =>
              unlocked
                ? navigate(`/feed?postId=${encodeURIComponent(p.id)}&u=${encodeURIComponent(p.author.id)}`)
                : navigate('/subscriptions')
            }
            className="group relative w-28 shrink-0 overflow-hidden rounded-2xl bg-black"
            title={unlocked ? `${p.author.name} · ${p.likeCount} curtidas` : 'Assine o Premium para ver o Top do Dia'}
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
                  src={resolveServerUrl(p.mediaUrl)}
                  alt={unlocked ? p.author.name : 'Top do Dia'}
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

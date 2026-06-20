import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Crown } from 'lucide-react';
import { radarService, type TopWeekPost } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { cn } from '@/lib/utils';

const RANK_STYLE: Record<number, string> = {
  1: 'text-amber-400',
  2: 'text-slate-300',
  3: 'text-orange-400',
};

/**
 * Régua horizontal "Top da Semana": posts mais curtidos dos últimos 7 dias.
 * Prova social no topo do feed — tocar abre o post.
 */
export default function TopWeekBar() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<TopWeekPost[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    radarService.getTopWeek()
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
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Top da Semana</span>
        <span className="text-xs text-muted-foreground/60">· mais curtidos</span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {posts.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => navigate(`/feed?postId=${encodeURIComponent(p.id)}&u=${encodeURIComponent(p.author.id)}`)}
            className="group relative w-28 shrink-0 overflow-hidden rounded-2xl bg-black"
            title={`${p.author.name} · ${p.likeCount} curtidas`}
          >
            <div className="aspect-[3/4] w-full">
              {p.mediaUrl && p.mimeType?.startsWith('video/') ? (
                <video src={resolveServerUrl(p.mediaUrl)} className="h-full w-full object-cover" muted playsInline />
              ) : p.mediaUrl ? (
                <img src={resolveServerUrl(p.mediaUrl)} alt={p.author.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-secondary text-lg font-bold">
                  {p.author.name[0]}
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

            {/* Autor */}
            <p className="absolute bottom-1.5 left-1.5 right-1.5 truncate text-[11px] font-semibold text-white">
              {p.author.name}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

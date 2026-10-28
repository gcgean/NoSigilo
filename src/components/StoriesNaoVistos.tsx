import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Play } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { storiesService } from '@/services/api';
import { resolveServerUrl, urlMiniatura } from '@/utils/serverUrl';
import { hasPremiumAccess } from '@/utils/premium';
import { cn } from '@/lib/utils';

type StoryDoFeed = {
  id: string;
  viewed: boolean;
  mediaUrl: string | null;
  mimeType: string;
  expiresAt: string;
  author: { id: string; name: string; avatar: string | null };
};

const faltaPara = (iso: string) => {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  return h >= 1 ? `some em ${h}h` : `some em ${Math.max(1, Math.round(ms / 60_000))} min`;
};

/**
 * "Stories que você ainda não viu" no meio do feed (estilo Instagram): um
 * card por autor, só com o que ainda não foi visto e com quanto falta para
 * sumir. Mesma liberação da barra do topo: sem assinatura, só o 1º abre.
 */
export default function StoriesNaoVistos() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const premium = hasPremiumAccess(user);
  const [lista, setLista] = useState<StoryDoFeed[]>([]);

  useEffect(() => {
    storiesService.getFeed()
      .then((r) => {
        const vistos = new Set<string>();
        const porAutor: StoryDoFeed[] = [];
        for (const s of (r.stories as unknown as StoryDoFeed[])) {
          if (s.viewed || vistos.has(s.author.id)) continue;
          vistos.add(s.author.id);
          porAutor.push(s);
        }
        setLista(porAutor.slice(0, 15));
      })
      .catch(() => setLista([]));
  }, []);

  if (lista.length === 0) return null;

  return (
    <Card className="glass overflow-hidden p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-bold">Stories que você ainda não viu</p>
        <button type="button" onClick={() => navigate('/stories')} className="text-xs font-semibold text-brand-pink hover:underline">Ver todos</button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {lista.map((s, i) => {
          const liberado = premium || i === 0;
          const video = s.mimeType.startsWith('video/');
          const capa = !video && s.mediaUrl ? s.mediaUrl : s.author.avatar;
          const falta = faltaPara(s.expiresAt);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => navigate(liberado ? `/stories?open=${encodeURIComponent(s.id)}&from=feed` : '/stories?amostra=1&from=feed')}
              className="relative w-28 shrink-0 overflow-hidden rounded-xl border bg-card text-left"
            >
              <div className="relative aspect-[9/16] w-full bg-muted">
                {capa ? (
                  <img src={urlMiniatura(resolveServerUrl(capa), 240)} alt="" loading="lazy" decoding="async"
                    className={cn('h-full w-full object-cover', !liberado && 'scale-110 blur-md brightness-75')} />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70" />
                {/* Avatar do autor com o anel de "não visto" */}
                <div className="absolute left-1.5 top-1.5 h-8 w-8 rounded-full bg-gradient-to-tr from-primary via-fuchsia-500 to-violet-600 p-[2px]">
                  <div className="h-full w-full overflow-hidden rounded-full bg-background">
                    {s.author.avatar && liberado ? (
                      <img src={urlMiniatura(resolveServerUrl(s.author.avatar), 120)} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                </div>
                {!liberado ? (
                  <Crown className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-yellow-400 drop-shadow" />
                ) : video ? (
                  <Play className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 fill-white text-white drop-shadow" />
                ) : null}
                <div className="absolute inset-x-1.5 bottom-1.5">
                  <p className={cn('truncate text-xs font-semibold text-white', !liberado && 'text-yellow-300')}>{liberado ? s.author.name : 'Premium'}</p>
                  {falta && <p className="text-[10px] text-white/80">⏳ {falta}</p>}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

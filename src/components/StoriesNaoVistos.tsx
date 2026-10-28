import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Play } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { storiesService } from '@/services/api';
import { resolveServerUrl, urlMiniatura } from '@/utils/serverUrl';
import { hasPremiumAccess } from '@/utils/premium';
import { cn } from '@/lib/utils';
import ReferralPaywallModal from '@/components/ReferralPaywallModal';

type StoryDoFeed = {
  id: string;
  viewed: boolean;
  createdAt: string;
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
  const [paywall, setPaywall] = useState(false);
  // Um card por perfil: abre no story mais antigo que falta ver; `novos` vai no selo.
  const [lista, setLista] = useState<Array<StoryDoFeed & { novos: number }>>([]);

  useEffect(() => {
    storiesService.getFeed()
      .then((r) => {
        // Mesma ordem da barra do topo e da aba Stories (a do servidor).
        const porAutor = new Map<string, StoryDoFeed & { novos: number }>();
        for (const s of (r.stories as unknown as StoryDoFeed[])) {
          if (s.viewed) continue;
          const atual = porAutor.get(s.author.id);
          if (!atual) porAutor.set(s.author.id, { ...s, novos: 1 });
          else {
            const novos = atual.novos + 1;
            porAutor.set(s.author.id, s.createdAt < atual.createdAt ? { ...s, novos } : { ...atual, novos });
          }
        }
        setLista([...porAutor.values()].slice(0, 15));
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
          const liberado = premium;
          const video = s.mimeType.startsWith('video/');
          // A capa é a foto do perfil (como a barra do topo); sem foto, o próprio story.
          const capa = s.author.avatar || (!video ? s.mediaUrl : null);
          const falta = faltaPara(s.expiresAt);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => (liberado ? navigate(`/stories?open=${encodeURIComponent(s.id)}&from=feed`) : setPaywall(true))}
              className="relative w-28 shrink-0 overflow-hidden rounded-xl border bg-card text-left"
            >
              <div className="relative aspect-[9/16] w-full bg-muted">
                {capa ? (
                  <img src={urlMiniatura(resolveServerUrl(capa), 240)} alt="" loading="lazy" decoding="async"
                    className="h-full w-full object-cover" />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70" />
                {/* Anel colorido de "tem story" e o selo com quantos são novos. */}
                <div className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-inset ring-fuchsia-500/80" />
                <span className="absolute right-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-pink px-1.5 text-[10px] font-bold text-white shadow">
                  {s.novos} {s.novos === 1 ? 'story' : 'stories'}
                </span>
                {!liberado ? (
                  <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 shadow" title="Premium">
                    <Crown className="h-3 w-3 text-white" />
                  </span>
                ) : video ? (
                  <Play className="absolute left-1.5 top-1.5 h-4 w-4 fill-white text-white drop-shadow" />
                ) : null}
                <div className="absolute inset-x-1.5 bottom-1.5">
                  <p className={cn('truncate text-xs font-semibold text-white', !liberado && 'text-yellow-300')}>{s.author.name}</p>
                  {falta && <p className="text-[10px] text-white/80">⏳ {falta}</p>}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <ReferralPaywallModal open={paywall} onClose={() => setPaywall(false)} contexto="stories" />
    </Card>
  );
}

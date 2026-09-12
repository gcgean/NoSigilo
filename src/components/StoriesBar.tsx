import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Eye, Crown, Pin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { storiesService, profileService } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { hasPremiumAccess } from '@/utils/premium';

type BarFeedStory = {
  id: string;
  viewed: boolean;
  audience?: 'all' | 'favorites';
  author: { id: string; name: string; avatar: string | null; pinnedByMe?: boolean };
};

type AuthorGroup = {
  authorId: string;
  name: string;
  avatar: string | null;
  firstStoryId: string;
  allViewed: boolean;
  // Fixado por mim: vem antes de todo o resto, igual à ordem da tela /stories.
  pinned: boolean;
  // Algum story do autor é restrito aos favoritos dele. Só chega aqui story
  // que este usuário pode ver, então o anel verde diz "você está na lista".
  paraFavoritos: boolean;
};

/**
 * Barra horizontal de Stories no topo do Feed (estilo Instagram/WhatsApp).
 * Reaproveita o viewer fullscreen e a lógica de gating premium da página
 * /stories: ao tocar num autor, navega para `/stories?open=<storyId>`, que
 * abre o viewer já existente.
 */
export default function StoriesBar() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const premium = hasPremiumAccess(user);

  const [groups, setGroups] = useState<AuthorGroup[]>([]);
  const [myCount, setMyCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [mineRes, feedRes] = await Promise.allSettled([
      storiesService.getMyStory(),
      storiesService.getFeed(),
    ]);

    if (mineRes.status === 'fulfilled') {
      const v = mineRes.value as { story?: unknown; stories?: unknown[] };
      const list = Array.isArray(v.stories) ? v.stories : v.story ? [v.story] : [];
      setMyCount(list.length);
    }

    if (feedRes.status === 'fulfilled') {
      const byAuthor = new Map<string, AuthorGroup>();
      for (const s of feedRes.value.stories as unknown as BarFeedStory[]) {
        const a = s.author;
        const existing = byAuthor.get(a.id);
        if (existing) {
          if (!s.viewed) existing.allViewed = false;
          if (s.audience === 'favorites') existing.paraFavoritos = true;
        } else {
          byAuthor.set(a.id, {
            authorId: a.id,
            name: a.name,
            avatar: a.avatar,
            firstStoryId: s.id,
            allViewed: s.viewed,
            pinned: !!a.pinnedByMe,
            paraFavoritos: s.audience === 'favorites',
          });
        }
      }
      // Fixados primeiro (é o que "acompanhar como fã" promete), e dentro de
      // cada bloco os não-vistos antes dos vistos.
      const arr = Array.from(byAuthor.values()).sort(
        (x, y) => Number(y.pinned) - Number(x.pinned) || Number(x.allViewed) - Number(y.allViewed),
      );
      setGroups(arr);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleUpload = async (file: File) => {
    if (!file) return;
    if (file.type.startsWith('video/')) {
      const duration = await new Promise<number>((resolve) => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.src = URL.createObjectURL(file);
        v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); resolve(v.duration); };
        v.onerror = () => resolve(0);
      });
      if (duration > 30) {
        toast({ title: 'Vídeo muito longo', description: 'O vídeo deve ter no máximo 30 segundos.', variant: 'destructive' });
        return;
      }
    }
    setUploading(true);
    try {
      const media = await profileService.uploadMedia(file, { isPrivate: false, source: 'post' });
      await storiesService.create(String(media.id));
      toast({ title: '✨ Story publicado!', description: 'Expira em 24 horas.' });
      await load();
    } catch {
      toast({ title: 'Erro ao publicar story', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const ringActive = 'bg-gradient-to-tr from-primary via-fuchsia-500 to-violet-600';
  const ringMuted = 'bg-muted';

  return (
    <div className="mb-3 sm:mb-4">
      <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* Seu story */}
        <button
          type="button"
          disabled={uploading}
          onClick={() => { if (myCount > 0) navigate('/stories'); else fileRef.current?.click(); }}
          className="flex w-16 shrink-0 flex-col items-center gap-1 disabled:opacity-60"
        >
          <div className="relative">
            <div className={cn('h-16 w-16 rounded-full p-[2px]', myCount > 0 ? ringActive : ringMuted)}>
              <div className="h-full w-full rounded-full bg-background p-[2px]">
                {user?.avatar ? (
                  <img src={resolveServerUrl(user.avatar)} alt="Seu story" className="h-full w-full rounded-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center rounded-full bg-secondary text-sm font-bold">
                    {String(user?.name || 'U')[0]}
                  </div>
                )}
              </div>
            </div>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); if (!uploading) fileRef.current?.click(); }}
              className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-primary text-white"
            >
              {uploading
                ? <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                : <Plus className="h-3 w-3" />}
            </span>
          </div>
          <span className="w-full truncate text-center text-[11px] text-muted-foreground">Seu story</span>
        </button>

        {/* Stories de outros autores */}
        {groups.map((g, i) => {
          // Gostinho grátis: o 1º story fica liberado mesmo para não-assinante; o resto bloqueia.
          const unlocked = premium || i === 0;
          return (
          <button
            key={g.authorId}
            type="button"
            onClick={() =>
              unlocked
                ? navigate(`/stories?open=${encodeURIComponent(g.firstStoryId)}&from=feed${premium ? '' : '&taste=1'}`)
                : navigate('/subscriptions')
            }
            className="flex w-16 shrink-0 flex-col items-center gap-1"
          >
            <div className={cn(
              'relative h-16 w-16 rounded-full p-[2px]',
              !unlocked
                ? 'bg-gradient-to-tr from-yellow-400 to-amber-500'
                : g.allViewed
                  ? ringMuted
                  // Anel verde para story de favoritos, como no Instagram.
                  : g.paraFavoritos ? 'bg-[#22c55e]' : ringActive,
            )}>
              {unlocked && g.pinned && (
                <span className="absolute -right-0.5 -top-0.5 z-10 flex h-4 w-4 items-center justify-center rounded-full border border-background bg-brand-pink" title="Perfil fixado">
                  <Pin className="h-2.5 w-2.5 fill-current text-white" />
                </span>
              )}
              <div className="relative h-full w-full overflow-hidden rounded-full bg-background p-[2px]">
                {/* Avatar — borrado p/ bloqueado (Premium) ou não-vistos (curiosidade) */}
                <div className={cn('h-full w-full overflow-hidden rounded-full', (!unlocked || !g.allViewed) && 'scale-110 blur-[5px] brightness-90')}>
                  {g.avatar ? (
                    <img src={resolveServerUrl(g.avatar)} alt={unlocked ? g.name : 'Premium'} className="h-full w-full rounded-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center rounded-full bg-secondary text-sm font-bold">
                      {unlocked ? g.name[0] : '★'}
                    </div>
                  )}
                </div>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  {!unlocked ? (
                    <Crown className="h-4 w-4 text-yellow-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
                  ) : !g.allViewed ? (
                    <Eye className="h-4 w-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]" />
                  ) : null}
                </div>
              </div>
            </div>
            <span className={cn('w-full truncate text-center text-[11px]', !unlocked ? 'font-semibold text-yellow-500' : 'text-muted-foreground')}>
              {unlocked ? g.name : 'Premium'}
            </span>
          </button>
          );
        })}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); e.target.value = ''; }}
      />
    </div>
  );
}

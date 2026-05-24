import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera, Eye, MessageCircle, Trash2, X, Send, ChevronLeft,
  ChevronRight, Lock, Crown, Sparkles, Clock, ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { storiesService, profileService } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { hasPremiumAccess } from '@/utils/premium';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

// ─── Types ────────────────────────────────────────────────────────────────────
type MyStory = {
  id: string; mediaUrl: string; mimeType: string;
  createdAt: string; expiresAt: string;
  viewCount: number; commentCount: number;
};

type FeedStory = {
  id: string; mediaUrl: string; mimeType: string;
  createdAt: string; expiresAt: string; viewed: boolean;
  author: {
    id: string; name: string; gender: string | null; avatar: string | null;
    age: number | null; partnerAge: number | null;
    city: string | null; state: string | null; bio: string | null;
    fetiches: string[]; intentions: string[];
    distanceKm: number | null;
  };
};

type Viewer   = { id: string; name: string; avatar: string | null; viewedAt: string };
type Comment  = { id: string; text: string; createdAt: string; commenter: { id: string; name: string; avatar: string | null } };

function timeLeft(expiresAt: string) {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expirado';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m restantes`;
  return `${m}m restantes`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ─── Story Viewer (fullscreen) ────────────────────────────────────────────────
function StoryViewer({
  stories,
  startIndex,
  myUserId,
  isPremium,
  onClose,
}: {
  stories: FeedStory[];
  startIndex: number;
  myUserId: string;
  isPremium: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [idx, setIdx]           = useState(startIndex);
  const [progress, setProgress] = useState(0);
  const [comment, setComment]   = useState('');
  const [sending, setSending]   = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const DURATION = 5000;

  const story = stories[idx];

  const go = useCallback((delta: number) => {
    const next = idx + delta;
    if (next < 0 || next >= stories.length) { onClose(); return; }
    setIdx(next);
    setProgress(0);
  }, [idx, stories.length, onClose]);

  // Auto-advance
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    const start = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min((elapsed / DURATION) * 100, 100);
      setProgress(pct);
      if (pct >= 100) { go(1); }
    }, 50);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [idx, go]);

  // Registrar view
  useEffect(() => {
    void storiesService.view(story.id).catch(() => {});
  }, [story.id]);

  const handleSendComment = async () => {
    if (!comment.trim()) return;
    setSending(true);
    try {
      await storiesService.addComment(story.id, comment.trim());
      setComment('');
      toast({ title: 'Comentário enviado', description: 'Só o autor do story verá.' });
    } catch {
      toast({ title: 'Erro ao enviar', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  // Touch navigation (esquerda/direita)
  const touchStartX = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd   = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
  };

  return (
    <div
      className="fixed inset-0 z-[9995] flex flex-col bg-black"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Progress bars */}
      <div className="flex gap-1 px-3 pt-3 pb-2">
        {stories.map((_, i) => (
          <div key={i} className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden">
            <div
              className="h-full bg-white transition-none"
              style={{ width: i < idx ? '100%' : i === idx ? `${progress}%` : '0%' }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 px-3 pb-2">
        {story.author.avatar ? (
          <img src={resolveServerUrl(story.author.avatar)} alt={story.author.name} className="h-9 w-9 rounded-full object-cover ring-2 ring-white/60" />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white font-bold text-sm ring-2 ring-white/60">
            {story.author.name.charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">{story.author.name}</p>
          <p className="text-xs text-white/60">{timeLeft(story.expiresAt)}</p>
        </div>
        <button type="button" onClick={onClose} className="text-white/80 hover:text-white p-1">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Media */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center">
        {story.mimeType.startsWith('video/') ? (
          <video
            key={story.id}
            src={resolveServerUrl(story.mediaUrl)}
            className="h-full w-full object-cover"
            autoPlay muted playsInline
            onEnded={() => go(1)}
          />
        ) : (
          <img
            key={story.id}
            src={resolveServerUrl(story.mediaUrl)}
            alt=""
            className="h-full w-full object-cover"
          />
        )}

        {/* Profile info overlay (bottom of media, not own story) */}
        {story.author.id !== myUserId && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-4 pt-10 pointer-events-none">
            {/* Name + age + distance */}
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-base font-bold text-white">{story.author.name}</span>
              {story.author.age != null && (
                <span className="text-sm text-white/90">{story.author.age} anos</span>
              )}
              {story.author.partnerAge != null && (
                <span className="text-sm text-white/90">& {story.author.partnerAge} anos</span>
              )}
              {story.author.distanceKm != null && (
                <span className="text-xs text-white/70 ml-auto">{story.author.distanceKm < 1 ? '< 1 km' : `${story.author.distanceKm} km`}</span>
              )}
            </div>
            {/* City/State */}
            {(story.author.city || story.author.state) && (
              <p className="text-xs text-white/70 mt-0.5">
                {[story.author.city, story.author.state].filter(Boolean).join(', ')}
              </p>
            )}
            {/* Intentions */}
            {story.author.intentions.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {story.author.intentions.slice(0, 3).map((i) => (
                  <span key={i} className="rounded-full bg-primary/70 px-2 py-0.5 text-[10px] text-white font-medium">{i}</span>
                ))}
              </div>
            )}
            {/* Fetiches */}
            {story.author.fetiches.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {story.author.fetiches.slice(0, 4).map((f) => (
                  <span key={f} className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] text-white/90">{f}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Navigation tap zones */}
        <button
          type="button"
          className="absolute left-0 top-0 h-full w-1/3"
          onClick={() => go(-1)}
          aria-label="Anterior"
        />
        <button
          type="button"
          className="absolute right-0 top-0 h-full w-1/3"
          onClick={() => go(1)}
          aria-label="Próximo"
        />
      </div>

      {/* Comment bar (not own story) */}
      {story.author.id !== myUserId && (
        <div className="flex items-center gap-2 border-t border-white/10 bg-black/80 px-3 py-3">
          <input
            className="flex-1 rounded-full bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none"
            placeholder="Comentar... (só o autor verá)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleSendComment(); }}
          />
          <button
            type="button"
            disabled={sending || !comment.trim()}
            onClick={() => void handleSendComment()}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary disabled:opacity-40"
          >
            <Send className="h-4 w-4 text-white" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Stats Modal (viewers + comments) ────────────────────────────────────────
function StatsModal({
  storyId,
  isPremium,
  onClose,
  onUpgrade,
}: {
  storyId: string;
  isPremium: boolean;
  onClose: () => void;
  onUpgrade: () => void;
}) {
  const [tab, setTab]         = useState<'viewers' | 'comments'>('viewers');
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isPremium) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      storiesService.getViewers(storyId),
      storiesService.getComments(storyId),
    ]).then(([v, c]) => {
      setViewers(v.viewers);
      setComments(c.comments);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [storyId, isPremium]);

  return (
    <div
      className="fixed inset-0 z-[9996] flex items-end justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl border-t border-border bg-background pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b">
          <h3 className="font-semibold">Estatísticas do story</h3>
          <button type="button" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        {!isPremium ? (
          <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Lock className="h-8 w-8 text-primary" />
            </div>
            <h4 className="text-lg font-bold">Recurso Premium</h4>
            <p className="text-sm text-muted-foreground">Assine para ver quem visualizou e comentou nos seus stories.</p>
            <Button className="gap-2 bg-gradient-to-r from-primary to-violet-600" onClick={onUpgrade}>
              <Crown className="h-4 w-4" /> Ver planos
            </Button>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex border-b">
              {(['viewers', 'comments'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    'flex-1 py-3 text-sm font-medium transition-colors',
                    tab === t ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'
                  )}
                >
                  {t === 'viewers' ? `👁️ ${viewers.length} visualizações` : `💬 ${comments.length} comentários`}
                </button>
              ))}
            </div>

            <div className="max-h-72 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : tab === 'viewers' ? (
                viewers.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma visualização ainda.</p>
                ) : (
                  viewers.map((v) => (
                    <div key={v.id} className="flex items-center gap-3 px-5 py-3 border-b last:border-0">
                      {v.avatar ? (
                        <img src={resolveServerUrl(v.avatar)} alt={v.name} className="h-9 w-9 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-sm font-bold">
                          {v.name.charAt(0)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{v.name}</p>
                        <p className="text-xs text-muted-foreground">{formatTime(v.viewedAt)}</p>
                      </div>
                    </div>
                  ))
                )
              ) : (
                comments.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Nenhum comentário ainda.</p>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="flex items-start gap-3 px-5 py-3 border-b last:border-0">
                      {c.commenter.avatar ? (
                        <img src={resolveServerUrl(c.commenter.avatar)} alt={c.commenter.name} className="h-9 w-9 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-sm font-bold shrink-0">
                          {c.commenter.name.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{c.commenter.name}</p>
                        <p className="text-sm text-muted-foreground">{c.text}</p>
                        <p className="text-xs text-muted-foreground/60 mt-0.5">{formatTime(c.createdAt)}</p>
                      </div>
                    </div>
                  ))
                )
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Página principal Stories ─────────────────────────────────────────────────
export default function Stories() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate  = useNavigate();
  const isPremium = hasPremiumAccess(user);

  const [myStory,      setMyStory]      = useState<MyStory | null | undefined>(undefined);
  const [feed,         setFeed]         = useState<FeedStory[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [uploading,    setUploading]    = useState(false);
  const [viewerIdx,    setViewerIdx]    = useState<number | null>(null);
  const [previewOwn,   setPreviewOwn]   = useState(false);
  const [statsOpen,    setStatsOpen]    = useState(false);
  const [deleting,     setDeleting]     = useState(false);

  const fileRef    = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const videoRef   = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [mineRes, feedRes] = await Promise.allSettled([
      storiesService.getMyStory(),
      storiesService.getFeed(),
    ]);
    if (mineRes.status === 'fulfilled') setMyStory(mineRes.value.story);
    else setMyStory(null);
    if (feedRes.status === 'fulfilled') setFeed(feedRes.value.stories);
    else toast({ title: 'Erro ao carregar stories', variant: 'destructive' });
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleUpload = async (file: File) => {
    if (!file) return;
    // Validação de vídeo máx 30s via duration
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

  const handleDelete = async () => {
    if (!myStory) return;
    setDeleting(true);
    try {
      await storiesService.remove(myStory.id);
      setMyStory(null);
      toast({ title: 'Story removido' });
    } catch {
      toast({ title: 'Erro ao remover', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl px-3 py-4 sm:px-4 sm:py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold leading-tight">Stories</h1>
          <p className="text-sm text-muted-foreground">Fotos e vídeos que expiram em 24h</p>
        </div>
      </div>

      {/* ── Meu Story ─────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Meu Story</h2>

        {myStory ? (
          /* Story ativo */
          <div className="flex items-center gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <button
              type="button"
              className="relative shrink-0"
              onClick={() => setStatsOpen(true)}
            >
              <div className="h-16 w-16 rounded-full overflow-hidden ring-2 ring-primary ring-offset-2 ring-offset-background">
                {myStory.mimeType.startsWith('video/') ? (
                  <video src={resolveServerUrl(myStory.mediaUrl)} className="h-full w-full object-cover" muted playsInline />
                ) : (
                  <img src={resolveServerUrl(myStory.mediaUrl)} alt="Meu story" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                <Eye className="h-3 w-3" />
              </div>
            </button>

            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">Story ativo</p>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => setPreviewOwn(true)}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Visualizar
                </button>
                <button
                  type="button"
                  onClick={() => setStatsOpen(true)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Eye className="h-3.5 w-3.5" />
                  {myStory.viewCount} views
                </button>
                <button
                  type="button"
                  onClick={() => setStatsOpen(true)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  {myStory.commentCount} comentários
                </button>
              </div>
              <p className="flex items-center gap-1 text-xs text-muted-foreground/60 mt-1">
                <Clock className="h-3 w-3" />
                {timeLeft(myStory.expiresAt)}
              </p>
            </div>

            <button
              type="button"
              disabled={deleting}
              onClick={() => void handleDelete()}
              className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : (
          /* Criar story */
          <div className="rounded-2xl border-2 border-dashed border-border p-6 text-center space-y-4">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <Camera className="h-8 w-8 text-primary" />
              </div>
            </div>
            <div>
              <p className="font-semibold">Publique um story</p>
              <p className="text-sm text-muted-foreground mt-1">
                Foto ou vídeo de até 30s · visível por 24h · só para perfis compatíveis
              </p>
            </div>
            <div className="flex justify-center gap-3 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                <Camera className="h-4 w-4" />
                Câmera
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                disabled={uploading}
                onClick={() => galleryRef.current?.click()}
              >
                <ImageIcon className="h-4 w-4" />
                Galeria
              </Button>
              <Button
                size="sm"
                className="gap-2 bg-gradient-to-r from-primary to-violet-600"
                disabled={uploading}
                onClick={() => videoRef.current?.click()}
              >
                {uploading ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
                {uploading ? 'Enviando...' : 'Vídeo'}
              </Button>
            </div>
            {/* capture=environment abre a câmera diretamente */}
            <input ref={fileRef}    type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); e.target.value = ''; }} />
            {/* galeria de fotos sem capture */}
            <input ref={galleryRef} type="file" accept="image/*"                       className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); e.target.value = ''; }} />
            <input ref={videoRef}   type="file" accept="video/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); e.target.value = ''; }} />
          </div>
        )}
      </section>

      {/* ── Stories de interesse ───────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Stories de interesse
          {feed.length > 0 && <span className="ml-2 text-primary">{feed.length}</span>}
        </h2>

        {feed.length === 0 ? (
          <div className="rounded-2xl border border-border bg-muted/30 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhum story disponível no momento.<br />
              Quando perfis compatíveis publicarem, aparecerão aqui.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {feed.map((story, i) => (
              <button
                key={story.id}
                type="button"
                onClick={() => setViewerIdx(i)}
                className="relative aspect-[9/16] overflow-hidden rounded-2xl bg-black group"
              >
                {story.mimeType.startsWith('video/') ? (
                  <video src={resolveServerUrl(story.mediaUrl)} className="h-full w-full object-cover" muted playsInline />
                ) : (
                  <img src={resolveServerUrl(story.mediaUrl)} alt={story.author.name} className="h-full w-full object-cover" />
                )}

                {/* Gradient */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

                {/* Avatar ring */}
                <div className={cn(
                  'absolute top-2 left-2 h-8 w-8 rounded-full overflow-hidden ring-2 ring-offset-1 ring-offset-black',
                  story.viewed ? 'ring-white/40' : 'ring-primary'
                )}>
                  {story.author.avatar ? (
                    <img src={resolveServerUrl(story.author.avatar)} alt={story.author.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-secondary text-[10px] font-bold">
                      {story.author.name.charAt(0)}
                    </div>
                  )}
                </div>

                {/* Name */}
                <p className="absolute bottom-2 left-2 right-2 text-[10px] font-semibold text-white truncate">
                  {story.author.name}
                </p>

                {/* Viewed indicator */}
                {story.viewed && (
                  <div className="absolute top-2 right-2 flex items-center justify-center h-5 w-5 rounded-full bg-white/20">
                    <Eye className="h-3 w-3 text-white/80" />
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Preview do próprio story */}
      {previewOwn && myStory && (
        <div className="fixed inset-0 z-[9995] flex flex-col bg-black">
          {/* Barra de progresso única */}
          <div className="flex gap-1 px-3 pt-3 pb-2">
            <div className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden">
              <div className="h-full bg-white w-full" />
            </div>
          </div>
          {/* Header */}
          <div className="flex items-center gap-3 px-3 pb-2">
            {user?.avatar ? (
              <img src={resolveServerUrl(user.avatar)} alt={user.name} className="h-9 w-9 rounded-full object-cover ring-2 ring-white/60" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white font-bold text-sm ring-2 ring-white/60">
                {user?.name?.charAt(0) ?? '?'}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">{user?.name}</p>
              <p className="text-xs text-white/60">{timeLeft(myStory.expiresAt)}</p>
            </div>
            <button type="button" onClick={() => setPreviewOwn(false)} className="text-white/80 hover:text-white p-1">
              <X className="h-5 w-5" />
            </button>
          </div>
          {/* Mídia */}
          <div className="flex-1 relative overflow-hidden flex items-center justify-center">
            {myStory.mimeType.startsWith('video/') ? (
              <video key={myStory.id} src={resolveServerUrl(myStory.mediaUrl)} className="h-full w-full object-cover" autoPlay muted playsInline onEnded={() => setPreviewOwn(false)} />
            ) : (
              <img key={myStory.id} src={resolveServerUrl(myStory.mediaUrl)} alt="" className="h-full w-full object-cover" />
            )}
            {/* Fechar ao tocar */}
            <button type="button" className="absolute inset-0 w-full h-full" onClick={() => setPreviewOwn(false)} aria-label="Fechar preview" />
          </div>
          {/* Footer info */}
          <div className="flex items-center justify-center gap-6 border-t border-white/10 bg-black/80 px-4 py-3">
            <button type="button" onClick={() => { setPreviewOwn(false); setStatsOpen(true); }} className="flex items-center gap-2 text-sm text-white/80">
              <Eye className="h-4 w-4" /> {myStory.viewCount} visualizações
            </button>
            <button type="button" onClick={() => { setPreviewOwn(false); setStatsOpen(true); }} className="flex items-center gap-2 text-sm text-white/80">
              <MessageCircle className="h-4 w-4" /> {myStory.commentCount} comentários
            </button>
          </div>
        </div>
      )}

      {/* Viewer fullscreen */}
      {viewerIdx !== null && (
        <StoryViewer
          stories={feed}
          startIndex={viewerIdx}
          myUserId={user?.id || ''}
          isPremium={isPremium}
          onClose={() => { setViewerIdx(null); void load(); }}
        />
      )}

      {/* Stats modal */}
      {statsOpen && myStory && (
        <StatsModal
          storyId={myStory.id}
          isPremium={isPremium}
          onClose={() => setStatsOpen(false)}
          onUpgrade={() => { setStatsOpen(false); navigate('/subscriptions'); }}
        />
      )}
    </div>
  );
}

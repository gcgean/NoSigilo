import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Image, Video, Send, Heart, MessageCircle, Share2, MoreHorizontal, X, Lock, Crown, Trash2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { feedService, interactionsService, profileService } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { hasPremiumAccess } from '@/utils/premium';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useFavorites } from '@/contexts/FavoritesContext';
import { SERVER_ORIGIN, resolveServerUrl } from '@/utils/serverUrl';

type FeedMedia = { id: string; url: string | null; mimeType?: string | null; isLocked?: boolean };
type FeedPost = {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; name: string; avatar?: string | null };
  mediaIds: string[];
  media: FeedMedia[];
  likesCount: number;
  commentsCount: number;
  likedByMe: boolean;
};

type Comment = {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string; avatar?: string | null };
};

function formatWhen(iso: string) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return `há ${days} d`;
}

function resolveMediaUrl(url: string | null) {
  if (!url) return '';
  return resolveServerUrl(url);
}

export default function Feed() {
  const { user } = useAuth();
  const location = useLocation();
  const { toast } = useToast();
  const { favorites, isFavorite, toggleFavorite } = useFavorites();
  const premiumAccess = hasPremiumAccess(user);
  const [postContent, setPostContent] = useState('');
  const [allPosts, setAllPosts] = useState<FeedPost[]>([]);
  const [recentPhotos, setRecentPhotos] = useState<Array<{ id: string; url: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [activePicker, setActivePicker] = useState<'image' | 'video' | null>(null);
  const [attachments, setAttachments] = useState<Array<{ id: string; file: File; url: string }>>([]);
  const [fileAccept, setFileAccept] = useState<string>('image/*,video/*');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentsRef = useRef<Array<{ id: string; file: File; url: string }>>([]);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [aspectByKey, setAspectByKey] = useState<Record<string, 'portrait' | 'landscape' | 'square'>>({});
  const pageRef = useRef(1);
  const hasMoreRef = useRef(true);
  const isLoadingMoreRef = useRef(false);

  const [openCommentsPostId, setOpenCommentsPostId] = useState<string | null>(null);
  const [commentsByPostId, setCommentsByPostId] = useState<Record<string, Comment[]>>({});
  const [commentDraftByPostId, setCommentDraftByPostId] = useState<Record<string, string>>({});
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [hasNewPosts, setHasNewPosts] = useState(false);
  const currentTopPostIdRef = useRef<string | null>(null);

  const [feedFilter, setFeedFilter] = useState<'all' | 'favorites'>(() => {
    const v = localStorage.getItem('nosigilo_feed_filter');
    return v === 'favorites' ? 'favorites' : 'all';
  });
  useEffect(() => {
    localStorage.setItem('nosigilo_feed_filter', feedFilter);
  }, [feedFilter]);

  const visiblePosts = useMemo(() => {
    if (feedFilter !== 'favorites') return allPosts;
    const favIds = new Set(favorites.map((f) => String(f.id)));
    return allPosts.filter((p) => favIds.has(String(p.author.id)));
  }, [allPosts, feedFilter, favorites]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    isLoadingMoreRef.current = isLoadingMore;
  }, [isLoadingMore]);

  useEffect(() => {
    currentTopPostIdRef.current = allPosts[0]?.id ? String(allPosts[0].id) : null;
  }, [allPosts]);

  const reload = async () => {
    setIsLoading(true);
    try {
      const feed = await feedService.getFeed({ page: 1, limit: 20 });
      setAllPosts(Array.isArray(feed?.posts) ? feed.posts : []);
      setPage(1);
      setHasMore(!!feed?.hasMore);
      const photos = await feedService.getRecentPhotos();
      setRecentPhotos(Array.isArray(photos) ? photos.map((p: any) => ({ id: p.id, url: resolveMediaUrl(String(p.url || '')) })) : []);
    } catch {
      toast({ title: 'Erro ao carregar feed', description: 'Tente novamente.', variant: 'destructive' });
      setAllPosts([]);
      setRecentPhotos([]);
      setPage(1);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const loadMore = async () => {
    if (isLoading || isLoadingMoreRef.current || !hasMoreRef.current) return;
    const nextPage = pageRef.current + 1;
    setIsLoadingMore(true);
    try {
      const feed = await feedService.getFeed({ page: nextPage, limit: 20 });
      const nextPosts = Array.isArray(feed?.posts) ? (feed.posts as FeedPost[]) : [];
      setAllPosts((prev) => {
        if (nextPosts.length === 0) return prev;
        const seen = new Set(prev.map((p) => String(p.id)));
        const merged = [...prev];
        for (const p of nextPosts) {
          const id = String((p as any)?.id || '');
          if (!id || seen.has(id)) continue;
          seen.add(id);
          merged.push(p);
        }
        return merged;
      });
      setPage(nextPage);
      setHasMore(!!feed?.hasMore);
    } catch {
      toast({ title: 'Erro ao carregar mais', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsLoadingMore(false);
    }
  };

  const focusParams = useMemo(() => {
    const sp = new URLSearchParams(location.search);
    const postId = sp.get('postId');
    const openComments = sp.get('openComments');
    return {
      postId: postId ? String(postId) : null,
      openComments: openComments === '1' || openComments === 'true',
    };
  }, [location.search]);

  useEffect(() => {
    if (!focusParams.postId) return;
    if (feedFilter !== 'all') setFeedFilter('all');
  }, [focusParams.postId, feedFilter]);

  useEffect(() => {
    if (!focusParams.postId) return;
    if (isLoading) return;
    let cancelled = false;
    const run = async () => {
      const targetId = focusParams.postId!;
      for (let i = 0; i < 30; i++) {
        if (cancelled) return;
        const el = document.getElementById(`post-${targetId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (focusParams.openComments) void toggleComments(targetId);
          return;
        }
        const exists = allPosts.some((p) => String(p.id) === targetId);
        if (!exists && hasMoreRef.current) {
          await loadMore();
          await new Promise((r) => window.setTimeout(r, 0));
          continue;
        }
        if (exists) {
          await new Promise((r) => window.setTimeout(r, 0));
          continue;
        }
        return;
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [focusParams.postId, focusParams.openComments, isLoading, allPosts]);

  const setAspectForKey = (key: string, width: number, height: number) => {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    const ratio = width / height;
    const next: 'portrait' | 'landscape' | 'square' = Math.abs(ratio - 1) <= 0.12 ? 'square' : ratio < 1 ? 'portrait' : 'landscape';
    setAspectByKey((prev) => (prev[key] === next ? prev : { ...prev, [key]: next }));
  };

  const aspectStyleForKey = (key: string) => {
    const v = aspectByKey[key];
    if (v === 'portrait') return { aspectRatio: '9 / 16' as any };
    if (v === 'square') return { aspectRatio: '1 / 1' as any };
    return { aspectRatio: '16 / 9' as any };
  };

  useEffect(() => {
    if (!hasMore) return;
    const el = loadMoreRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { root: null, rootMargin: '600px', threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, page, isLoading, isLoadingMore, feedFilter, favorites.length]);

  useEffect(() => {
    if (import.meta.env.VITE_USE_MOCKS === 'true') return;
    let cancelled = false;
    const intervalId = window.setInterval(async () => {
      if (cancelled) return;
      try {
        const feed = await feedService.getFeed({ page: 1, limit: 1 });
        const topId = Array.isArray(feed?.posts) && feed.posts[0]?.id ? String(feed.posts[0].id) : null;
        if (!topId) return;
        const currentTop = currentTopPostIdRef.current;
        if (currentTop && topId !== currentTop && window.scrollY > 80) {
          setHasNewPosts(true);
        }
      } catch {}
    }, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const openPicker = (accept: string) => {
    if (accept.includes('video') && !premiumAccess) {
      toast({
        title: 'Vídeos são Premium',
        description: 'Assine um plano para postar e assistir vídeos após o teste grátis.',
        variant: 'destructive',
      });
      return;
    }
    setFileAccept(accept);
    setActivePicker(accept.includes('video') ? 'video' : 'image');
    window.setTimeout(() => fileInputRef.current?.click(), 0);
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files).map((f) => ({
      id: `${f.name}-${f.size}-${f.lastModified}-${Math.random().toString(16).slice(2)}`,
      file: f,
      url: URL.createObjectURL(f),
    }));
    setAttachments((prev) => [...prev, ...list]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => {
      const removed = prev[idx];
      if (removed) URL.revokeObjectURL(removed.url);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handlePublish = async () => {
    const content = postContent.trim();
    if (!content && attachments.length === 0) return;
    setIsPublishing(true);
    try {
      const mediaIds: string[] = [];
      for (const a of attachments) {
        if (a.file.type.startsWith('video/') && !premiumAccess) {
          throw new Error('Vídeos são Premium após o teste grátis.');
        }
        const uploaded = await profileService.uploadMedia(a.file);
        if (uploaded?.id) mediaIds.push(String(uploaded.id));
      }
      await feedService.createPost({ content, mediaIds: mediaIds.length ? mediaIds : undefined });
      setPostContent('');
      for (const a of attachmentsRef.current) URL.revokeObjectURL(a.url);
      setAttachments([]);
      setActivePicker(null);
      toast({ title: 'Publicado', description: 'Seu post foi publicado.' });
      await reload();
    } catch (e: any) {
      toast({ title: 'Erro ao publicar', description: e?.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleToggleLike = async (post: FeedPost) => {
    const nextLiked = !post.likedByMe;
    setAllPosts((prev) =>
      prev.map((p) =>
        p.id === post.id ? { ...p, likedByMe: nextLiked, likesCount: Math.max(0, p.likesCount + (nextLiked ? 1 : -1)) } : p
      )
    );
    try {
      if (nextLiked) {
        await interactionsService.like('post', post.id);
      } else {
        await interactionsService.unlike('post', post.id);
      }
    } catch {
      setAllPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)));
      toast({ title: 'Erro ao curtir', description: 'Tente novamente.', variant: 'destructive' });
    }
  };

  const toggleComments = async (postId: string) => {
    const willOpen = openCommentsPostId !== postId;
    setOpenCommentsPostId(willOpen ? postId : null);
    if (!willOpen) return;
    if (commentsByPostId[postId]) return;
    setIsLoadingComments(true);
    try {
      const list = await interactionsService.getComments('post', postId);
      setCommentsByPostId((prev) => ({ ...prev, [postId]: Array.isArray(list) ? list : [] }));
    } catch {
      toast({ title: 'Erro ao carregar comentários', description: 'Tente novamente.', variant: 'destructive' });
      setCommentsByPostId((prev) => ({ ...prev, [postId]: [] }));
    } finally {
      setIsLoadingComments(false);
    }
  };

  const sendComment = async (postId: string) => {
    const draft = (commentDraftByPostId[postId] || '').trim();
    if (!draft) return;
    setCommentDraftByPostId((prev) => ({ ...prev, [postId]: '' }));
    try {
      await interactionsService.comment('post', postId, draft);
      const list = await interactionsService.getComments('post', postId);
      setCommentsByPostId((prev) => ({ ...prev, [postId]: Array.isArray(list) ? list : [] }));
      setAllPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, commentsCount: p.commentsCount + 1 } : p)));
    } catch {
      toast({ title: 'Erro ao comentar', description: 'Tente novamente.', variant: 'destructive' });
      setCommentDraftByPostId((prev) => ({ ...prev, [postId]: draft }));
    }
  };

  return (
    <div className="w-full">
      {!user?.isPremium && user?.trialEndsAt ? (
        <div className="mb-4">
          <div className="w-full rounded-xl px-4 py-3 bg-[hsl(270_50%_40%)] text-white flex items-center justify-between">
            <span className="text-sm">
              {(() => {
                const ends = new Date(String(user.trialEndsAt)).getTime();
                const ms = ends - Date.now();
                if (!Number.isFinite(ends)) return 'Seu teste grátis está ativo.';
                if (ms <= 0) return 'Seu teste grátis terminou. Assine para continuar com acesso total.';
                const totalMin = Math.floor(ms / 60000);
                const days = Math.floor(totalMin / (60 * 24));
                const hours = Math.floor((totalMin - days * 24 * 60) / 60);
                const minutes = totalMin - days * 24 * 60 - hours * 60;
                return `Seu teste grátis acaba em ${days} dia(s), ${hours} hora(s) e ${minutes} minuto(s)`;
              })()}
            </span>
            <a href="/subscriptions" className="text-sm font-semibold underline underline-offset-4">
              ASSINE AGORA
            </a>
          </div>
        </div>
      ) : null}

      {hasNewPosts ? (
        <div className="mb-4">
          <Card className="p-3 glass flex items-center justify-between">
            <span className="text-sm">Existem novas postagens</span>
            <Button
              size="sm"
              className="bg-gradient-primary hover:opacity-90"
              onClick={() => {
                setHasNewPosts(false);
                window.scrollTo({ top: 0, behavior: 'smooth' });
                window.setTimeout(() => void reload(), 250);
              }}
            >
              Ver agora
            </Button>
          </Card>
        </div>
      ) : null}
      {/* Composer */}
      <Card className="p-4 mb-6 glass">
        <div className="flex gap-4">
          <Avatar>
            <AvatarImage src={user?.avatar ? resolveServerUrl(user.avatar) : undefined} />
            <AvatarFallback>{String(user?.name || 'U')[0]}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <Textarea
              placeholder="O que está pensando?"
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              className="resize-none border-0 bg-transparent focus-visible:ring-0 p-0 text-base"
              rows={2}
            />
            {attachments.length > 0 && (
              <div className="mt-4 grid sm:grid-cols-2 gap-3">
                {attachments.map((p, idx) => (
                  <div key={p.id} className="relative rounded-lg overflow-hidden border bg-secondary/30">
                    {p.file.type.startsWith('video/') ? (
                      premiumAccess ? (
                        <div className="w-full" style={aspectStyleForKey(p.id)}>
                          <video
                            key={p.url}
                            src={p.url}
                            className="w-full h-full object-cover"
                            controls
                            muted
                            preload="metadata"
                            playsInline
                            onLoadedMetadata={(e) => setAspectForKey(p.id, e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
                            onError={() => {
                              setAttachments((prev) =>
                                prev.map((a) => {
                                  if (a.id !== p.id) return a;
                                  try {
                                    URL.revokeObjectURL(a.url);
                                  } catch {}
                                  return { ...a, url: URL.createObjectURL(a.file) };
                                })
                              );
                            }}
                          />
                        </div>
                      ) : (
                        <div className="w-full flex flex-col items-center justify-center gap-2 text-muted-foreground" style={aspectStyleForKey(p.id)}>
                          <Lock className="w-6 h-6" />
                          <p className="text-sm">Vídeo disponível apenas no Premium</p>
                        </div>
                      )
                    ) : (
                      <div className="w-full" style={aspectStyleForKey(p.id)}>
                        <img
                          src={p.url}
                          alt=""
                          className="w-full h-full object-cover"
                          onLoad={(e) => setAspectForKey(p.id, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
                        />
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="absolute top-2 right-2"
                      onClick={() => removeAttachment(idx)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={activePicker === 'image' ? 'default' : 'ghost'}
                  size="sm"
                  className={cn(
                    'gap-2',
                    activePicker === 'image' ? '' : 'text-muted-foreground hover:text-primary'
                  )}
                  onClick={() => openPicker('image/*')}
                >
                  <Image className="w-5 h-5" />
                  Foto
                </Button>
                <Button
                  type="button"
                  variant={activePicker === 'video' ? 'default' : 'ghost'}
                  size="sm"
                  className={cn(
                    'gap-2',
                    activePicker === 'video' ? '' : 'text-muted-foreground hover:text-primary'
                  )}
                  onClick={() => openPicker('video/*')}
                >
                  <Video className="w-5 h-5" />
                  Vídeo
                </Button>
              </div>
              <Button 
                size="sm" 
                className="bg-gradient-primary hover:opacity-90 gap-2"
                disabled={(!postContent.trim() && attachments.length === 0) || isPublishing}
                onClick={handlePublish}
              >
                <Send className="w-4 h-4" />
                {isPublishing ? 'Publicando...' : 'Publicar'}
              </Button>
            </div>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={fileAccept}
          className="hidden"
          onChange={(e) => handleFilesSelected(e.target.files)}
        />
      </Card>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Posts Feed */}
        <div className="md:col-span-2 space-y-6">
          <Card className="p-3 glass">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={feedFilter === 'all' ? 'secondary' : 'ghost'}
                onClick={() => setFeedFilter('all')}
              >
                Todos
              </Button>
              <Button
                type="button"
                size="sm"
                variant={feedFilter === 'favorites' ? 'secondary' : 'ghost'}
                onClick={() => setFeedFilter('favorites')}
                disabled={favorites.length === 0}
              >
                Favoritos
              </Button>
              {feedFilter === 'favorites' && favorites.length === 0 ? (
                <span className="text-sm text-muted-foreground ml-1">Adicione favoritos para filtrar.</span>
              ) : null}
            </div>
          </Card>
          {isLoading && <Card className="p-6 glass text-muted-foreground">Carregando...</Card>}
          {!isLoading && feedFilter === 'favorites' && favorites.length > 0 && visiblePosts.length === 0 ? (
            <Card className="p-6 glass text-muted-foreground">Nenhuma publicação dos seus favoritos ainda.</Card>
          ) : null}
          {!isLoading && visiblePosts.map((post) => (
            <Card key={post.id} id={`post-${post.id}`} className="overflow-hidden glass">
              {/* Post Header */}
              <div className="p-4 flex items-center justify-between">
                <Link
                  to={post.author.id === user?.id ? '/profile' : `/users/${post.author.id}`}
                  className="flex items-center gap-3 hover:opacity-90 transition-opacity"
                >
                  <Avatar>
                    <AvatarImage src={post.author.avatar ? resolveServerUrl(post.author.avatar) : undefined} />
                    <AvatarFallback>{String(post.author.name || 'U')[0]}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold hover:underline">{post.author.name}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{formatWhen(post.createdAt)}</span>
                  </div>
                </Link>
                <div className="flex items-center gap-1">
                  {post.author.id !== user?.id ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        toggleFavorite({
                          id: String(post.author.id),
                          name: String(post.author.name || ''),
                          avatar: post.author.avatar || undefined,
                          addedAt: new Date().toISOString(),
                        })
                      }
                      aria-label={isFavorite(String(post.author.id)) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                    >
                      <Star
                        className={cn(
                          'w-5 h-5',
                          isFavorite(String(post.author.id)) ? 'text-gold fill-current' : 'text-muted-foreground'
                        )}
                      />
                    </Button>
                  ) : null}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="w-5 h-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {post.author.id === user?.id ? (
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={async () => {
                            try {
                              await feedService.deletePost(post.id);
                              toast({ title: 'Publicação removida' });
                              await reload();
                            } catch {
                              toast({ title: 'Falha ao remover', description: 'Tente novamente.', variant: 'destructive' });
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                          Remover publicação
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Post Content */}
              {post.content?.trim() ? (
                <div className="px-4 pb-3">
                  <p>{post.content}</p>
                </div>
              ) : null}

              {/* Post Media */}
              {post.media?.length > 0 && (
                <div className="space-y-2 px-4 pb-3">
                  {post.media.map((m) => (
                    <div key={m.id} className="relative rounded-lg overflow-hidden">
                      {String(m.mimeType || '').startsWith('video/') ? (
                        premiumAccess ? (
                          <div className="w-full" style={aspectStyleForKey(m.id)}>
                            <video
                              src={resolveMediaUrl(m.url)}
                              className="w-full h-full object-cover"
                              controls
                              muted
                              playsInline
                              preload="metadata"
                              onLoadedMetadata={(e) => setAspectForKey(m.id, e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
                              onMouseEnter={(e) => {
                                const v = e.currentTarget;
                                v.muted = true;
                                void v.play().catch(() => {});
                              }}
                              onMouseLeave={(e) => {
                                const v = e.currentTarget;
                                v.pause();
                                try {
                                  v.currentTime = 0;
                                } catch {}
                              }}
                            />
                          </div>
                        ) : (
                          <div className="w-full bg-secondary/30 border flex flex-col items-center justify-center gap-3" style={aspectStyleForKey(m.id)}>
                            <Lock className="w-6 h-6 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">Vídeos disponíveis apenas para Premium</p>
                            <Button asChild size="sm" className="bg-gradient-primary hover:opacity-90 gap-2">
                              <a href="/subscriptions">
                                <Crown className="w-4 h-4" /> Ver planos
                              </a>
                            </Button>
                          </div>
                        )
                      ) : (
                        <div className="w-full" style={aspectStyleForKey(m.id)}>
                          <img
                            src={resolveMediaUrl(m.url)}
                            alt=""
                            className="w-full h-full object-cover"
                            onLoad={(e) => setAspectForKey(m.id, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Post Actions */}
              <div className="p-4 flex items-center justify-between border-t">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => void handleToggleLike(post)}
                    className={cn(
                      "flex items-center gap-2 transition-colors",
                      post.likedByMe ? "text-primary" : "text-muted-foreground hover:text-primary"
                    )}
                  >
                    <Heart className={cn("w-5 h-5", post.likedByMe && "fill-current")} />
                    <span className="text-sm font-medium">{post.likesCount}</span>
                  </button>
                  <button
                    onClick={() => void toggleComments(post.id)}
                    className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <MessageCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">{post.commentsCount}</span>
                  </button>
                </div>
                <button className="text-muted-foreground hover:text-foreground transition-colors">
                  <Share2 className="w-5 h-5" />
                </button>
              </div>

              {openCommentsPostId === post.id && (
                <div className="p-4 border-t space-y-3">
                  {isLoadingComments && <p className="text-sm text-muted-foreground">Carregando comentários...</p>}
                  {!isLoadingComments && (
                    <div className="space-y-3">
                      {(commentsByPostId[post.id] || []).map((c) => (
                        <div key={c.id} className="flex items-start gap-3">
                          <Link
                            to={c.user.id === user?.id ? '/profile' : `/users/${c.user.id}`}
                            className="hover:opacity-90 transition-opacity"
                          >
                            <Avatar className="w-8 h-8">
                              <AvatarImage src={c.user.avatar ? resolveServerUrl(c.user.avatar) : undefined} />
                              <AvatarFallback>{String(c.user.name || 'U')[0]}</AvatarFallback>
                            </Avatar>
                          </Link>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Link
                                to={c.user.id === user?.id ? '/profile' : `/users/${c.user.id}`}
                                className="text-sm font-medium hover:underline"
                              >
                                {c.user.name}
                              </Link>
                              <span className="text-xs text-muted-foreground">{formatWhen(c.createdAt)}</span>
                            </div>
                            <p className="text-sm text-muted-foreground">{c.content}</p>
                          </div>
                        </div>
                      ))}
                      {(commentsByPostId[post.id] || []).length === 0 && (
                        <p className="text-sm text-muted-foreground">Nenhum comentário ainda.</p>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Input
                      placeholder="Escreva um comentário..."
                      value={commentDraftByPostId[post.id] || ''}
                      onChange={(e) => setCommentDraftByPostId((prev) => ({ ...prev, [post.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void sendComment(post.id);
                      }}
                    />
                    <Button type="button" onClick={() => void sendComment(post.id)} disabled={!(commentDraftByPostId[post.id] || '').trim()}>
                      Enviar
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
          {!isLoading && visiblePosts.length === 0 && feedFilter === 'all' ? (
            <Card className="p-6 glass text-muted-foreground">Sem postagens ainda.</Card>
          ) : null}
          {!isLoading && hasMore ? (
            <Card className="p-4 glass flex items-center justify-center">
              <Button type="button" variant="secondary" disabled={isLoadingMore} onClick={() => void loadMore()}>
                {isLoadingMore ? 'Carregando...' : 'Carregar mais'}
              </Button>
            </Card>
          ) : null}
          <div ref={loadMoreRef} />
        </div>

        {/* Sidebar */}
        <div className="hidden md:block space-y-6">
          {/* Recent Photos */}
          <Card className="p-4 glass">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Image className="w-4 h-4 text-primary" />
              Fotos Recentes
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {recentPhotos.map((photo) => (
                <Dialog key={photo.id}>
                  <DialogTrigger asChild>
                    <div className="aspect-square rounded-lg overflow-hidden cursor-zoom-in hover:opacity-80 transition-opacity">
                      <img src={photo.url} alt="" className="w-full h-full object-cover" />
                    </div>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black/95 border-none shadow-none flex items-center justify-center">
                    <img src={photo.url} alt="" className="w-full h-auto max-h-[90vh] object-contain" />
                  </DialogContent>
                </Dialog>
              ))}
            </div>
          </Card>

          {/* Premium Banner */}
          <Card className="p-4 bg-gradient-to-br from-gold/20 to-primary/20 border-gold/30">
            <Badge className="bg-gold text-black mb-3">Premium</Badge>
            <h3 className="font-semibold mb-2">Destaque seu perfil</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Apareça mais e tenha acesso a recursos exclusivos.
            </p>
            <Button className="w-full bg-gold text-black hover:bg-gold/90">
              Ver Planos
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}

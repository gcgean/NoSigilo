import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, Heart, MessageCircle, Play, Volume2, VolumeX, ChevronDown, ChevronUp, Send, Maximize2, Minimize2, Lock, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { feedService, interactionsService } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { formatProfileIdentityLine } from '@/utils/profileIdentity';
import MobileState from '@/components/MobileState';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getUserProfileHref } from '@/utils/userProfileNavigation';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  COMMENT_ACTION_BUTTON_BASE,
  COMMENT_ACTION_DELETE_CLASS,
  COMMENT_ACTION_EDIT_CLASS,
  COMMENT_CANCEL_BUTTON_CLASS,
  COMMENT_EMOJI_CHIP_CLASS,
  COMMENT_INLINE_INPUT_CLASS,
  COMMENT_QUICK_EMOJIS,
  COMMENT_SAVE_BUTTON_CLASS,
} from '@/components/comments/commentStyles';

type FeedMedia = { id: string; url: string | null; mimeType?: string | null; isLocked?: boolean };
type FeedPost = {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; name: string; avatar?: string | null; gender?: string | null; city?: string | null; state?: string | null };
  media: FeedMedia[];
  likesCount?: number;
  commentsCount?: number;
  likedByMe?: boolean;
};

type ReelItem = {
  id: string;
  postId: string;
  url: string;
  author: FeedPost['author'];
  content: string;
  createdAt: string;
  likesCount: number;
  commentsCount: number;
  likedByMe: boolean;
};

type ReelStats = { likesCount: number; commentsCount: number };
type ReelComment = {
  id: string;
  content: string;
  createdAt: string;
  user?: { id: string; name: string; avatar?: string | null };
};
function getSeenRapStorageKey(userId?: string | null) {
  return `nosigilo:rap:seen:${userId || 'anon'}`;
}

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

export default function Reels() {
  const REELS_PAGE_SIZE = 40;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [initialSeenReelIds, setInitialSeenReelIds] = useState<string[]>([]);
  const [, setSeenReelIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLockedVideos, setHasLockedVideos] = useState(false);
  const [reelsPage, setReelsPage] = useState(1);
  const [hasMoreReels, setHasMoreReels] = useState(true);
  const [isLoadingMoreReels, setIsLoadingMoreReels] = useState(false);
  const [mutedById, setMutedById] = useState<Record<string, boolean>>({});
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [likedByPostId, setLikedByPostId] = useState<Record<string, boolean>>({});
  const [statsByPostId, setStatsByPostId] = useState<Record<string, ReelStats>>({});
  const [commentsOpenFor, setCommentsOpenFor] = useState<ReelItem | null>(null);
  const [comments, setComments] = useState<ReelComment[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isSendingComment, setIsSendingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentDraft, setEditCommentDraft] = useState('');
  const [isMobileMaximized, setIsMobileMaximized] = useState(false);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const mapPostsToReels = useCallback((posts: FeedPost[]) => {
    return posts.flatMap((post) =>
      (post.media || [])
        .filter((media) => String(media.mimeType || '').startsWith('video/') && media.url)
        .map((media) => ({
          id: String(media.id),
          postId: String(post.id),
          url: resolveServerUrl(media.url || ''),
          author: post.author,
          content: String(post.content || ''),
          createdAt: String(post.createdAt || ''),
          likesCount: Number(post.likesCount || 0),
          commentsCount: Number(post.commentsCount || 0),
          likedByMe: post.likedByMe === true,
        }))
    ) as ReelItem[];
  }, []);

  const appendReels = useCallback((nextItems: ReelItem[]) => {
    if (nextItems.length === 0) return;
    setReels((prev) => {
      const seen = new Set(prev.map((item) => item.id));
      const merged = [...prev];
      for (const item of nextItems) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        merged.push(item);
      }
      return merged;
    });
    setLikedByPostId((prev) => {
      const next = { ...prev };
      for (const item of nextItems) next[item.postId] = item.likedByMe;
      return next;
    });
    setStatsByPostId((prev) => {
      const next = { ...prev };
      for (const item of nextItems) {
        if (!next[item.postId]) {
          next[item.postId] = { likesCount: item.likesCount, commentsCount: item.commentsCount };
        }
      }
      return next;
    });
    setMutedById((prev) => {
      const next = { ...prev };
      for (const item of nextItems) {
        if (typeof next[item.id] === 'undefined') next[item.id] = true;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(getSeenRapStorageKey(user?.id));
      const parsed = raw ? JSON.parse(raw) : [];
      const nextSeenIds = Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
      setInitialSeenReelIds(nextSeenIds);
      setSeenReelIds(nextSeenIds);
    } catch {
      setInitialSeenReelIds([]);
      setSeenReelIds([]);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!isMobileMaximized) {
      document.body.removeAttribute('data-reels-maximized');
      return;
    }
    document.body.setAttribute('data-reels-maximized', '1');
    return () => {
      document.body.removeAttribute('data-reels-maximized');
    };
  }, [isMobileMaximized]);

  useEffect(() => {
    if (!isMobile && isMobileMaximized) {
      setIsMobileMaximized(false);
    }
  }, [isMobile, isMobileMaximized]);

  const reelViewportHeight = isMobile && isMobileMaximized ? '100dvh' : 'calc(100dvh - 8rem)';

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        if (cancelled) return;
        setReels([]);
        setHasLockedVideos(false);
        setLikedByPostId({});
        setStatsByPostId({});
        setMutedById({});

        let currentPage = 1;
        let hasMore = true;
        let foundAnyReel = false;
        let foundLockedVideo = false;

        while (hasMore && !foundAnyReel) {
          const data = await feedService.getFeed({ page: currentPage, limit: REELS_PAGE_SIZE, includeReelsOnly: true });
          if (cancelled) return;

          const posts = Array.isArray(data?.posts) ? (data.posts as FeedPost[]) : [];
          const pageReels = mapPostsToReels(posts);

          const containsLockedVideo = posts.some((post) =>
            (post.media || []).some(
              (media) => String(media?.mimeType || '').startsWith('video/') && media?.isLocked === true
            )
          );
          if (containsLockedVideo) foundLockedVideo = true;

          if (pageReels.length > 0) {
            appendReels(pageReels);
            foundAnyReel = true;
          }

          hasMore = Boolean(data?.hasMore);
          if (!foundAnyReel && hasMore) currentPage += 1;
        }

        if (foundLockedVideo) setHasLockedVideos(true);
        setReelsPage(currentPage);
        setHasMoreReels(hasMore);
      } catch {
        if (cancelled) return;
        setReels([]);
        setHasLockedVideos(false);
        setHasMoreReels(false);
      } finally {
        if (cancelled) return;
        setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [appendReels, mapPostsToReels]);

  const loadMoreReels = useCallback(async () => {
    if (isLoading || isLoadingMoreReels || !hasMoreReels) return;
    const nextPage = reelsPage + 1;
    setIsLoadingMoreReels(true);
    try {
      const data = await feedService.getFeed({ page: nextPage, limit: REELS_PAGE_SIZE, includeReelsOnly: true });
      const posts = Array.isArray(data?.posts) ? (data.posts as FeedPost[]) : [];
      const containsLockedVideo = posts.some((post) =>
        (post.media || []).some(
          (media) => String(media?.mimeType || '').startsWith('video/') && media?.isLocked === true
        )
      );
      if (containsLockedVideo) setHasLockedVideos(true);
      appendReels(mapPostsToReels(posts));
      setReelsPage(nextPage);
      setHasMoreReels(Boolean(data?.hasMore));
    } catch {
      toast({
        title: 'Não foi possível carregar mais vídeos',
        description: 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingMoreReels(false);
    }
  }, [appendReels, hasMoreReels, isLoading, isLoadingMoreReels, mapPostsToReels, reelsPage, toast]);

  const orderedReels = useMemo(() => {
    const seenIds = new Set(initialSeenReelIds);
    const unseen = reels.filter((item) => !seenIds.has(item.id));
    const seen = reels.filter((item) => seenIds.has(item.id));
    return [...unseen, ...seen];
  }, [initialSeenReelIds, reels]);

  const markReelAsSeen = useCallback((reelId: string) => {
    if (!reelId) return;

    setSeenReelIds((prev) => {
      if (prev.includes(reelId)) return prev;
      const next = [...prev, reelId];
      try {
        localStorage.setItem(getSeenRapStorageKey(user?.id), JSON.stringify(next));
      } catch {
        // Falha de persistencia local nao pode quebrar o player
      }
      return next;
    });
  }, [user?.id]);

  useEffect(() => {
    if (orderedReels.length === 0) {
      setPlayingId(null);
      setCurrentIndex(0);
      return;
    }

    if (!playingId || !orderedReels.some((item) => item.id === playingId)) {
      setPlayingId(orderedReels[0].id);
      setCurrentIndex(0);
    }
  }, [orderedReels, playingId]);

  // IntersectionObserver: play/pause on visibility + track current index
  useEffect(() => {
    if (orderedReels.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const el = entry.target as HTMLDivElement;
          const id = el.dataset.reelId;
          if (!id) return;
          const video = videoRefs.current[id];
          if (!video) return;

          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            void video.play().catch(() => {});
            setPlayingId(id);
            markReelAsSeen(id);
            const idx = orderedReels.findIndex((r) => r.id === id);
            if (idx !== -1) setCurrentIndex(idx);
          } else {
            video.pause();
          }
        });
      },
      { threshold: 0.6 }
    );

    Object.values(itemRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [markReelAsSeen, orderedReels]);

  const scrollTo = useCallback((idx: number, behavior: ScrollBehavior = 'smooth') => {
    const reel = orderedReels[idx];
    if (!reel) return;
    const el = itemRefs.current[reel.id];
    el?.scrollIntoView({ behavior, block: 'start' });
  }, [orderedReels]);

  const restartFromBeginning = useCallback(() => {
    const firstReel = orderedReels[0];
    if (!firstReel) return;

    // If we're already at the first item (single video case), force replay.
    const firstVideo = videoRefs.current[firstReel.id];
    if (firstVideo) {
      try {
        firstVideo.currentTime = 0;
      } catch {
        // ignore
      }
      void firstVideo.play().catch(() => {});
    }

    setPlayingId(firstReel.id);
    setCurrentIndex(0);
    scrollTo(0, 'auto');
  }, [orderedReels, scrollTo]);

  const handleVideoEnded = useCallback((idx: number) => {
    const next = idx + 1;
    if (next < orderedReels.length) {
      scrollTo(next);
    } else {
      restartFromBeginning();
    }
  }, [orderedReels.length, restartFromBeginning, scrollTo]);

  useEffect(() => {
    if (isLoading) return;
    if (!hasMoreReels || isLoadingMoreReels) return;
    if (orderedReels.length === 0) return;
    if (currentIndex >= orderedReels.length - 3) {
      void loadMoreReels();
    }
  }, [currentIndex, hasMoreReels, isLoading, isLoadingMoreReels, loadMoreReels, orderedReels.length]);

  const toggleMute = useCallback((id: string) => {
    setMutedById((prev) => {
      const nextMuted = !(prev[id] ?? true);
      const video = videoRefs.current[id];
      if (video) video.muted = nextMuted;
      return { ...prev, [id]: nextMuted };
    });
  }, []);

  const togglePlay = useCallback((id: string) => {
    const video = videoRefs.current[id];
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => {});
      setPlayingId(id);
    } else {
      video.pause();
      setPlayingId(null);
    }
  }, []);

  const handleVideoAreaClick = useCallback((id: string) => {
    if (isMobile && !isMobileMaximized) {
      setIsMobileMaximized(true);
      return;
    }
    togglePlay(id);
  }, [isMobile, isMobileMaximized, togglePlay]);

  const loadComments = useCallback(async (reel: ReelItem) => {
    setIsLoadingComments(true);
    try {
      const data = await interactionsService.getComments('post', reel.postId);
      setComments(Array.isArray(data) ? data : []);
    } catch {
      setComments([]);
      toast({
        title: 'Não foi possível carregar os comentários',
        description: 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingComments(false);
    }
  }, [toast]);

  const openComments = useCallback(async (reel: ReelItem) => {
    setCommentsOpenFor(reel);
    setCommentDraft('');
    setEditingCommentId(null);
    setEditCommentDraft('');
    await loadComments(reel);
  }, [loadComments]);

  const handleToggleLike = useCallback(async (reel: ReelItem) => {
    if (!user) return;
    const already = !!likedByPostId[reel.postId];

    setLikedByPostId((prev) => ({ ...prev, [reel.postId]: !already }));
    setStatsByPostId((prev) => {
      const current = prev[reel.postId] ?? { likesCount: reel.likesCount, commentsCount: reel.commentsCount };
      return {
        ...prev,
        [reel.postId]: {
          ...current,
          likesCount: Math.max(0, current.likesCount + (already ? -1 : 1)),
        },
      };
    });

    try {
      if (already) {
        await interactionsService.unlike('post', reel.postId);
      } else {
        await interactionsService.like('post', reel.postId);
      }
    } catch {
      setLikedByPostId((prev) => ({ ...prev, [reel.postId]: already }));
      setStatsByPostId((prev) => {
        const current = prev[reel.postId] ?? { likesCount: reel.likesCount, commentsCount: reel.commentsCount };
        return {
          ...prev,
          [reel.postId]: {
            ...current,
            likesCount: Math.max(0, current.likesCount + (already ? 0 : -1) + (already ? 1 : 0)),
          },
        };
      });
      toast({
        title: 'Não foi possível atualizar a curtida',
        description: 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    }
  }, [likedByPostId, toast, user]);

  const handleSubmitComment = useCallback(async () => {
    if (!commentsOpenFor || !commentDraft.trim()) return;

    setIsSendingComment(true);
    try {
      await interactionsService.comment('post', commentsOpenFor.postId, commentDraft.trim());
      setCommentDraft('');
      setStatsByPostId((prev) => {
        const current = prev[commentsOpenFor.postId] ?? {
          likesCount: commentsOpenFor.likesCount,
          commentsCount: commentsOpenFor.commentsCount,
        };
        return {
          ...prev,
          [commentsOpenFor.postId]: {
            ...current,
            commentsCount: current.commentsCount + 1,
          },
        };
      });
      await loadComments(commentsOpenFor);
    } catch {
      toast({
        title: 'Não foi possível comentar',
        description: 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    } finally {
      setIsSendingComment(false);
    }
  }, [commentDraft, commentsOpenFor, loadComments, toast]);

  const startEditingComment = (comment: ReelComment) => {
    setEditingCommentId(comment.id);
    setEditCommentDraft(comment.content || '');
  };

  const cancelEditingComment = () => {
    setEditingCommentId(null);
    setEditCommentDraft('');
  };

  const saveEditedComment = async (commentId: string) => {
    if (!commentsOpenFor) return;
    const content = editCommentDraft.trim();
    if (!content) return;
    try {
      await interactionsService.updateComment(commentId, content);
      setEditingCommentId(null);
      setEditCommentDraft('');
      await loadComments(commentsOpenFor);
    } catch {
      toast({
        title: 'Não foi possível editar o comentário',
        description: 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    }
  };

  const removeComment = async (commentId: string) => {
    if (!commentsOpenFor) return;
    try {
      await interactionsService.deleteComment(commentId);
      setStatsByPostId((prev) => {
        const current = prev[commentsOpenFor.postId] ?? {
          likesCount: commentsOpenFor.likesCount,
          commentsCount: commentsOpenFor.commentsCount,
        };
        return {
          ...prev,
          [commentsOpenFor.postId]: {
            ...current,
            commentsCount: Math.max(0, current.commentsCount - 1),
          },
        };
      });
      await loadComments(commentsOpenFor);
    } catch {
      toast({
        title: 'Não foi possível excluir o comentário',
        description: 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    }
  };

  const reelsWithMeta = useMemo(
    () =>
      orderedReels.map((item) => ({
        ...item,
        identityLine: formatProfileIdentityLine(item.author),
        when: item.createdAt ? formatWhen(item.createdAt) : '',
        stats: statsByPostId[item.postId] ?? {
          likesCount: item.likesCount,
          commentsCount: item.commentsCount,
        },
      })),
    [orderedReels, statsByPostId]
  );

  if (isLoading) {
    return (
      <div className="flex h-[calc(100dvh-8rem)] items-center justify-center">
        <MobileState
          loading
          title="Carregando Rap"
          description="Separando os vídeos do feed para você assistir em sequência."
        />
      </div>
    );
  }

  if (reelsWithMeta.length === 0) {
    if (hasLockedVideos) {
      return (
        <div className="flex h-[calc(100dvh-8rem)] items-center justify-center px-4">
          <div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-sm">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-xl font-semibold">Vídeos disponíveis apenas para Premium</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Existem vídeos no Rap, mas seu plano atual não permite assistir.
            </p>
            <Button
              type="button"
              className="mt-5 w-full gap-2 bg-gradient-primary text-white hover:opacity-90"
              onClick={() => navigate('/subscriptions')}
            >
              <Crown className="h-4 w-4" />
              Ver planos
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex h-[calc(100dvh-8rem)] items-center justify-center">
        <MobileState
          icon={Clapperboard}
          title="Nenhum vídeo disponível"
          description="Quando houver vídeos publicados no feed, eles vão aparecer aqui."
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative overflow-y-scroll"
      style={{
        height: reelViewportHeight,
        scrollSnapType: 'y mandatory',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        WebkitOverflowScrolling: 'touch',
      } as React.CSSProperties}
    >
      {/* Navigation arrows (desktop) */}
      {currentIndex > 0 && (
        <button
          type="button"
          onClick={() => scrollTo(currentIndex - 1)}
          className="fixed left-1/2 top-24 z-50 hidden -translate-x-1/2 items-center justify-center rounded-full bg-black/40 p-2 text-white backdrop-blur-sm transition hover:bg-black/60 md:flex"
        >
          <ChevronUp className="h-5 w-5" />
        </button>
      )}
      {currentIndex < orderedReels.length - 1 && (
        <button
          type="button"
          onClick={() => scrollTo(currentIndex + 1)}
          className="fixed bottom-24 left-1/2 z-50 hidden -translate-x-1/2 items-center justify-center rounded-full bg-black/40 p-2 text-white backdrop-blur-sm transition hover:bg-black/60 md:flex"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
      )}

      {reelsWithMeta.map((reel, idx) => (
        <div
          key={reel.id}
          ref={(node) => { itemRefs.current[reel.id] = node; }}
          data-reel-id={reel.id}
          className="relative flex w-full items-center justify-center bg-black"
          style={{
            height: reelViewportHeight,
            scrollSnapAlign: 'start',
            scrollSnapStop: 'always',
          }}
        >
          {/* Video */}
          <video
            ref={(node) => { videoRefs.current[reel.id] = node; }}
            src={reel.url}
            className="h-full w-full object-cover"
            playsInline
            loop={false}
            muted={mutedById[reel.id] ?? true}
            preload="metadata"
            onEnded={() => handleVideoEnded(idx)}
            onClick={() => handleVideoAreaClick(reel.id)}
          />

          {/* Dark gradient overlay */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />

          {/* Right side actions */}
          <div className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col items-center gap-4">
            {/* Maximize (mobile) */}
            <button
              type="button"
              onClick={() => setIsMobileMaximized((prev) => !prev)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60 md:hidden"
              aria-label={isMobileMaximized ? 'Desfazer maximização' : 'Maximizar vídeo'}
            >
              {isMobileMaximized ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
            </button>

            {/* Mute */}
            <button
              type="button"
              onClick={() => toggleMute(reel.id)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
            >
              {mutedById[reel.id] ?? true
                ? <VolumeX className="h-5 w-5" />
                : <Volume2 className="h-5 w-5" />}
            </button>

            {/* Like */}
            <button type="button" onClick={() => void handleToggleLike(reel)} className="flex flex-col items-center gap-1 text-white">
              <div className={`flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-sm transition hover:bg-black/60 ${likedByPostId[reel.postId] ? 'bg-rose-500/70' : 'bg-black/40'}`}>
                <Heart className={`h-5 w-5 ${likedByPostId[reel.postId] ? 'fill-white' : ''}`} />
              </div>
              <span className="text-xs font-medium text-white/85">{reel.stats.likesCount}</span>
            </button>

            {/* Comments */}
            <button
              type="button"
              onClick={() => void openComments(reel)}
              className="flex flex-col items-center gap-1 text-white"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm transition hover:bg-black/60">
                <MessageCircle className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium text-white/85">{reel.stats.commentsCount}</span>
            </button>
          </div>

          {/* Bottom info */}
          <div className="absolute bottom-0 left-0 right-0 p-4 pb-6 text-white">
            {/* Author */}
            <div className="mb-3 flex items-center gap-3">
              <button
                type="button"
                className="overflow-hidden rounded-full ring-2 ring-white/30"
                onClick={() => navigate(getUserProfileHref(reel.author.id, user?.id, '/rap'))}
              >
                {reel.author.avatar ? (
                  <img
                    src={resolveServerUrl(reel.author.avatar)}
                    alt={reel.author.name}
                    className="h-11 w-11 object-cover"
                  />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-sm font-bold">
                    {String(reel.author.name || 'U')[0].toUpperCase()}
                  </div>
                )}
              </button>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  className="block truncate text-left text-[15px] font-semibold hover:underline"
                  onClick={() => navigate(getUserProfileHref(reel.author.id, user?.id, '/rap'))}
                >
                  {reel.author.name}
                </button>
                <p className="truncate text-xs text-white/70">
                  {reel.identityLine || reel.when || 'Rap'}
                </p>
              </div>

              <Button
                type="button"
                size="sm"
                className="h-9 shrink-0 rounded-xl bg-gradient-primary px-4 text-sm font-semibold text-white hover:opacity-90"
                onClick={() => navigate(getUserProfileHref(reel.author.id, user?.id, '/rap'))}
              >
                Ver perfil
              </Button>
            </div>

            {/* Caption */}
            {reel.content ? (
              <p className="line-clamp-2 text-sm leading-6 text-white/90">{reel.content}</p>
            ) : null}

            {/* Swipe hint — only on first video */}
            {idx === 0 && (
              <div className="mt-3 flex items-center gap-1.5 text-white/50">
                <ChevronDown className="h-3.5 w-3.5 animate-bounce" />
                <span className="text-xs">Deslize para o próximo vídeo</span>
              </div>
            )}
          </div>

          {/* Paused overlay */}
          {playingId !== reel.id && (
            <button
              type="button"
              onClick={() => handleVideoAreaClick(reel.id)}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
                <Play className="h-8 w-8 translate-x-0.5 text-white" />
              </div>
            </button>
          )}
        </div>
      ))}

      <Dialog
        open={!!commentsOpenFor}
        onOpenChange={(open) => {
          if (!open) {
            setCommentsOpenFor(null);
            setComments([]);
            setCommentDraft('');
            setEditingCommentId(null);
            setEditCommentDraft('');
          }
        }}
      >
        <DialogContent className="max-h-[85dvh] w-[min(92vw,34rem)] overflow-hidden rounded-2xl border-zinc-800 bg-zinc-950 p-0 text-white">
          <DialogHeader className="border-b border-white/10 px-5 py-4 text-left">
            <DialogTitle className="text-base font-semibold">
              {commentsOpenFor ? `Comentários de ${commentsOpenFor.author.name}` : 'Comentários'}
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[52dvh] overflow-y-auto px-5 py-4">
            {isLoadingComments ? (
              <div className="py-10 text-center text-sm text-white/60">Carregando comentários...</div>
            ) : comments.length === 0 ? (
              <div className="py-10 text-center text-sm text-white/60">Ainda não há comentários neste vídeo.</div>
            ) : (
              <div className="space-y-4">
                {comments.map((comment) => (
                  <div key={comment.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="mb-1 flex items-center gap-3">
                      {comment.user?.avatar ? (
                        <img
                          src={resolveServerUrl(comment.user.avatar)}
                          alt={comment.user.name}
                          className="h-9 w-9 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xs font-semibold">
                          {String(comment.user?.name || 'U')[0].toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">
                          {comment.user?.name || 'Usuário'}
                        </p>
                        <p className="text-xs text-white/50">{formatWhen(comment.createdAt)}</p>
                      </div>
                      {String(comment.user?.id || '') === String(user?.id || '') ? (
                        <div className="ml-auto flex items-center gap-2">
                          <button
                            type="button"
                            className={`${COMMENT_ACTION_BUTTON_BASE} ${COMMENT_ACTION_EDIT_CLASS}`}
                            onClick={() => startEditingComment(comment)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className={`${COMMENT_ACTION_BUTTON_BASE} ${COMMENT_ACTION_DELETE_CLASS}`}
                            onClick={() => void removeComment(comment.id)}
                          >
                            Excluir
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {editingCommentId === comment.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editCommentDraft}
                          onChange={(event) => setEditCommentDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') void saveEditedComment(comment.id);
                          }}
                          className={COMMENT_INLINE_INPUT_CLASS}
                        />
                        <Button
                          type="button"
                          size="sm"
                          className={COMMENT_SAVE_BUTTON_CLASS}
                          onClick={() => void saveEditedComment(comment.id)}
                          disabled={!editCommentDraft.trim()}
                        >
                          Salvar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={COMMENT_CANCEL_BUTTON_CLASS}
                          onClick={cancelEditingComment}
                        >
                          Cancelar
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm leading-6 text-white/85">{comment.content}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-white/10 px-5 py-4">
            <div className="space-y-2">
              <div className="flex items-end gap-3">
                <Textarea
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  placeholder="Comentar vídeo..."
                  className="min-h-[96px] resize-none border-white/10 bg-white text-zinc-900 placeholder:text-zinc-500 focus-visible:ring-rose-500"
                />
                <Button
                  type="button"
                  onClick={() => void handleSubmitComment()}
                  disabled={isSendingComment || !commentDraft.trim()}
                  className="h-12 shrink-0 rounded-xl bg-gradient-primary px-4 text-white hover:opacity-90"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {COMMENT_QUICK_EMOJIS.map((emoji) => (
                  <button
                    key={`reel-emoji-${emoji}`}
                    type="button"
                    onClick={() => setCommentDraft((prev) => `${prev}${emoji}`)}
                    className={COMMENT_EMOJI_CHIP_CLASS}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

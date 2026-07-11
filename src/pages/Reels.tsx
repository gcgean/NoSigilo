import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, Heart, MessageCircle, Play, Volume2, VolumeX, ChevronDown, ChevronUp, Send, Maximize2, Minimize2, Lock, Crown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { interactionsService, videoSearchService } from '@/services/api';
import { readVideoFilters, videoFiltersToSearchParams } from '@/lib/videoFilters';
import { readSeenVideoIds, addSeenVideoId } from '@/lib/videoSeen';
import { useActivityTracker } from '@/contexts/ActivityTrackerContext';
import { resolveServerUrl } from '@/utils/serverUrl';
import { formatProfileIdentityLine } from '@/utils/profileIdentity';
import MobileState from '@/components/MobileState';
import ReferralPaywallModal from '@/components/ReferralPaywallModal';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { hasPremiumAccess } from '@/utils/premium';
import { useProfileGate } from '@/contexts/ProfileGateContext';
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
  const [searchParams] = useSearchParams();
  const targetReelId = searchParams.get('reelId') ?? null;
  const { user } = useAuth();
  const { toast } = useToast();
  const { registerActivity } = useActivityTracker();
  const reelCompleteCountRef = useRef(0);
  const isMobile = useIsMobile();
  const premiumAccess = hasPremiumAccess(user);
  const { requireFields } = useProfileGate();
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [initialSeenReelIds, setInitialSeenReelIds] = useState<string[]>([]);
  const [, setSeenReelIds] = useState<string[]>([]);
  // "Não vistos" salvo na Busca de Vídeos: quando ligado, o Reels pula os já vistos.
  const [skipSeen] = useState(() => readVideoFilters().onlyUnseen);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);   // falha ao carregar (≠ "sem vídeos")
  const [reloadTick, setReloadTick] = useState(0);      // re-dispara a carga (retry / ao reabrir)
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [hasLockedVideos, setHasLockedVideos] = useState(false);
  const [reelsPage, setReelsPage] = useState(1);
  const [hasMoreReels, setHasMoreReels] = useState(true);
  const [isLoadingMoreReels, setIsLoadingMoreReels] = useState(false);
  const [muted, setMuted] = useState(true); // som global: vale para todos os reels
  const loadedReelIdsRef = useRef<Set<string>>(new Set()); // ids já carregados (dedup + detectar novos na paginação)
  const [progressById, setProgressById] = useState<Record<string, number>>({});
  const [bufferingById, setBufferingById] = useState<Record<string, boolean>>({});
  const [heartBurstId, setHeartBurstId] = useState<string | null>(null);
  const tapTimerRef = useRef<Record<string, number>>({});
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  // Reel pré-carregado via sessionStorage (vindo de SearchVideos)
  const [preloadedReel, setPreloadedReel] = useState<ReelItem | null>(null);
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

  // Vídeos vindos do videoSearchService (mesma fonte/filtros da Busca de Vídeos).
  const mapVideosToReels = useCallback((videos: Awaited<ReturnType<typeof videoSearchService.search>>['videos']) => {
    return videos
      .filter((v) => v.videoUrl)
      .map((v) => ({
        id: String(v.mediaId),
        postId: String(v.postId),
        url: resolveServerUrl(v.videoUrl),
        author: v.author,
        content: String(v.content || ''),
        createdAt: String(v.createdAt || ''),
        likesCount: Number(v.likesCount || 0),
        commentsCount: Number(v.commentsCount || 0),
        likedByMe: false,
      })) as ReelItem[];
  }, []);

  const appendReels = useCallback((nextItems: ReelItem[]) => {
    if (nextItems.length === 0) return;
    setReels((prev) => {
      const seen = new Set(prev.map((item) => item.id));
      const merged = [...prev];
      for (const item of nextItems) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        loadedReelIdsRef.current.add(item.id);
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
  }, []);

  useEffect(() => {
    const ids = Array.from(readSeenVideoIds(user?.id));
    setInitialSeenReelIds(ids);
    setSeenReelIds(ids);
  }, [user?.id]);

  // Carrega reel alvo pré-salvo pelo SearchVideos e injeta na posição 0
  useEffect(() => {
    if (!targetReelId) return;
    try {
      const raw = sessionStorage.getItem('nosigilo:target-reel');
      if (!raw) return;
      const item = JSON.parse(raw) as ReelItem;
      if (String(item.id) !== targetReelId) return;
      sessionStorage.removeItem('nosigilo:target-reel');
      setPreloadedReel(item);
      // Inicializa estado de like para esse reel
      setLikedByPostId((prev) => ({ [item.postId]: item.likedByMe, ...prev }));
      setStatsByPostId((prev) => ({
        [item.postId]: { likesCount: item.likesCount, commentsCount: item.commentsCount },
        ...prev,
      }));
    } catch { /* ignora */ }
  }, [targetReelId]);

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

  useEffect(() => {
    if (!isMobile) return;
    setIsMobileMaximized(true);
  }, [isMobile]);

  const reelViewportHeight = isMobile && isMobileMaximized ? '100dvh' : 'calc(100dvh - 8.75rem)';

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(false);

    (async () => {
      try {
        if (cancelled) return;

        // Fila vinda da Busca de Vídeos: a lista completa que o usuário estava
        // vendo. Assim ele consegue deslizar por TODOS os vídeos da busca, e não
        // ficar preso só no que clicou (o feed do Rap é filtrado por preferência
        // e pode trazer poucos vídeos).
        let queueReels: ReelItem[] = [];
        if (targetReelId) {
          try {
            const raw = sessionStorage.getItem('nosigilo:reel-queue');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) queueReels = parsed as ReelItem[];
              sessionStorage.removeItem('nosigilo:reel-queue');
            }
          } catch { /* ignora */ }
        }

        setReels(queueReels);
        loadedReelIdsRef.current.clear();
        for (const r of queueReels) loadedReelIdsRef.current.add(String(r.id));
        setHasLockedVideos(false);
        setLikedByPostId(() => {
          const map: Record<string, boolean> = {};
          for (const r of queueReels) map[r.postId] = r.likedByMe;
          return map;
        });
        setStatsByPostId(() => {
          const map: Record<string, ReelStats> = {};
          for (const r of queueReels) {
            map[r.postId] = { likesCount: r.likesCount, commentsCount: r.commentsCount };
          }
          return map;
        });

        // Usa os MESMOS filtros (salvos no dispositivo) da Busca de Vídeos:
        // tipo de perfil / cidade / distância / ordenação.
        const filters = readVideoFilters();
        let currentPage = 1;
        let hasMore = true;
        let foundAnyReel = false;
        // Proteção contra loop infinito: se o backend devolver páginas sem fim
        // (hasMore sempre true) e nenhuma trouxer vídeo, paramos após um limite
        // generoso. No fluxo normal os vídeos já vêm na 1ª página.
        const MAX_INITIAL_PAGES = 25;
        let pagesScanned = 0;

        while (hasMore && !foundAnyReel && pagesScanned < MAX_INITIAL_PAGES) {
          pagesScanned += 1;
          const data = await videoSearchService.search(videoFiltersToSearchParams(filters, currentPage, REELS_PAGE_SIZE));
          if (cancelled) return;

          const list = Array.isArray(data?.videos) ? data.videos : [];
          // Dedup contra o que já veio na fila da Busca de Vídeos.
          const pageReels = mapVideosToReels(list).filter((r) => !loadedReelIdsRef.current.has(r.id));

          if (pageReels.length > 0) {
            appendReels(pageReels);
            foundAnyReel = true;
          }

          hasMore = Boolean(data?.hasMore);
          if (!foundAnyReel && hasMore) currentPage += 1;
        }

        setReelsPage(currentPage);
        setHasMoreReels(hasMore);
      } catch {
        if (cancelled) return;
        setReels([]);
        setHasLockedVideos(false);
        setHasMoreReels(false);
        setLoadError(true);
      } finally {
        if (cancelled) return;
        setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [appendReels, mapVideosToReels, targetReelId, reloadTick]);

  // Recarrega ao reabrir o app/aba (visibilitychange) se a lista está vazia —
  // cura o caso de uma falha transitória (ex.: cold start) ter deixado "sem vídeos".
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !isLoading && reels.length === 0) {
        setReloadTick((t) => t + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [isLoading, reels.length]);

  const loadMoreReels = useCallback(async () => {
    if (isLoading || isLoadingMoreReels || !hasMoreReels) return;
    setIsLoadingMoreReels(true);
    try {
      const filters = readVideoFilters();
      let page = reelsPage;
      let more = true;
      let addedAny = false;
      let guard = 0;
      // Continua avançando páginas até trazer novos reels ou o backend indicar fim.
      while (more && !addedAny && guard < 8) {
        guard += 1;
        page += 1;
        const data = await videoSearchService.search(videoFiltersToSearchParams(filters, page, REELS_PAGE_SIZE));
        const list = Array.isArray(data?.videos) ? data.videos : [];
        const pageReels = mapVideosToReels(list);
        // Considera só vídeos ainda não carregados (a paginação pode ter sobreposição)
        const newReels = pageReels.filter((r) => !loadedReelIdsRef.current.has(r.id));
        if (newReels.length > 0) { appendReels(newReels); addedAny = true; }
        more = Boolean(data?.hasMore);
      }
      setReelsPage(page);
      setHasMoreReels(more);
    } catch {
      toast({
        title: 'Não foi possível carregar mais vídeos',
        description: 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingMoreReels(false);
    }
  }, [appendReels, hasMoreReels, isLoading, isLoadingMoreReels, mapVideosToReels, reelsPage, toast]);

  const orderedReels = useMemo(() => {
    const seenIds = new Set(initialSeenReelIds);
    const unseen = reels.filter((item) => !seenIds.has(item.id));
    const seen   = reels.filter((item) => seenIds.has(item.id));
    // "Não vistos" ligado: pula os já vistos (usa a lista do início da sessão,
    // então o vídeo que você está assistindo agora não some da fila).
    const base   = skipSeen ? unseen : [...unseen, ...seen];
    // Se há um reel pré-carregado (vindo de SearchVideos), coloca no índice 0
    // — mesmo com "Não vistos", pois foi ele que o usuário clicou para ver.
    if (preloadedReel) {
      const withoutTarget = base.filter((r) => r.id !== preloadedReel.id);
      return [preloadedReel, ...withoutTarget];
    }
    return base;
  }, [initialSeenReelIds, reels, preloadedReel, skipSeen]);

  const markReelAsSeen = useCallback((reelId: string) => {
    if (!reelId) return;

    addSeenVideoId(reelId, user?.id); // lista única compartilhada com a Busca de Vídeos
    setSeenReelIds((prev) => (prev.includes(reelId) ? prev : [...prev, reelId]));
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

  // Scroll to a specific reel when navigated from video search (?reelId=xxx)
  const didScrollToTargetRef = useRef(false);
  useEffect(() => {
    if (!targetReelId || didScrollToTargetRef.current || isLoading) return;
    const idx = orderedReels.findIndex((r) => r.id === targetReelId);
    if (idx === -1) return;
    didScrollToTargetRef.current = true;
    // Small delay so the DOM elements are rendered
    setTimeout(() => {
      const el = itemRefs.current[targetReelId];
      if (el) {
        el.scrollIntoView({ behavior: 'auto', block: 'start' });
        setCurrentIndex(idx);
        setPlayingId(targetReelId);
      }
    }, 120);
  }, [targetReelId, orderedReels, isLoading]);

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
            // Não auto-play para não-premium — só mostra o thumbnail
            if (premiumAccess) {
              void video.play().catch(() => {});
            }
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
  }, [markReelAsSeen, orderedReels, premiumAccess]);

  const scrollTo = useCallback((idx: number, behavior: ScrollBehavior = 'smooth') => {
    const reel = orderedReels[idx];
    if (!reel) return;
    const el = itemRefs.current[reel.id];
    el?.scrollIntoView({ behavior, block: 'start' });
  }, [orderedReels]);

  // Navegação estilo Instagram/TikTok: cada gesto de wheel/tecla avança exatamente
  // UM vídeo, com uma trava curta para não pular vários de uma vez. No mobile o
  // swipe continua usando o scroll-snap nativo (não interceptamos touch).
  const wheelLockRef = useRef(false);
  const currentIndexRef = useRef(0);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const goRelative = (dir: number) => {
      if (wheelLockRef.current) return;
      const target = currentIndexRef.current + dir;
      if (target < 0 || target >= orderedReels.length) return;
      wheelLockRef.current = true;
      scrollTo(target);
      setCurrentIndex(target);
      setPlayingId(orderedReels[target]?.id ?? null);
      window.setTimeout(() => { wheelLockRef.current = false; }, 650);
    };

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 8) return;
      e.preventDefault();
      goRelative(e.deltaY > 0 ? 1 : -1);
    };

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      // Não sequestra setas/espaço enquanto o usuário digita um comentário
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        goRelative(1);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        goRelative(-1);
      }
    };

    // Touch (mobile): controlamos o swipe manualmente para garantir que cada
    // deslize avance exatamente um vídeo — o scroll-snap nativo "voltava" para
    // o mesmo vídeo em swipes suaves.
    let touchStartY = 0;
    let touchStartX = 0;
    let touchTracking = false;
    const SWIPE_THRESHOLD = 45; // px mínimos para considerar um swipe

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) { touchTracking = false; return; }
      touchStartY = e.touches[0].clientY;
      touchStartX = e.touches[0].clientX;
      touchTracking = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!touchTracking) return;
      const dy = e.touches[0].clientY - touchStartY;
      const dx = e.touches[0].clientX - touchStartX;
      // Só impede o scroll nativo quando o gesto é predominantemente vertical,
      // para não atrapalhar toques/cliques nos botões laterais.
      if (Math.abs(dy) > Math.abs(dx)) {
        e.preventDefault();
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!touchTracking) return;
      touchTracking = false;
      const endTouch = e.changedTouches[0];
      if (!endTouch) return;
      const dy = endTouch.clientY - touchStartY;
      const dx = endTouch.clientX - touchStartX;
      // Ignora toques (tap) e gestos horizontais
      if (Math.abs(dy) < SWIPE_THRESHOLD || Math.abs(dy) <= Math.abs(dx)) return;
      // Arrastar para cima (dy negativo) = próximo vídeo
      goRelative(dy < 0 ? 1 : -1);
    };

    // Mouse drag (desktop / janela estreita sem touch): arrastar para cima/baixo
    // também avança/volta um vídeo, replicando o gesto de "deslizar".
    let mouseDownY = 0;
    let mouseDownX = 0;
    let mouseDragging = false;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // só botão esquerdo
      mouseDownY = e.clientY;
      mouseDownX = e.clientX;
      mouseDragging = true;
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!mouseDragging) return;
      mouseDragging = false;
      const dy = e.clientY - mouseDownY;
      const dx = e.clientX - mouseDownX;
      // Ignora cliques (sem arrasto) e arrastos horizontais — preserva os botões
      if (Math.abs(dy) < SWIPE_THRESHOLD || Math.abs(dy) <= Math.abs(dx)) return;
      goRelative(dy < 0 ? 1 : -1);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKey);
    };
  }, [orderedReels, scrollTo]);

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
    reelCompleteCountRef.current += 1;
    if (reelCompleteCountRef.current === 3) registerActivity('reel');
    const next = idx + 1;
    if (next < orderedReels.length) {
      scrollTo(next);
    } else {
      restartFromBeginning();
    }
  }, [orderedReels.length, registerActivity, restartFromBeginning, scrollTo]);

  useEffect(() => {
    if (isLoading) return;
    if (!hasMoreReels || isLoadingMoreReels) return;
    if (orderedReels.length === 0) return;
    if (currentIndex >= orderedReels.length - 3) {
      void loadMoreReels();
    }
  }, [currentIndex, hasMoreReels, isLoading, isLoadingMoreReels, loadMoreReels, orderedReels.length]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      // Aplica o som a TODOS os vídeos (estado global de mute)
      Object.values(videoRefs.current).forEach((v) => { if (v) v.muted = next; });
      return next;
    });
  }, []);

  const setBuffering = useCallback((id: string, val: boolean) => {
    setBufferingById((prev) => (prev[id] === val ? prev : { ...prev, [id]: val }));
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

  const handleReelClick = useCallback(async (id: string) => {
    if (!premiumAccess) { setPaywallOpen(true); return; }
    const ok = await requireFields(['photo', 'birthDate']);
    if (!ok) return;
    handleVideoAreaClick(id);
  }, [requireFields, premiumAccess, handleVideoAreaClick]);

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

  // Duplo-toque curte (sem descurtir) e mostra um coração animado, estilo reels.
  const handleDoubleTapLike = useCallback(async (id: string) => {
    if (!premiumAccess) { setPaywallOpen(true); return; }
    const ok = await requireFields(['photo', 'birthDate']);
    if (!ok) return;
    const reel = orderedReels.find((r) => r.id === id);
    if (!reel) return;
    setHeartBurstId(id);
    window.setTimeout(() => setHeartBurstId((cur) => (cur === id ? null : cur)), 800);
    if (!likedByPostId[reel.postId]) void handleToggleLike(reel);
  }, [premiumAccess, requireFields, orderedReels, likedByPostId, handleToggleLike]);

  // Distingue toque simples (play/pause) de duplo-toque (curtir) com janela curta.
  const handleVideoTap = useCallback((id: string) => {
    const timers = tapTimerRef.current;
    if (timers[id]) {
      window.clearTimeout(timers[id]);
      delete timers[id];
      void handleDoubleTapLike(id);
    } else {
      timers[id] = window.setTimeout(() => {
        delete timers[id];
        void handleReelClick(id);
      }, 260);
    }
  }, [handleDoubleTapLike, handleReelClick]);

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

  // Se já temos um reel pré-carregado (vindo de SearchVideos via ?reelId=),
  // renderiza-o imediatamente em vez de travar no spinner enquanto o feed
  // completo é paginado em segundo plano.
  if (isLoading && reelsWithMeta.length === 0) {
    return (
      <div className="flex h-[calc(100dvh-8.75rem)] items-center justify-center px-4">
        <MobileState
          loading
          title="Carregando Rap"
          description="Separando os vídeos do feed para você assistir em sequência."
        />
      </div>
    );
  }

  if (reelsWithMeta.length === 0) {
    if (loadError) {
      return (
        <div className="flex h-[calc(100dvh-8.75rem)] items-center justify-center px-4">
          <div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-sm">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Clapperboard className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-xl font-semibold">Não foi possível carregar os vídeos</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Pode ter sido uma instabilidade momentânea de conexão. Tente novamente.
            </p>
            <Button
              type="button"
              className="mt-5 w-full gap-2 bg-gradient-primary text-white hover:opacity-90"
              onClick={() => setReloadTick((t) => t + 1)}
            >
              Tentar novamente
            </Button>
          </div>
        </div>
      );
    }
    if (hasLockedVideos) {
      return (
        <div className="flex h-[calc(100dvh-8.75rem)] items-center justify-center px-4">
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
              onClick={() => setPaywallOpen(true)}
            >
              <Crown className="h-4 w-4" />
              Ver planos
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex h-[calc(100dvh-8.75rem)] items-center justify-center px-4">
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
      className="relative min-w-0 overflow-y-scroll"
      style={{
        height: reelViewportHeight,
        scrollSnapType: 'y mandatory',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        touchAction: 'pan-y',
        overscrollBehavior: 'contain',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      } as React.CSSProperties}
    >
      {/* Buscar Vídeos — floating button (mobile only) */}
      <button
        type="button"
        onClick={() => navigate('/videos')}
        className="fixed right-3 z-50 flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-black/70 md:hidden"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 3.75rem)' }}
      >
        <Search className="h-3.5 w-3.5" />
        Buscar vídeos
      </button>

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
          className="relative flex w-full min-w-0 items-center justify-center overflow-hidden bg-black"
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
            muted={muted}
            preload={
              idx === currentIndex || idx === currentIndex + 1
                ? 'auto'                                   // atual + próximo: buffer pronto
                : Math.abs(idx - currentIndex) <= 2
                  ? 'metadata'                             // vizinhos: só metadados
                  : 'none'                                 // distantes: nada (economiza memória/dados)
            }
            onEnded={() => { setBuffering(reel.id, false); handleVideoEnded(idx); }}
            onLoadStart={() => setBuffering(reel.id, true)}
            onSeeking={() => setBuffering(reel.id, true)}
            onWaiting={() => setBuffering(reel.id, true)}
            onStalled={() => setBuffering(reel.id, true)}
            onLoadedData={() => setBuffering(reel.id, false)}
            onPlaying={() => setBuffering(reel.id, false)}
            onCanPlay={() => setBuffering(reel.id, false)}
            onPause={() => setBuffering(reel.id, false)}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration > 0) setProgressById((p) => ({ ...p, [reel.id]: v.currentTime / v.duration }));
            }}
            onClick={() => handleVideoTap(reel.id)}
            controlsList="nodownload noremoteplayback"
            disablePictureInPicture
            onContextMenu={(e) => e.preventDefault()}
          />
          {/* Dark gradient overlay */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />

          {/* Premium gate overlay — leve, thumbnail visível, clique abre paywall */}
          {!premiumAccess && (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/50 cursor-pointer"
              onClick={() => setPaywallOpen(true)}
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm">
                <Crown className="h-8 w-8 text-yellow-400" />
              </div>
              <p className="text-sm font-semibold text-white drop-shadow">Assinar para assistir</p>
            </div>
          )}

          {/* Right side actions */}
          <div className="absolute bottom-36 right-2.5 flex flex-col items-center gap-3 sm:right-3 md:top-1/2 md:bottom-auto md:-translate-y-1/2 md:gap-4">
            {/* Maximize (mobile) */}
            <button
              type="button"
              onClick={() => setIsMobileMaximized((prev) => !prev)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition hover:bg-black/60 sm:h-11 sm:w-11 md:hidden"
              aria-label={isMobileMaximized ? 'Desfazer maximização' : 'Maximizar vídeo'}
            >
              {isMobileMaximized ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
            </button>

            {/* Mute */}
            <button
              type="button"
              onClick={() => toggleMute()}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition hover:bg-black/60 sm:h-11 sm:w-11"
            >
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>

            {/* Like */}
            <button type="button" onClick={() => void handleToggleLike(reel)} className="flex flex-col items-center gap-1 text-white">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-sm transition hover:bg-black/60 sm:h-11 sm:w-11 ${likedByPostId[reel.postId] ? 'bg-rose-500/75' : 'bg-black/45'}`}>
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
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm transition hover:bg-black/60 sm:h-11 sm:w-11">
                <MessageCircle className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium text-white/85">{reel.stats.commentsCount}</span>
            </button>
          </div>

          {/* Bottom info */}
          <div className="absolute bottom-0 left-0 right-0 p-3 pb-5 pr-16 text-white sm:p-4 sm:pb-6 sm:pr-20">
            {/* Author */}
            <div className="mb-3 flex min-w-0 items-center gap-2.5 sm:gap-3">
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
                className="h-10 shrink-0 rounded-xl bg-gradient-primary px-3 text-sm font-semibold text-white hover:opacity-90 sm:h-9 sm:px-4"
                onClick={() => navigate(getUserProfileHref(reel.author.id, user?.id, '/rap'))}
              >
                Ver perfil
              </Button>
            </div>

            {/* Caption */}
            {reel.content ? (
              <p className="line-clamp-2 text-sm leading-5 text-white/90 sm:leading-6">{reel.content}</p>
            ) : null}

            {/* Swipe hint — only on first video */}
            {idx === 0 && (
              <div className="mt-3 flex items-center gap-1.5 text-white/50">
                <ChevronDown className="h-3.5 w-3.5 animate-bounce" />
                <span className="text-xs">Deslize para o próximo vídeo</span>
              </div>
            )}
          </div>

          {/* Coração do duplo-toque */}
          {heartBurstId === reel.id && (
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
              <Heart
                className="h-28 w-28 text-rose-500 drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]"
                fill="currentColor"
                style={{ animation: 'heart-pop 0.8s ease-out forwards' }}
              />
            </div>
          )}

          {/* Buffering spinner — no vídeo ativo/atual enquanto carrega */}
          {premiumAccess && bufferingById[reel.id] && (playingId === reel.id || idx === currentIndex) && (
            <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3">
              <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-white/30 border-t-white" />
              <span className="text-xs font-medium text-white/70 drop-shadow">Carregando…</span>
            </div>
          )}

          {/* Paused overlay — escondido enquanto o reel atual está carregando */}
          {playingId !== reel.id && !(idx === currentIndex && bufferingById[reel.id]) && (
            <button
              type="button"
              onClick={() => void handleReelClick(reel.id)}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
                <Play className="h-8 w-8 translate-x-0.5 text-white" />
              </div>
            </button>
          )}

          {/* Progress bar */}
          <div className="absolute bottom-0 left-0 right-0 z-20 h-[3px] bg-white/20">
            <div
              className="h-full bg-white transition-none"
              style={{ width: `${((progressById[reel.id] ?? 0) * 100).toFixed(2)}%` }}
            />
          </div>
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
        <DialogContent className="max-h-[90dvh] w-[min(94vw,34rem)] overflow-hidden rounded-2xl border-zinc-800 bg-zinc-950 p-0 text-white">
          <DialogHeader className="border-b border-white/10 px-4 py-3 text-left sm:px-5 sm:py-4">
            <DialogTitle className="text-base font-semibold">
              {commentsOpenFor ? `Comentários de ${commentsOpenFor.author.name}` : 'Comentários'}
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[54dvh] overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
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

          <div className="border-t border-white/10 px-4 py-3 sm:px-5 sm:py-4">
            <div className="space-y-2">
              <div className="flex items-end gap-2 sm:gap-3">
                <Textarea
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  placeholder="Comentar vídeo..."
                  className="min-h-[72px] resize-none rounded-xl border-white/10 bg-white text-base text-zinc-900 placeholder:text-zinc-500 focus-visible:ring-rose-500 sm:min-h-[96px] sm:text-sm"
                />
                <Button
                  type="button"
                  onClick={() => void handleSubmitComment()}
                  disabled={isSendingComment || !commentDraft.trim()}
                  className="h-12 w-12 shrink-0 rounded-xl bg-gradient-primary px-0 text-white hover:opacity-90 sm:px-4"
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

      <ReferralPaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </div>
  );
}

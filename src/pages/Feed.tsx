import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Image, Video, Send, Heart, MessageCircle, MoreHorizontal, X, Lock, Crown, Trash2, Star, Clapperboard, Clapperboard as ReelsIcon, ChevronLeft, ChevronRight, Camera, Loader2, Radio, TimerReset, Bell, BellOff, MapPin, ArrowRight, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { authService, experienceService, feedService, interactionsService, profileService, radarService, storiesService } from '@/services/api';
import DailyMissions from '@/components/DailyMissions';
import StoriesBar from '@/components/StoriesBar';
import FeedGreeting from '@/components/FeedGreeting';
import TopDayBar from '@/components/TopDayBar';
import NearbyActivityStrip from '@/components/NearbyActivityStrip';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { useAuth } from '@/contexts/AuthContext';
import { hasPremiumAccess } from '@/utils/premium';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useFavorites } from '@/contexts/FavoritesContext';
import { SERVER_ORIGIN, resolveServerUrl } from '@/utils/serverUrl';
import VideoWithPreview from '@/components/VideoWithPreview';
import { PostMediaCarousel } from '@/components/PostMediaCarousel';
import MobileState from '@/components/MobileState';
import ReferralPaywallModal from '@/components/ReferralPaywallModal';
import EventPromoCard from '@/components/EventPromoCard';
import { getPushActivationState, enablePushNotifications } from '@/utils/pushNotifications';
import { getUserProfileHref } from '@/utils/userProfileNavigation';
import { buildProfileAgeLabel } from '@/utils/profileAgeLabel';
import SocialPulseCard from '@/components/SocialPulseCard';
import StreakBadge from '@/components/StreakBadge';
import { useDailyCheckin } from '@/hooks/useDailyCheckin';
import { useActivityTracker } from '@/contexts/ActivityTrackerContext';
import { PHOTO_REACTIONS, REACTION_EMOJI, EMPTY_REACTION_COUNTS, type PhotoReaction } from '@/lib/reactions';
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
type FeedContext = { reason: 'nearby' | 'affinity' | 'popular_local' | 'recent'; label: string };
type FeedInsights = {
  nearbyActiveCount: number;
  nearbyRadiusKm: number | null;
  interactionActiveCount: number;
  localPopularCount: number;
};
type RadarHighlight = {
  id: string;
  city: string;
  state: string;
  message: string;
  radius: number;
  createdAt: string;
  expiresAt: string;
  distanceKm?: number | null;
  isAnonymous?: boolean;
  sender: {
    id: string;
    name: string;
    avatar?: string | null;
    gender?: string | null;
    city?: string | null;
    state?: string | null;
  };
};
type FeedPost = {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; name: string; avatar?: string | null; gender?: string | null; city?: string | null; state?: string | null; birthDate?: string | null; partnerBirthDate?: string | null };
  mediaIds: string[];
  media: FeedMedia[];
  likesCount: number;
  commentsCount: number;
  likedByMe: boolean;
  reactions?: { type: string; count: number }[];
  feedContext?: FeedContext | null;
  distanceKm?: number | null;
};

type FeedExperience = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  media?: Array<{ id: string; url: string; mimeType: string }>;
  author: { id: string; name: string; avatar?: string | null; gender?: string | null; city?: string | null; state?: string | null; birthDate?: string | null; partnerBirthDate?: string | null };
  likesCount: number;
  commentsCount: number;
  likedByMe: boolean;
};

type Comment = {
  id: string;
  content: string;
  createdAt: string;
  parentCommentId?: string | null;
  replies?: Comment[];
  user: { id: string; name: string; avatar?: string | null; gender?: string | null; city?: string | null; state?: string | null };
};

// Experience-specific contextual reactions (reuse existing PhotoReaction IDs → no backend changes)
const EXP_REACTIONS: Array<{ id: PhotoReaction; emoji: string; label: string }> = [
  { id: 'devil',  emoji: '😈', label: 'Quero detalhes' },
  { id: 'heart',  emoji: '💜', label: 'Me identifico' },
  { id: 'fire',   emoji: '🔥', label: 'Ficamos com tesão' },
  { id: 'wow',    emoji: '👏', label: 'Corajosos!' },
];
const EXP_REACTION_EMOJI: Record<string, string> = Object.fromEntries(EXP_REACTIONS.map((r) => [r.id, r.emoji]));

// Writing templates for the experience composer
const EXP_TEMPLATES: Array<{ emoji: string; label: string; title: string; body: string }> = [
  {
    emoji: '🌙',
    label: 'Primeiro encontro',
    title: 'Nosso primeiro encontro no swing',
    body: 'Foi nossa primeira vez. A gente estava nervoso, mas quando chegamos ao local tudo mudou...\n\n',
  },
  {
    emoji: '📖',
    label: 'Conto erótico',
    title: '',
    body: 'Era uma noite diferente. Recebemos uma mensagem de um casal que nos chamou atenção e...\n\n',
  },
  {
    emoji: '⚡',
    label: 'Relato rápido',
    title: 'Rolou ontem!',
    body: 'Sem spoilers, mas foi incrível. Resumindo: encontramos um casal em [cidade], a vibe estava perfeita e...\n\nQuem quiser detalhes, chama no chat 😈',
  },
];

// Weekly theme — update this object each week
const WEEKLY_THEME = {
  emoji: '🔥',
  theme: 'Primeiro encontro fora da rotina',
  description: 'Conte como foi. Os 3 relatos mais curtidos ganham destaque no feed por 48h.',
  deadline: 'Até domingo',
};

const PHOTO_REACTION_LONG_PRESS_MS = 400;
const VIDEO_MAX_BYTES = 500 * 1024 * 1024;
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

function formatRemainingRadarTime(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) return 'expirou';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `expira em ${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `expira em ${hours} h`;
  const days = Math.floor(hours / 24);
  return `expira em ${days} d`;
}

const FEED_SESSION_AUTHOR_COUNTS_KEY = 'nosigilo:feed-session-author-counts';
const FEED_SESSION_SEEN_IDS_KEY = 'nosigilo:feed-session-seen-ids';
const FEED_SEEN_IDS_LS_KEY = 'nosigilo:feed-seen-ids-v2';
const FEED_SEEN_IDS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RADAR_HIGHLIGHTS_CACHE_TTL_MS = 45_000;
const NEARBY_OPTIONS = [10, 25, 50, 100, 200, 300] as const;
type NearbyOption = typeof NEARBY_OPTIONS[number];

/** Persist seen post IDs across sessions (localStorage, 24h TTL) */
function readFeedSeenIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  const result = new Set<string>();
  // 1. Read from localStorage (persists across tab closes, 24h TTL)
  try {
    const raw = window.localStorage.getItem(FEED_SEEN_IDS_LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { ids: string[]; savedAt: number };
      const age = Date.now() - (parsed.savedAt || 0);
      if (age < FEED_SEEN_IDS_TTL_MS && Array.isArray(parsed.ids)) {
        parsed.ids.forEach((id) => typeof id === 'string' && result.add(id));
      } else {
        // Expired — clear it
        window.localStorage.removeItem(FEED_SEEN_IDS_LS_KEY);
      }
    }
  } catch {}
  // 2. Also merge sessionStorage (same-session IDs not yet persisted)
  try {
    const raw = window.sessionStorage.getItem(FEED_SESSION_SEEN_IDS_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as unknown;
      if (Array.isArray(arr)) arr.forEach((x) => typeof x === 'string' && result.add(x));
    }
  } catch {}
  return result;
}

function saveFeedSeenIds(ids: Set<string>) {
  try {
    // Keep only the 200 most-recent IDs to avoid unbounded growth
    const arr = Array.from(ids).slice(-200);
    // Save to localStorage with timestamp (survives tab close)
    window.localStorage.setItem(FEED_SEEN_IDS_LS_KEY, JSON.stringify({ ids: arr, savedAt: Date.now() }));
    // Also keep sessionStorage in sync
    window.sessionStorage.setItem(FEED_SESSION_SEEN_IDS_KEY, JSON.stringify(arr));
  } catch {}
}

function readFeedSessionAuthorCounts() {
  if (typeof window === 'undefined') return {} as Record<string, number>;
  try {
    const raw = window.sessionStorage.getItem(FEED_SESSION_AUTHOR_COUNTS_KEY);
    if (!raw) return {} as Record<string, number>;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed || {})) {
      const count = Number(value || 0);
      if (key && Number.isFinite(count) && count > 0) next[key] = count;
    }
    return next;
  } catch {
    return {} as Record<string, number>;
  }
}

export default function Feed() {
  const { user, updateUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const streakState = useDailyCheckin(!!user?.id);
  const { registerActivity } = useActivityTracker();
  const { favorites, isFavorite, toggleFavorite } = useFavorites();
  const premiumAccess = hasPremiumAccess(user);
  const [postContent, setPostContent] = useState('');
  const [experienceTitle, setExperienceTitle] = useState('');
  const [experienceDescription, setExperienceDescription] = useState('');
  const [expTemplatesOpen, setExpTemplatesOpen] = useState(false);
  const [reelsOnly, setReelsOnly] = useState(false);
  const [allPosts, setAllPosts] = useState<FeedPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null); // 0–100 durante upload; 100 = processando no servidor
  const publishGuardRef = useRef(false); // trava síncrona contra toque duplo (evita post/foto duplicada)
  const [storyPromptMediaId, setStoryPromptMediaId] = useState<string | null>(null);
  const [isPublishingExperience, setIsPublishingExperience] = useState(false);
  const publishExperienceGuardRef = useRef(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [activePicker, setActivePicker] = useState<'image' | 'video' | null>(null);
  const [attachments, setAttachments] = useState<Array<{ id: string; file: File; url: string }>>([]);
  const [fileAccept, setFileAccept] = useState<string>('image/*,video/*');
  const [feedInsights, setFeedInsights] = useState<FeedInsights | null>(null);
  const [radarHighlights, setRadarHighlights] = useState<RadarHighlight[]>([]);
  const [feedSessionBaseline, setFeedSessionBaseline] = useState<Record<string, number>>(() => readFeedSessionAuthorCounts());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentsRef = useRef<Array<{ id: string; file: File; url: string }>>([]);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [aspectByKey, setAspectByKey] = useState<Record<string, 'portrait' | 'landscape' | 'square'>>({});
  const pageRef = useRef(1);
  const hasMoreRef = useRef(true);
  const isLoadingMoreRef = useRef(false);
  const trackedFeedPostIdsRef = useRef<Set<string>>(readFeedSeenIds());
  const feedSessionAuthorCountsRef = useRef<Record<string, number>>(readFeedSessionAuthorCounts());
  const radarHighlightsCacheRef = useRef<{ fetchedAt: number; items: RadarHighlight[] } | null>(null);

  const [openCommentsPostId, setOpenCommentsPostId] = useState<string | null>(null);
  const [commentsByPostId, setCommentsByPostId] = useState<Record<string, Comment[]>>({});
  const [commentDraftByPostId, setCommentDraftByPostId] = useState<Record<string, string>>({});
  const [editingCommentByPostId, setEditingCommentByPostId] = useState<Record<string, string | null>>({});
  const [editCommentDraftById, setEditCommentDraftById] = useState<Record<string, string>>({});
  const [replyingToByPostId, setReplyingToByPostId] = useState<Record<string, Comment | null>>({});
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(true);
  const [pushLoading, setPushLoading] = useState(false);
  const [notifBannerDismissed, setNotifBannerDismissed] = useState(() => {
    const today = new Date().toISOString().slice(0, 10);
    return localStorage.getItem('nosigilo:notif-banner-date') === today;
  });
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [photoReactionCounts, setPhotoReactionCounts] = useState<Record<string, Record<PhotoReaction, number>>>({});
  const [myPhotoReactions, setMyPhotoReactions] = useState<Record<string, PhotoReaction | null>>({});
  const [isLoadingPhotoReactions, setIsLoadingPhotoReactions] = useState<Record<string, boolean>>({});
  const [openReactionPickerPostId, setOpenReactionPickerPostId] = useState<string | null>(null);
  const [reactionsModalPostId, setReactionsModalPostId] = useState<string | null>(null);
  const [reactionsModalTab, setReactionsModalTab] = useState<string>('all');
  const [reactionsModalData, setReactionsModalData] = useState<Array<{ id: string; reaction: string | null; user: { id: string; name: string; avatar?: string | null; gender?: string | null; city?: string | null; state?: string | null } }>>([]);
  const [isLoadingReactionsModal, setIsLoadingReactionsModal] = useState(false);
  const [hasNewPosts, setHasNewPosts] = useState(false);
  const currentTopPostIdRef = useRef<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredPostIdRef = useRef<string | null>(null);
  // Hover-intent (desktop): abre/fecha o seletor de reações ao passar o mouse.
  // Ignorado em telas de toque (lá vale o long-press).
  const reactionHoverOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactionHoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstAccessPostMode = new URLSearchParams(location.search).get('firstAccess') === 'post';
  const profilePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [showProfilePhotoGate, setShowProfilePhotoGate] = useState(false);
  const [isUploadingProfilePhoto, setIsUploadingProfilePhoto] = useState(false);
  const [showFirstAccessPostHint, setShowFirstAccessPostHint] = useState(false);
  const [checkedFirstAccessPostHint, setCheckedFirstAccessPostHint] = useState(false);
  const [allExperiences, setAllExperiences] = useState<FeedExperience[]>([]);
  const [isLoadingExperiences, setIsLoadingExperiences] = useState(false);
  const [expAttachments, setExpAttachments] = useState<Array<{ id: string; file: File; url: string; isVideo?: boolean }>>([]);
  const [expPhotoIndex, setExpPhotoIndex] = useState<Record<string, number>>({});
  // Contos expandidos (mostra texto completo); por padrão exibimos só uma prévia
  const [expandedExp, setExpandedExp] = useState<Record<string, boolean>>({});
  const expFileInputRef = useRef<HTMLInputElement | null>(null);
  const expVideoInputRef = useRef<HTMLInputElement | null>(null);
  const expFormRef = useRef<HTMLDivElement | null>(null);
  const [openCommentsExpId, setOpenCommentsExpId] = useState<string | null>(null);
  const [commentsByExpId, setCommentsByExpId] = useState<Record<string, Comment[]>>({});
  const [commentDraftByExpId, setCommentDraftByExpId] = useState<Record<string, string>>({});
  const [editingCommentByExpId, setEditingCommentByExpId] = useState<Record<string, string | null>>({});
  const [expReactionCounts, setExpReactionCounts] = useState<Record<string, Record<PhotoReaction, number>>>({});
  const [myExpReactions, setMyExpReactions] = useState<Record<string, PhotoReaction | null>>({});
  const [isLoadingExpReactions, setIsLoadingExpReactions] = useState<Record<string, boolean>>({});
  const [openReactionPickerExpId, setOpenReactionPickerExpId] = useState<string | null>(null);
  const [reactionsModalExpId, setReactionsModalExpId] = useState<string | null>(null);
  const [reactionsModalExpData, setReactionsModalExpData] = useState<Array<{ id: string; reaction: string | null; user: { id: string; name: string; avatar?: string | null; gender?: string | null; city?: string | null; state?: string | null } }>>([]);
  const [reactionsModalExpTab, setReactionsModalExpTab] = useState<string>('all');
  const [isLoadingExpReactionsModal, setIsLoadingExpReactionsModal] = useState(false);
  const longPressExpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredExpIdRef = useRef<string | null>(null);

  const [feedFilter, setFeedFilter] = useState<'all' | 'friends' | 'favorites' | 'experiences'>(() => {
    const v = localStorage.getItem('nosigilo_feed_filter');
    return v === 'favorites' || v === 'experiences' || v === 'friends' ? v : 'all';
  });
  useEffect(() => {
    localStorage.setItem('nosigilo_feed_filter', feedFilter);
  }, [feedFilter]);

  // Proximity filter: null = todos, number = raio em km; cityOnly = somente minha cidade
  const [nearbyRadius, setNearbyRadius] = useState<NearbyOption | null>(null);
  const [cityOnly, setCityOnly] = useState(false);

  const handleNearbyRadius = (km: NearbyOption) => {
    const next = nearbyRadius === km ? null : km;
    setNearbyRadius(next);
    if (next !== null) setCityOnly(false);
    void triggerNearbyReload(next, false);
  };

  const handleCityOnly = () => {
    const next = !cityOnly;
    setCityOnly(next);
    if (next) setNearbyRadius(null);
    void triggerNearbyReload(null, next);
  };

  const triggerNearbyReload = async (km: NearbyOption | null, co = cityOnly) => {
    setIsLoading(true);
    try {
      const params: Parameters<typeof feedService.getFeed>[0] = { page: 1, limit: 20 };
      if (km !== null) params.maxDistanceKm = km;
      if (co) params.cityOnly = true;
      const seenIds = Array.from(trackedFeedPostIdsRef.current).slice(-60).join(',');
      if (seenIds) params.seenIds = seenIds;
      const feed = await feedService.getFeed(params);
      setFeedSessionBaseline({ ...feedSessionAuthorCountsRef.current });
      setAllPosts(Array.isArray(feed?.posts) ? feed.posts : []);
      setFeedInsights(feed?.insights ?? null);
      setPage(1);
      setHasMore(!!feed?.hasMore);
    } catch {
      toast({ title: 'Erro ao filtrar por proximidade', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    getPushActivationState().then((s) => {
      setPushEnabled(s.enabled);
      setPushSupported(s.supported);
      // Se ambas as opções já estiverem ativas, marca o dia como visto automaticamente
      // Telegram hidden — banner auto-dismisses when push is enabled
      if (s.enabled) {
        localStorage.setItem('nosigilo:notif-banner-date', new Date().toISOString().slice(0, 10));
        setNotifBannerDismissed(true);
      }
    }).catch(() => setPushSupported(false));
  }, [user]);

  const visiblePosts = useMemo(() => {
    // 'friends' é filtrado no backend (amigos + curtidos), então usa os posts como vieram
    if (feedFilter === 'favorites') {
      const favIds = new Set(favorites.map((f) => String(f.id)));
      return allPosts.filter((p) => favIds.has(String(p.author.id)));
    }
    return allPosts;
  }, [allPosts, feedFilter, favorites]);

  const feedInsightsSummary = useMemo(() => {
    if (!feedInsights) return null;
    if (feedInsights.nearbyActiveCount > 0) {
      const radiusText = feedInsights.nearbyRadiusKm ? `${feedInsights.nearbyRadiusKm} km` : 'perto de você';
      return `${feedInsights.nearbyActiveCount} ${feedInsights.nearbyActiveCount === 1 ? 'pessoa postou' : 'pessoas postaram'} hoje a até ${radiusText}.`;
    }
    if (feedInsights.interactionActiveCount > 0) {
      return `${feedInsights.interactionActiveCount} ${feedInsights.interactionActiveCount === 1 ? 'perfil com quem você já interagiu está ativo' : 'perfis com quem você já interagiu estão ativos'} hoje.`;
    }
    if (feedInsights.localPopularCount > 0) {
      return `${feedInsights.localPopularCount} ${feedInsights.localPopularCount === 1 ? 'perfil está em alta na sua região' : 'perfis estão em alta na sua região'} hoje.`;
    }
    return 'O feed está priorizando pessoas próximas, conexões quentes e novidades recentes.';
  }, [feedInsights]);

  const radarHighlightsSummary = useMemo(() => {
    if (radarHighlights.length === 0) return null;
    const nearest = radarHighlights
      .map((item) => (typeof item.distanceKm === 'number' ? item.distanceKm : null))
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b)[0];
    if (typeof nearest === 'number') {
      return `${radarHighlights.length} ${radarHighlights.length === 1 ? 'radar ativo' : 'radares ativos'} perto de você agora. O mais próximo está a ${nearest} km.`;
    }
    return `${radarHighlights.length} ${radarHighlights.length === 1 ? 'radar ativo' : 'radares ativos'} na sua região agora.`;
  }, [radarHighlights]);

  const feedDisplayItems = useMemo(() => {
    if (feedFilter !== 'all') {
      return visiblePosts.map((post) => ({ type: 'post' as const, id: `post-${post.id}`, post }));
    }

    const primary: FeedPost[] = [];
    const exploration: FeedPost[] = [];
    const remaining: FeedPost[] = [];
    const authorOccurrences = new Map<string, number>();

    for (const post of visiblePosts) {
      const authorId = String(post.author.id || '');
      const occurrence = authorOccurrences.get(authorId) ?? 0;
      const seenBefore = feedSessionBaseline[authorId] ?? 0;
      authorOccurrences.set(authorId, occurrence + 1);

      if (primary.length < 6 && occurrence === 0) {
        primary.push(post);
        continue;
      }

      if (exploration.length < 4 && occurrence === 0 && seenBefore === 0) {
        exploration.push(post);
        continue;
      }

      remaining.push(post);
    }

    const items: Array<
      | { type: 'post'; id: string; post: FeedPost }
      | { type: 'section'; id: string; title: string; description: string }
    > = primary.map((post) => ({ type: 'post', id: `post-${post.id}`, post }));

    if (exploration.length > 0) {
      items.push({
        type: 'section',
        id: 'feed-section-exploration',
        title: '✨ Novidades na sua região',
        description: 'Perfis que você ainda não viu — pode ser alguém especial por perto.',
      });
      items.push(...exploration.map((post) => ({ type: 'post' as const, id: `post-${post.id}`, post })));
    }

    if (remaining.length > 0) {
      items.push({
        type: 'section',
        id: 'feed-section-continue',
        title: '🔥 Em alta agora',
        description: 'Mais publicações de pessoas ativas — atualize o feed para ver as mais recentes.',
      });
      items.push(...remaining.map((post) => ({ type: 'post' as const, id: `post-${post.id}`, post })));
    }

    return items;
  }, [feedFilter, feedSessionBaseline, visiblePosts]);

  // No feed não exibimos a localização (cidade/estado) do autor — apenas o gênero.
  const getIdentityLine = (profile?: { gender?: string | null; city?: string | null; state?: string | null } | null) =>
    String(profile?.gender || '').trim();

  // Gender badge: label + Tailwind color classes per profile type
  const getProfileTypeBadge = (gender?: string | null): { label: string; cls: string; emoji: string } | null => {
    if (!gender) return null;
    const g = gender.trim();
    const l = g.toLowerCase();
    if (l.startsWith('casal (ele/ela') || l === 'casal hetero') return { label: 'Casal Hetero', cls: 'bg-purple-500/12 text-purple-600 border-purple-400/30', emoji: '👫' };
    if (l.startsWith('casal (ele/ele') || l === 'casal masculino') return { label: 'Casal Masc.', cls: 'bg-blue-500/12 text-blue-600 border-blue-400/30', emoji: '👬' };
    if (l.startsWith('casal (ela/ela') || l === 'casal feminino') return { label: 'Casal Fem.', cls: 'bg-pink-500/12 text-pink-600 border-pink-400/30', emoji: '👭' };
    if (l.startsWith('cas') || l === 'couple') return { label: 'Casal', cls: 'bg-violet-500/12 text-violet-600 border-violet-400/30', emoji: '👫' };
    if (l.startsWith('mul') || l === 'woman' || l === 'female') return { label: 'Mulher', cls: 'bg-rose-500/12 text-rose-600 border-rose-400/30', emoji: '👩' };
    if (l.startsWith('hom') || l === 'man' || l === 'male') return { label: 'Homem', cls: 'bg-sky-500/12 text-sky-700 border-sky-400/30', emoji: '👨' };
    if (l.startsWith('transex') || l === 'trans') return { label: 'Trans', cls: 'bg-teal-500/12 text-teal-600 border-teal-400/30', emoji: '🏳️‍⚧️' };
    if (l.startsWith('cross') || l === 'cd') return { label: 'CD', cls: 'bg-amber-500/12 text-amber-700 border-amber-400/30', emoji: '✨' };
    if (l.startsWith('travest')) return { label: 'Travesti', cls: 'bg-fuchsia-500/12 text-fuchsia-600 border-fuchsia-400/30', emoji: '🌈' };
    return null;
  };

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

  useEffect(() => {
    if (allPosts.length === 0) return;
    const freshPosts = allPosts.filter((post) => !trackedFeedPostIdsRef.current.has(String(post.id)));
    if (freshPosts.length === 0) return;
    const nextCounts = { ...feedSessionAuthorCountsRef.current };
    for (const post of freshPosts) {
      trackedFeedPostIdsRef.current.add(String(post.id));
      const authorId = String(post.author.id || '');
      if (!authorId) continue;
      nextCounts[authorId] = (nextCounts[authorId] ?? 0) + 1;
    }
    feedSessionAuthorCountsRef.current = nextCounts;
    try {
      window.sessionStorage.setItem(FEED_SESSION_AUTHOR_COUNTS_KEY, JSON.stringify(nextCounts));
    } catch {}
    saveFeedSeenIds(trackedFeedPostIdsRef.current);
  }, [allPosts]);

  const reload = async () => {
    setIsLoading(true);
    try {
      const shouldRefreshRadarHighlights =
        !radarHighlightsCacheRef.current || Date.now() - radarHighlightsCacheRef.current.fetchedAt > RADAR_HIGHLIGHTS_CACHE_TTL_MS;
      const feedParams: Parameters<typeof feedService.getFeed>[0] = { page: 1, limit: 20 };
      if (nearbyRadius !== null) feedParams.maxDistanceKm = nearbyRadius;
      if (cityOnly) feedParams.cityOnly = true;
      if (feedFilter === 'friends') feedParams.filter = 'friends';
      // Limit to 40 most-recent IDs to stay well under URL length limits (~1500 chars)
      const seenIds = Array.from(trackedFeedPostIdsRef.current).slice(-60).join(',');
      if (seenIds) feedParams.seenIds = seenIds;
      const [feed, radarData] = await Promise.all([
        feedService.getFeed(feedParams),
        shouldRefreshRadarHighlights
          ? radarService.getHighlights().catch(() => ({ highlights: [] }))
          : Promise.resolve({ highlights: radarHighlightsCacheRef.current?.items ?? [] }),
      ]);
      const nextRadarHighlights = Array.isArray(radarData?.highlights) ? radarData.highlights : [];
      radarHighlightsCacheRef.current = {
        fetchedAt: Date.now(),
        items: nextRadarHighlights,
      };
      setFeedSessionBaseline({ ...feedSessionAuthorCountsRef.current });
      setAllPosts(Array.isArray(feed?.posts) ? feed.posts : []);
      setFeedInsights(feed?.insights ?? null);
      setRadarHighlights(nextRadarHighlights);
      setPage(1);
      setHasMore(!!feed?.hasMore);
    } catch {
      toast({ title: 'Erro ao carregar feed', description: 'Tente novamente.', variant: 'destructive' });
      setAllPosts([]);
      setFeedInsights(null);
      setRadarHighlights([]);
      setPage(1);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  };

  const reloadExperiences = async () => {
    setIsLoadingExperiences(true);
    try {
      const feed = await experienceService.getFeed({ page: 1, limit: 50 });
      setAllExperiences(Array.isArray(feed?.experiences) ? feed.experiences : []);
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.message || err?.message || '';
      console.error('[Feed] experiences error', status, msg, err);
      // Only show toast for unexpected errors (not 404 meaning feature not enabled)
      if (status !== 404) {
        toast({ title: 'Erro ao carregar experiências', description: 'Tente novamente.', variant: 'destructive' });
      }
      setAllExperiences([]);
    } finally {
      setIsLoadingExperiences(false);
    }
  };

  useEffect(() => {
    void reload();
    void reloadExperiences();
  }, []);

  // Recarrega o feed do servidor ao entrar/sair do modo "Amigos" (filtro é server-side).
  const prevServerFilterRef = useRef<'friends' | 'none'>(feedFilter === 'friends' ? 'friends' : 'none');
  useEffect(() => {
    if (feedFilter === 'experiences') return; // experiências usam outra lista
    const sf = feedFilter === 'friends' ? 'friends' : 'none';
    if (sf !== prevServerFilterRef.current) {
      prevServerFilterRef.current = sf;
      void reload();
    }
  }, [feedFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open experience form when coming from WeekendAdventureModal (works even if already on /feed)
  useEffect(() => {
    if ((location.state as any)?.openExperienceForm) {
      setFeedFilter('experiences');
      // Clear state so back-navigation doesn't re-trigger
      window.history.replaceState({}, '');
      window.setTimeout(() => {
        expFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 400);
    }
  }, [location.state]);

  useEffect(() => {
    if (!firstAccessPostMode) return;
    window.setTimeout(() => {
      composerRef.current?.focus();
      composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
  }, [firstAccessPostMode]);

  useEffect(() => {
    if (!user?.id) {
      setShowFirstAccessPostHint(false);
      setCheckedFirstAccessPostHint(true);
      return;
    }
    if (!firstAccessPostMode) {
      setShowFirstAccessPostHint(false);
      setCheckedFirstAccessPostHint(true);
      return;
    }
    const key = `nosigilo:first-access-flow:${user.id}`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        setShowFirstAccessPostHint(false);
      } else {
        const flow = JSON.parse(raw) as { needsPhoto?: boolean; needsPost?: boolean };
        setShowFirstAccessPostHint(!Boolean(flow?.needsPhoto) && Boolean(flow?.needsPost));
      }
    } catch {
      setShowFirstAccessPostHint(false);
    } finally {
      setCheckedFirstAccessPostHint(true);
    }
  }, [firstAccessPostMode, user?.id, allPosts.length]);

  useEffect(() => {
    if (!user?.id) {
      setShowProfilePhotoGate(false);
      return;
    }
    if (user.avatar) {
      setShowProfilePhotoGate(false);
      return;
    }
    // Show once per session — after the user dismisses, don't reopen until browser restarts
    const sessionKey = `nosigilo:photo-prompt-dismissed:${user.id}`;
    if (sessionStorage.getItem(sessionKey)) {
      setShowProfilePhotoGate(false);
      return;
    }
    setShowProfilePhotoGate(true);
  }, [user?.avatar, user?.id]);

  useEffect(() => {
    if (!firstAccessPostMode) return;
    if (!checkedFirstAccessPostHint) return;
    if (showFirstAccessPostHint) return;
    navigate('/feed', { replace: true });
  }, [checkedFirstAccessPostHint, firstAccessPostMode, navigate, showFirstAccessPostHint]);

  const handleProfilePhotoGateChange = async (files: FileList | null) => {
    const selected = files?.[0];
    if (!selected) return;
    if (!selected.type.startsWith('image/')) {
      toast({ title: 'Arquivo inválido', description: 'Selecione uma imagem para a foto de perfil.', variant: 'destructive' });
      return;
    }

    try {
      setIsUploadingProfilePhoto(true);
      const uploaded = await profileService.uploadMedia(selected, { isPrivate: false, source: 'profile' });
      const mediaId = uploaded?.id ? String(uploaded.id) : '';
      const url = uploaded?.url ? String(uploaded.url) : '';
      if (!mediaId) {
        throw new Error('Não foi possível concluir o envio da foto.');
      }
      try {
        await feedService.createPost({ content: '', mediaIds: [mediaId] });
      } catch {}
      await profileService.setMainPhoto(mediaId);
      if (url) updateUser({ avatar: resolveMediaUrl(url) });
      if (user?.id) {
        const key = `nosigilo:first-access-flow:${user.id}`;
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const flow = JSON.parse(raw) as { needsPhoto?: boolean; needsPost?: boolean; startedAt?: string };
            localStorage.setItem(
              key,
              JSON.stringify({
                ...flow,
                needsPhoto: false,
              })
            );
            window.dispatchEvent(new CustomEvent('nosigilo:first-access-flow-changed'));
          } catch {
            localStorage.removeItem(key);
          }
        }
      }
      setShowProfilePhotoGate(false);
      toast({ title: 'Foto de perfil atualizada', description: 'Agora seu perfil já pode seguir normalmente no feed.' });
    } catch (error) {
      toast({
        title: 'Falha ao enviar foto',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingProfilePhoto(false);
      if (profilePhotoInputRef.current) profilePhotoInputRef.current.value = '';
    }
  };

  const loadMore = async () => {
    if (isLoading || isLoadingMoreRef.current || !hasMoreRef.current) return;
    const nextPage = pageRef.current + 1;
    setIsLoadingMore(true);
    try {
      // Pass currently-seen post IDs so backend can exclude them (cross-page deduplication)
      const seenIds = Array.from(trackedFeedPostIdsRef.current).slice(-60).join(',');
      const moreParams: Parameters<typeof feedService.getFeed>[0] = { page: nextPage, limit: 20, seenIds: seenIds || undefined };
      if (nearbyRadius !== null) moreParams.maxDistanceKm = nearbyRadius;
      if (cityOnly) moreParams.cityOnly = true;
      if (feedFilter === 'friends') moreParams.filter = 'friends';
      const feed = await feedService.getFeed(moreParams);
      setFeedSessionBaseline({ ...feedSessionAuthorCountsRef.current });
      const nextPosts = Array.isArray(feed?.posts) ? (feed.posts as FeedPost[]) : [];
      if (nextPage === 1) setFeedInsights(feed?.insights ?? null);
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
    const fallbackUser = sp.get('u');
    return {
      postId: postId ? String(postId) : null,
      openComments: openComments === '1' || openComments === 'true',
      fallbackUser: fallbackUser ? String(fallbackUser) : null,
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
        break; // post não existe no feed e não há mais páginas
      }
      // Não encontrou o post → fallback para o perfil do autor (se informado)
      if (!cancelled && focusParams.fallbackUser) {
        navigate(getUserProfileHref(focusParams.fallbackUser, user?.id, '/feed'));
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [focusParams.postId, focusParams.openComments, focusParams.fallbackUser, isLoading, allPosts]);

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

  const handlePasteOnComposer = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter((item) => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;
    e.preventDefault();
    const files = imageItems
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null);
    if (files.length === 0) return;
    const list = files.map((f) => {
      const ext = f.type.split('/')[1] || 'png';
      const namedFile = new File([f], `paste-${Date.now()}.${ext}`, { type: f.type });
      return {
        id: `paste-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        file: namedFile,
        url: URL.createObjectURL(namedFile),
      };
    });
    setAttachments((prev) => [...prev, ...list]);
    toast({ title: 'Imagem colada', description: `${list.length} imagem${list.length > 1 ? 's' : ''} adicionada${list.length > 1 ? 's' : ''} ao post.` });
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const acceptedFiles = Array.from(files).filter((f) => {
      if (f.type.startsWith('video/') && f.size > VIDEO_MAX_BYTES) {
        toast({
          title: 'Vídeo muito grande',
          description: 'O tamanho máximo permitido é 500 MB por vídeo.',
          variant: 'destructive',
        });
        return false;
      }
      return true;
    });
    if (acceptedFiles.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    const list = acceptedFiles.map((f) => ({
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
      const next = prev.filter((_, i) => i !== idx);
      // Reset reels toggle if no more videos
      if (!next.some((a) => a.file.type.startsWith('video/'))) {
        setReelsOnly(false);
      }
      return next;
    });
  };

  const handlePublish = async () => {
    const content = postContent.trim();
    if (!content && attachments.length === 0) return;
    if (publishGuardRef.current) return; // bloqueia 2ª execução por toque duplo
    publishGuardRef.current = true;
    setIsPublishing(true);
    setUploadProgress(attachments.length > 0 ? 0 : null);
    try {
      let completedFirstPostStep = false;
      const mediaIds: string[] = [];
      const totalFiles = attachments.length;
      for (let i = 0; i < attachments.length; i++) {
        const a = attachments[i];
        if (a.file.type.startsWith('video/') && !premiumAccess) {
          throw new Error('Vídeos são Premium após o teste grátis.');
        }
        const uploaded = await profileService.uploadMedia(a.file, undefined, (p) => {
          // Progresso combinado entre os anexos (cada arquivo é 1/total da barra)
          setUploadProgress(Math.round(((i + p / 100) / totalFiles) * 100));
        });
        if (uploaded?.id) mediaIds.push(String(uploaded.id));
      }
      // Upload concluído — barra cheia enquanto o servidor finaliza o post.
      if (totalFiles > 0) setUploadProgress(100);
      const hasVideo = attachments.some((a) => a.file.type.startsWith('video/'));
      const wasReelsOnly = hasVideo && reelsOnly;
      const created = await feedService.createPost({ content, mediaIds: mediaIds.length ? mediaIds : undefined, reelsOnly: wasReelsOnly });
      const newPostId = created?.id ? String(created.id) : null;
      registerActivity('post');
      setPostContent('');
      setReelsOnly(false);
      for (const a of attachmentsRef.current) URL.revokeObjectURL(a.url);
      setAttachments([]);
      setActivePicker(null);
      if (user?.id) {
        const key = `nosigilo:first-access-flow:${user.id}`;
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const flow = JSON.parse(raw) as { needsPhoto?: boolean; needsPost?: boolean };
            completedFirstPostStep = Boolean(flow?.needsPost);
            localStorage.setItem(
              key,
              JSON.stringify({
                ...flow,
                needsPhoto: user?.avatar ? false : flow?.needsPhoto,
                needsPost: false,
              })
            );
            window.dispatchEvent(new CustomEvent('nosigilo:first-access-flow-changed'));
          } catch {
            completedFirstPostStep = false;
            localStorage.removeItem(key);
          }
        }
      }
      await reload();
      // Pergunta se quer postar nos stories (só para imagens — vídeos podem exceder 30s)
      const firstImageId = attachments.find((a) => a.file.type.startsWith('image/'))
        ? mediaIds[attachments.findIndex((a) => a.file.type.startsWith('image/'))]
        : null;
      if (firstImageId && !completedFirstPostStep) {
        setStoryPromptMediaId(firstImageId);
      }
      if (completedFirstPostStep) {
        toast({ title: 'Primeira publicação concluída', description: 'Agora seu perfil está completo para começar as conexões.' });
      } else if (wasReelsOnly) {
        toast({
          title: 'Vídeo publicado',
          description: 'Seu vídeo aparecerá somente em Vídeos Curtos, não no feed.',
          action: (
            <ToastAction altText="Ver publicação" onClick={() => {
              if (newPostId) {
                const el = document.getElementById(`post-${newPostId}`);
                if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
              }
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}>
              Ver
            </ToastAction>
          ),
        });
      } else {
        toast({
          title: 'Publicado',
          description: 'Seu post foi publicado.',
          action: (
            <ToastAction altText="Ver publicação" onClick={() => {
              if (newPostId) {
                const el = document.getElementById(`post-${newPostId}`);
                if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
              }
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}>
              Ver
            </ToastAction>
          ),
        });
      }
      if (firstAccessPostMode) {
        navigate('/feed', { replace: true });
      }
    } catch (e: any) {
      const blocked = e?.response?.status === 403 && e?.response?.data?.error === 'blocked_content';
      toast({
        title: blocked ? 'Imagem bloqueada' : 'Erro ao publicar',
        description: e?.response?.data?.message || e?.message || 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsPublishing(false);
      setUploadProgress(null);
      publishGuardRef.current = false;
    }
  };

  const handlePublishExperience = async () => {
    const title = experienceTitle.trim();
    const description = experienceDescription.trim();
    if (!description) return;
    if (description.length < 20) {
      toast({ title: 'Descrição muito curta', description: 'A descrição precisa ter pelo menos 20 caracteres.', variant: 'destructive' });
      return;
    }
    if (publishExperienceGuardRef.current) return;
    publishExperienceGuardRef.current = true;
    setIsPublishingExperience(true);
    try {
      const mediaIds: string[] = [];
      for (const a of expAttachments) {
        const uploaded = await profileService.uploadMedia(a.file);
        if (uploaded?.id) mediaIds.push(String(uploaded.id));
      }
      await experienceService.create({ title, description, ...(mediaIds.length ? { mediaIds } : {}) });
      setExperienceTitle('');
      setExperienceDescription('');
      setExpAttachments([]);
      await reloadExperiences();
      toast({
        title: 'Experiência publicada',
        description: 'Seu conto já está visível na aba Meus Contos Eróticos.',
        action: (
          <ToastAction altText="Ver experiência" onClick={() => {
            const el = document.querySelector('[data-experience-card]');
            el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}>
            Ver
          </ToastAction>
        ),
      });
    } catch (e: any) {
      toast({ title: 'Erro ao publicar experiência', description: e?.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsPublishingExperience(false);
      publishExperienceGuardRef.current = false;
    }
  };

  const handleToggleExperienceLike = async (experience: FeedExperience) => {
    const nextLiked = !experience.likedByMe;
    setAllExperiences((prev) =>
      prev.map((item) =>
        item.id === experience.id
          ? { ...item, likedByMe: nextLiked, likesCount: Math.max(0, item.likesCount + (nextLiked ? 1 : -1)) }
          : item
      )
    );
    try {
      if (nextLiked) {
        await interactionsService.like('experience', experience.id);
      } else {
        await interactionsService.unlike('experience', experience.id);
      }
    } catch {
      setAllExperiences((prev) => prev.map((item) => (item.id === experience.id ? experience : item)));
      toast({ title: 'Erro ao curtir experiência', description: 'Tente novamente.', variant: 'destructive' });
    }
  };

  const loadExpReactions = async (expId: string) => {
    setIsLoadingExpReactions((prev) => ({ ...prev, [expId]: true }));
    try {
      const likes = await interactionsService.getLikes('experience', expId);
      const likesArray = Array.isArray(likes) ? likes : [];
      const counts: Record<PhotoReaction, number> = { ...EMPTY_REACTION_COUNTS };
      let mine: PhotoReaction | null = null;
      for (const like of likesArray) {
        const reaction = String(like?.reaction || 'heart') as PhotoReaction;
        if (Object.prototype.hasOwnProperty.call(counts, reaction)) counts[reaction] += 1;
        if (String(like?.user?.id || '') === String(user?.id || '') && Object.prototype.hasOwnProperty.call(counts, reaction)) mine = reaction;
      }
      setExpReactionCounts((prev) => ({ ...prev, [expId]: counts }));
      setMyExpReactions((prev) => ({ ...prev, [expId]: mine }));
    } catch {
      setExpReactionCounts((prev) => ({ ...prev, [expId]: { ...EMPTY_REACTION_COUNTS } }));
      setMyExpReactions((prev) => ({ ...prev, [expId]: null }));
    } finally {
      setIsLoadingExpReactions((prev) => ({ ...prev, [expId]: false }));
    }
  };

  const reactToExp = async (expId: string, reaction: PhotoReaction) => {
    const current = myExpReactions[expId] || null;
    try {
      if (current === reaction) {
        await interactionsService.unlike('experience', expId);
      } else {
        await interactionsService.like('experience', expId, reaction);
      }
      await loadExpReactions(expId);
      const totalLikes = Object.values(expReactionCounts[expId] || EMPTY_REACTION_COUNTS).reduce((a, b) => a + b, 0);
      setAllExperiences((prev) => prev.map((e) => e.id === expId ? { ...e, likesCount: totalLikes, likedByMe: current !== reaction } : e));
    } catch {
      toast({ title: 'Erro ao reagir', description: 'Tente novamente.', variant: 'destructive' });
    }
    setOpenReactionPickerExpId(null);
  };

  const startExpLikeLongPress = (expId: string) => {
    if (longPressExpTimerRef.current) clearTimeout(longPressExpTimerRef.current);
    longPressExpTimerRef.current = setTimeout(() => {
      longPressTriggeredExpIdRef.current = expId;
      setOpenReactionPickerExpId(expId);
      if (!expReactionCounts[expId]) void loadExpReactions(expId);
    }, 500);
  };

  const cancelExpLikeLongPress = () => {
    if (longPressExpTimerRef.current) {
      clearTimeout(longPressExpTimerRef.current);
      longPressExpTimerRef.current = null;
    }
  };

  const handleExpLikeClick = async (experience: FeedExperience) => {
    if (longPressTriggeredExpIdRef.current === experience.id) {
      longPressTriggeredExpIdRef.current = null;
      return;
    }
    setOpenReactionPickerExpId(null);
    await handleToggleExperienceLike(experience);
  };

  const toggleExpComments = async (expId: string) => {
    const willOpen = openCommentsExpId !== expId;
    setOpenCommentsExpId(willOpen ? expId : null);
    if (!willOpen) return;
    if (commentsByExpId[expId]) return;
    try {
      const list = await interactionsService.getComments('experience', expId);
      setCommentsByExpId((prev) => ({ ...prev, [expId]: Array.isArray(list) ? list : [] }));
    } catch {
      setCommentsByExpId((prev) => ({ ...prev, [expId]: [] }));
    }
  };

  const sendExpComment = async (expId: string) => {
    const draft = (commentDraftByExpId[expId] || '').trim();
    if (!draft) return;
    setCommentDraftByExpId((prev) => ({ ...prev, [expId]: '' }));
    try {
      await interactionsService.comment('experience', expId, draft);
      registerActivity('comment');
      const list = await interactionsService.getComments('experience', expId);
      setCommentsByExpId((prev) => ({ ...prev, [expId]: Array.isArray(list) ? list : [] }));
      setAllExperiences((prev) => prev.map((e) => e.id === expId ? { ...e, commentsCount: e.commentsCount + 1 } : e));
    } catch {
      toast({ title: 'Erro ao comentar', description: 'Tente novamente.', variant: 'destructive' });
      setCommentDraftByExpId((prev) => ({ ...prev, [expId]: draft }));
    }
  };

  const startEditingExpComment = (expId: string, comment: Comment) => {
    setEditingCommentByExpId((prev) => ({ ...prev, [expId]: comment.id }));
    setEditCommentDraftById((prev) => ({ ...prev, [comment.id]: comment.content || '' }));
  };

  const cancelEditingExpComment = (expId: string) => {
    const editingId = editingCommentByExpId[expId];
    setEditingCommentByExpId((prev) => ({ ...prev, [expId]: null }));
    if (editingId) setEditCommentDraftById((prev) => { const next = { ...prev }; delete next[editingId]; return next; });
  };

  const saveEditedExpComment = async (expId: string, commentId: string) => {
    const draft = (editCommentDraftById[commentId] || '').trim();
    if (!draft) return;
    try {
      await interactionsService.updateComment(commentId, draft);
      const list = await interactionsService.getComments('experience', expId);
      setCommentsByExpId((prev) => ({ ...prev, [expId]: Array.isArray(list) ? list : [] }));
      setEditingCommentByExpId((prev) => ({ ...prev, [expId]: null }));
      setEditCommentDraftById((prev) => { const next = { ...prev }; delete next[commentId]; return next; });
    } catch {
      toast({ title: 'Erro ao editar comentário', description: 'Tente novamente.', variant: 'destructive' });
    }
  };

  const deleteExpComment = async (expId: string, commentId: string) => {
    try {
      await interactionsService.deleteComment(commentId);
      const list = await interactionsService.getComments('experience', expId);
      setCommentsByExpId((prev) => ({ ...prev, [expId]: Array.isArray(list) ? list : [] }));
      setAllExperiences((prev) => prev.map((e) => e.id === expId ? { ...e, commentsCount: Math.max(0, e.commentsCount - 1) } : e));
    } catch {
      toast({ title: 'Erro ao excluir comentário', description: 'Tente novamente.', variant: 'destructive' });
    }
  };

  const openExpReactionsModal = async (expId: string) => {
    setReactionsModalExpId(expId);
    setReactionsModalExpTab('all');
    setReactionsModalExpData([]);
    setIsLoadingExpReactionsModal(true);
    try {
      const data = await interactionsService.getLikes('experience', expId);
      setReactionsModalExpData(Array.isArray(data) ? data : []);
    } catch {
      setReactionsModalExpData([]);
    } finally {
      setIsLoadingExpReactionsModal(false);
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
        registerActivity('like');
      } else {
        await interactionsService.unlike('post', post.id);
      }
    } catch {
      setAllPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)));
      toast({ title: 'Erro ao curtir', description: 'Tente novamente.', variant: 'destructive' });
    }
  };

  const loadPhotoReactions = async (photoId: string) => {
    if (!photoId) return;
    setIsLoadingPhotoReactions((prev) => ({ ...prev, [photoId]: true }));
    try {
      const likes = await interactionsService.getLikes('photo', photoId);
      const likesArray = Array.isArray(likes) ? likes : [];
      const counts: Record<PhotoReaction, number> = { ...EMPTY_REACTION_COUNTS };
      let mine: PhotoReaction | null = null;
      for (const like of likesArray) {
        const reaction = String(like?.reaction || 'heart') as PhotoReaction;
        if (Object.prototype.hasOwnProperty.call(counts, reaction)) counts[reaction] += 1;
        if (String(like?.user?.id || '') === String(user?.id || '') && Object.prototype.hasOwnProperty.call(counts, reaction)) {
          mine = reaction;
        }
      }
      setPhotoReactionCounts((prev) => ({ ...prev, [photoId]: counts }));
      setMyPhotoReactions((prev) => ({ ...prev, [photoId]: mine }));
    } catch {
      setPhotoReactionCounts((prev) => ({ ...prev, [photoId]: { ...EMPTY_REACTION_COUNTS } }));
      setMyPhotoReactions((prev) => ({ ...prev, [photoId]: null }));
    } finally {
      setIsLoadingPhotoReactions((prev) => ({ ...prev, [photoId]: false }));
    }
  };

  const reactToPhoto = async (photoId: string, reaction: PhotoReaction) => {
    if (!photoId) return;
    const current = myPhotoReactions[photoId] || null;
    try {
      if (current === reaction) {
        await interactionsService.unlike('photo', photoId);
      } else {
        await interactionsService.like('photo', photoId, reaction);
      }
      await loadPhotoReactions(photoId);
    } catch {
      toast({ title: 'Erro ao reagir na foto', description: 'Tente novamente.', variant: 'destructive' });
    }
  };

  const getPrimaryPhotoId = (post: FeedPost) =>
    String(
      (post.media || []).find((m) => String(m.mimeType || '').startsWith('image/') && m.id)?.id || ''
    );

  const closeReactionPicker = () => {
    setOpenReactionPickerPostId(null);
  };

  // ─── Reações no desktop: hover-intent (mantém o long-press para toque) ───────
  // Só ativa em ponteiro fino com hover (mouse) — em touch os handlers saem cedo.
  const isHoverPointer = () =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const clearReactionHoverTimers = () => {
    if (reactionHoverOpenTimerRef.current) { clearTimeout(reactionHoverOpenTimerRef.current); reactionHoverOpenTimerRef.current = null; }
    if (reactionHoverCloseTimerRef.current) { clearTimeout(reactionHoverCloseTimerRef.current); reactionHoverCloseTimerRef.current = null; }
  };

  const handlePostReactionHoverEnter = (post: FeedPost) => {
    if (!isHoverPointer()) return;
    const photoId = getPrimaryPhotoId(post);
    if (!photoId) return; // posts só-texto não têm reações
    if (reactionHoverCloseTimerRef.current) { clearTimeout(reactionHoverCloseTimerRef.current); reactionHoverCloseTimerRef.current = null; }
    if (reactionHoverOpenTimerRef.current) clearTimeout(reactionHoverOpenTimerRef.current);
    reactionHoverOpenTimerRef.current = setTimeout(() => {
      setOpenReactionPickerExpId(null);
      setOpenReactionPickerPostId(post.id);
      if (!photoReactionCounts[photoId]) void loadPhotoReactions(photoId);
    }, 220);
  };

  const handleExpReactionHoverEnter = (expId: string) => {
    if (!isHoverPointer()) return;
    if (reactionHoverCloseTimerRef.current) { clearTimeout(reactionHoverCloseTimerRef.current); reactionHoverCloseTimerRef.current = null; }
    if (reactionHoverOpenTimerRef.current) clearTimeout(reactionHoverOpenTimerRef.current);
    reactionHoverOpenTimerRef.current = setTimeout(() => {
      setOpenReactionPickerPostId(null);
      setOpenReactionPickerExpId(expId);
      if (!expReactionCounts[expId]) void loadExpReactions(expId);
    }, 220);
  };

  // Fecha com um pequeno atraso, para o mouse conseguir cruzar o vão de 8px até
  // o seletor sem que ele suma. keepReactionPickerOpen cancela esse fechamento.
  const scheduleReactionHoverClose = () => {
    if (!isHoverPointer()) return;
    if (reactionHoverOpenTimerRef.current) { clearTimeout(reactionHoverOpenTimerRef.current); reactionHoverOpenTimerRef.current = null; }
    if (reactionHoverCloseTimerRef.current) clearTimeout(reactionHoverCloseTimerRef.current);
    reactionHoverCloseTimerRef.current = setTimeout(() => {
      setOpenReactionPickerPostId(null);
      setOpenReactionPickerExpId(null);
    }, 180);
  };

  const keepReactionPickerOpen = () => {
    if (!isHoverPointer()) return;
    if (reactionHoverCloseTimerRef.current) { clearTimeout(reactionHoverCloseTimerRef.current); reactionHoverCloseTimerRef.current = null; }
  };

  const startLikeLongPress = (post: FeedPost) => {
    const photoId = getPrimaryPhotoId(post);
    if (!photoId) return;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredPostIdRef.current = post.id;
      setOpenReactionPickerPostId(post.id);
      if (!photoReactionCounts[photoId]) void loadPhotoReactions(photoId);
    }, PHOTO_REACTION_LONG_PRESS_MS);
  };

  const cancelLikeLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleLikeButtonClick = async (post: FeedPost) => {
    if (longPressTriggeredPostIdRef.current === post.id) {
      longPressTriggeredPostIdRef.current = null;
      return;
    }
    closeReactionPicker();
    await handleToggleLike(post);
  };

  const handleReactFromPost = async (post: FeedPost, reaction: PhotoReaction) => {
    const photoId = getPrimaryPhotoId(post);
    if (!photoId) return;
    await reactToPhoto(photoId, reaction);
    closeReactionPicker();
  };

  useEffect(() => {
    if (!openReactionPickerPostId) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-reaction-picker-root="true"]')) return;
      closeReactionPicker();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [openReactionPickerPostId]);

  useEffect(() => () => cancelLikeLongPress(), []);
  useEffect(() => () => clearReactionHoverTimers(), []);

  const openReactionsModal = async (postId: string) => {
    setReactionsModalPostId(postId);
    setReactionsModalTab('all');
    setReactionsModalData([]);
    setIsLoadingReactionsModal(true);
    try {
      const data = await interactionsService.getLikes('post', postId);
      setReactionsModalData(Array.isArray(data) ? data : []);
    } catch {
      setReactionsModalData([]);
    } finally {
      setIsLoadingReactionsModal(false);
    }
  };

  const handleToggleFavorite = async (author: FeedPost['author']) => {
    const favoriteUser = {
      id: String(author.id),
      name: String(author.name || ''),
      avatar: author.avatar || undefined,
      addedAt: new Date().toISOString(),
    };
    const alreadyFavorite = isFavorite(favoriteUser.id);

    toggleFavorite(favoriteUser);
    try {
      if (alreadyFavorite) {
        await interactionsService.unlike('user', favoriteUser.id);
      } else {
        await interactionsService.like('user', favoriteUser.id);
      }
    } catch {
      toggleFavorite(favoriteUser);
      toast({
        title: 'Não foi possível atualizar favorito',
        description: 'Tente novamente em instantes.',
        variant: 'destructive',
      });
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
    const replyingTo = replyingToByPostId[postId] ?? null;
    setCommentDraftByPostId((prev) => ({ ...prev, [postId]: '' }));
    setReplyingToByPostId((prev) => ({ ...prev, [postId]: null }));
    try {
      await interactionsService.comment('post', postId, draft, replyingTo?.id);
      registerActivity('comment');
      const list = await interactionsService.getComments('post', postId);
      setCommentsByPostId((prev) => ({ ...prev, [postId]: Array.isArray(list) ? list : [] }));
      if (!replyingTo) {
        setAllPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, commentsCount: p.commentsCount + 1 } : p)));
      }
    } catch {
      toast({ title: 'Erro ao comentar', description: 'Tente novamente.', variant: 'destructive' });
      setCommentDraftByPostId((prev) => ({ ...prev, [postId]: draft }));
    }
  };

  const appendEmojiToCommentDraft = (postId: string, emoji: string) => {
    setCommentDraftByPostId((prev) => ({ ...prev, [postId]: `${prev[postId] || ''}${emoji}` }));
  };

  const startEditingComment = (postId: string, comment: Comment) => {
    setEditingCommentByPostId((prev) => ({ ...prev, [postId]: comment.id }));
    setEditCommentDraftById((prev) => ({ ...prev, [comment.id]: comment.content || '' }));
  };

  const cancelEditingComment = (postId: string) => {
    const editingId = editingCommentByPostId[postId];
    setEditingCommentByPostId((prev) => ({ ...prev, [postId]: null }));
    if (editingId) {
      setEditCommentDraftById((prev) => {
        const next = { ...prev };
        delete next[editingId];
        return next;
      });
    }
  };

  const saveEditedComment = async (postId: string, commentId: string) => {
    const draft = (editCommentDraftById[commentId] || '').trim();
    if (!draft) return;
    try {
      await interactionsService.updateComment(commentId, draft);
      const list = await interactionsService.getComments('post', postId);
      setCommentsByPostId((prev) => ({ ...prev, [postId]: Array.isArray(list) ? list : [] }));
      setEditingCommentByPostId((prev) => ({ ...prev, [postId]: null }));
      setEditCommentDraftById((prev) => {
        const next = { ...prev };
        delete next[commentId];
        return next;
      });
    } catch {
      toast({ title: 'Erro ao editar comentário', description: 'Tente novamente.', variant: 'destructive' });
    }
  };

  const deleteComment = async (postId: string, commentId: string) => {
    try {
      await interactionsService.deleteComment(commentId);
      const list = await interactionsService.getComments('post', postId);
      setCommentsByPostId((prev) => ({ ...prev, [postId]: Array.isArray(list) ? list : [] }));
      setAllPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, commentsCount: Math.max(0, (p.commentsCount || 0) - 1) } : p))
      );
    } catch {
      toast({ title: 'Erro ao excluir comentário', description: 'Tente novamente.', variant: 'destructive' });
    }
  };

  return (
    <div className="w-full min-w-0 overflow-x-hidden pb-24 md:pb-0 bg-background">
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

      {firstAccessPostMode && showFirstAccessPostHint ? (
        <div className="mb-4">
          <Card className="overflow-hidden border-primary/20 bg-gradient-to-r from-primary/12 via-rose-500/10 to-orange-400/10 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-primary">Segundo passo do seu primeiro acesso</p>
                <h2 className="text-xl font-bold">Faça sua primeira publicação</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Compartilhe uma foto, um clima, uma intenção ou uma apresentação rápida. Um perfil que publica cedo desperta mais curiosidade e recebe mais atenção.
                </p>
              </div>
              <Button className="bg-gradient-primary hover:opacity-90" onClick={() => composerRef.current?.focus()}>
                Escrever agora
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
      {user && !firstAccessPostMode && (
        <EventPromoCard userId={user.id} />
      )}

      {user && !firstAccessPostMode && !notifBannerDismissed && !pushEnabled && pushSupported && (
        <Card className="relative mb-3 flex items-center gap-2.5 overflow-hidden border-primary/20 bg-gradient-to-r from-primary/10 to-rose-500/5 px-3 py-2.5 sm:mb-4">
          <Bell className="h-4 w-4 shrink-0 text-primary" />
          <p className="min-w-0 flex-1 text-xs font-medium text-foreground">
            Ative as notificações para não perder matches, radares e mensagens.
          </p>
          <button
            type="button"
            disabled={pushLoading}
            onClick={async () => {
              setPushLoading(true);
              try {
                await enablePushNotifications();
                const s = await getPushActivationState();
                setPushEnabled(s.enabled);
                toast({ title: '🔔 Notificações ativadas!' });
              } catch {
                toast({ title: 'Não foi possível ativar', variant: 'destructive' });
              } finally {
                setPushLoading(false);
              }
            }}
            className="shrink-0 rounded-full bg-primary px-3 py-1 text-[11px] font-bold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {pushLoading ? '…' : 'Ativar'}
          </button>
          <button
            type="button"
            aria-label="Dispensar aviso de notificações"
            className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground"
            onClick={() => { localStorage.setItem('nosigilo:notif-banner-date', new Date().toISOString().slice(0, 10)); setNotifBannerDismissed(true); }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </Card>
      )}

      {/* Saudação contextual por horário */}
      {feedFilter !== 'experiences' ? <FeedGreeting userName={user?.name} summary={feedInsightsSummary} /> : null}

      {/* Top do Dia — posts mais curtidos das últimas 24h */}
      {feedFilter !== 'experiences' ? <TopDayBar /> : null}

      {/* Stories bar — porta de entrada para os Stories de 24h */}
      {feedFilter !== 'experiences' ? <StoriesBar /> : null}

      {/* Perto de você — radares ativos e eventos compatíveis */}
      {feedFilter !== 'experiences' ? <NearbyActivityStrip /> : null}

      {/* Composer */}
      {feedFilter === 'experiences' ? (
        <Card ref={expFormRef} className="mb-4 glass p-3 sm:mb-6 sm:p-4">
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Compartilhe sua história 😈</p>
              <button
                type="button"
                onClick={() => setExpTemplatesOpen((v) => !v)}
                className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
              >
                ✍️ {expTemplatesOpen ? 'Fechar modelos' : 'Usar modelo'}
              </button>
            </div>

            {/* Writing templates */}
            {expTemplatesOpen && (
              <div className="rounded-xl border border-primary/15 bg-primary/5 p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Escolha um modelo para começar</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {EXP_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.label}
                      type="button"
                      onClick={() => {
                        setExperienceTitle(tpl.title);
                        setExperienceDescription(tpl.body);
                        setExpTemplatesOpen(false);
                      }}
                      className="flex flex-col items-start gap-1 rounded-lg border border-primary/20 bg-background p-3 text-left text-sm hover:border-primary/50 hover:bg-primary/5 transition-colors"
                    >
                      <span className="text-lg leading-none">{tpl.emoji}</span>
                      <span className="font-semibold text-foreground">{tpl.label}</span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">{tpl.body.slice(0, 60)}…</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Input
              placeholder="Título do conto (ex.: Nossa noite mais quente 🔥)"
              value={experienceTitle}
              onChange={(e) => setExperienceTitle(e.target.value)}
              maxLength={120}
            />
            <div className="relative">
              <Textarea
                placeholder={"Conta pra gente… o que rolou? 😈\nPode escrever à vontade — aqui é lugar seguro."}
                value={experienceDescription}
                onChange={(e) => setExperienceDescription(e.target.value)}
                maxLength={50000}
                className="min-h-[160px] resize-y rounded-xl border-2 border-primary/15 bg-background px-4 py-3 text-[15px] leading-6 focus-visible:ring-2 focus-visible:ring-primary/40 sm:min-h-[140px] sm:rounded-md sm:border-input sm:text-sm"
                rows={6}
              />
              <span className={cn('absolute bottom-2 right-3 text-xs', experienceDescription.trim().length < 20 ? 'text-muted-foreground' : 'text-green-500')}>
                {experienceDescription.trim().length < 20
                  ? `${experienceDescription.trim().length}/20 mín.`
                  : `${experienceDescription.trim().length.toLocaleString('pt-BR')} caracteres`}
              </span>
            </div>
            {/* Photo/Video previews */}
            {expAttachments.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {expAttachments.map((a, i) => (
                  <div key={a.id} className="relative w-20 h-20">
                    {a.isVideo ? (
                      <video src={a.url} className="w-20 h-20 rounded-lg object-cover" muted />
                    ) : (
                      <img src={a.url} className="w-20 h-20 rounded-lg object-cover" />
                    )}
                    <button
                      type="button"
                      className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white text-xs"
                      onClick={() => {
                        URL.revokeObjectURL(a.url);
                        setExpAttachments((p) => p.filter((_, idx) => idx !== i));
                      }}
                    >×</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-3">
                <label className="cursor-pointer flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <Image className="w-4 h-4" />
                  <span className="text-sm">Foto</span>
                  <input
                    ref={expFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []).slice(0, 10 - expAttachments.length);
                      setExpAttachments((p) => [...p, ...files.map((f) => ({ id: `${f.name}-${Math.random()}`, file: f, url: URL.createObjectURL(f), isVideo: false }))]);
                      if (expFileInputRef.current) expFileInputRef.current.value = '';
                    }}
                  />
                </label>
                <label className="cursor-pointer flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <Video className="w-4 h-4" />
                  <span className="text-sm">Vídeo</span>
                  <input
                    ref={expVideoInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && expAttachments.length < 10) {
                        setExpAttachments((p) => [...p, { id: `${file.name}-${Math.random()}`, file, url: URL.createObjectURL(file), isVideo: true }]);
                      }
                      if (expVideoInputRef.current) expVideoInputRef.current.value = '';
                    }}
                  />
                </label>
              </div>
              <Button
                size="sm"
                className="h-11 rounded-xl bg-gradient-primary px-4 text-sm font-medium hover:opacity-90 gap-2 sm:h-9 sm:rounded-md sm:px-3"
                disabled={experienceDescription.trim().length < 20 || isPublishingExperience}
                onClick={handlePublishExperience}
              >
                <Send className="w-4 h-4" />
                {isPublishingExperience ? 'Publicando...' : 'Publicar experiência'}
              </Button>
            </div>
          </div>
        </Card>
      ) : (
      <Card className="mb-4 glass p-3 sm:mb-6 sm:p-4">
        <div className="flex min-w-0 gap-3 sm:gap-4">
          <div className="relative shrink-0">
            <Avatar className="h-10 w-10">
              <AvatarImage src={user?.avatar ? resolveServerUrl(user.avatar) : undefined} />
              <AvatarFallback>{String(user?.name || 'U')[0]}</AvatarFallback>
            </Avatar>
            {/* Streak badge overlaid on avatar */}
            {streakState.streak >= 2 && (
              <span
                title={`${streakState.streak} dias seguidos`}
                className="absolute -bottom-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-orange-500 px-0.5 text-[9px] font-bold text-white ring-2 ring-background"
              >
                🔥{streakState.streak}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <Textarea
              ref={composerRef}
              placeholder="Compartilhe aqui prazer com fotos, vídeos e textos picantes!"
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              onPaste={handlePasteOnComposer}
              className="min-h-[92px] resize-none rounded-xl border-2 border-primary/15 bg-background px-4 py-3 text-[15px] leading-6 focus-visible:ring-2 focus-visible:ring-primary/40 sm:min-h-[88px] sm:rounded-md sm:border-input sm:text-sm"
              rows={2}
            />
            {attachments.length > 0 && (
              <div className="mt-4 grid sm:grid-cols-2 gap-3">
                {attachments.map((p, idx) => (
                  <div key={p.id} className="relative rounded-lg overflow-hidden border bg-secondary/30">
                    {p.file.type.startsWith('video/') ? (
                      premiumAccess ? (
                        <div className="w-full" style={aspectStyleForKey(p.id)}>
                          <VideoWithPreview
                            key={p.url}
                            src={p.url}
                            className="h-full w-full bg-black object-contain sm:object-cover"
                            controls
                            muted
                            preload="auto"
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
                          className="h-full w-full bg-black object-contain sm:object-cover"
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
            {/* Rap-only toggle — appears when a video is attached */}
            {attachments.some((a) => a.file.type.startsWith('video/')) && (
              <div className={cn(
                'mt-3 flex items-center justify-between rounded-xl border px-4 py-3 transition-colors',
                reelsOnly
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-border/50 bg-secondary/20'
              )}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <Clapperboard className={cn('w-4 h-4 shrink-0', reelsOnly ? 'text-primary' : 'text-muted-foreground')} />
                  <div className="min-w-0">
                    <p className={cn('text-sm font-medium', reelsOnly ? 'text-primary' : 'text-foreground')}>
                      Somente em Rap
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {reelsOnly ? 'Não aparecerá no feed principal' : 'Aparecerá no feed e em Rap'}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={reelsOnly}
                  onCheckedChange={setReelsOnly}
                  className="shrink-0"
                />
              </div>
            )}

            <div className="mt-3 flex flex-col gap-3 border-t pt-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between sm:mt-4 sm:pt-4">
              <div className="flex min-w-0 flex-wrap gap-2">
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
                className="h-11 w-full rounded-xl bg-gradient-primary px-4 text-sm font-medium hover:opacity-90 gap-2 min-[420px]:w-auto min-[420px]:shrink-0 sm:h-9 sm:rounded-md sm:px-3"
                disabled={(!postContent.trim() && attachments.length === 0) || isPublishing}
                onClick={handlePublish}
              >
                <Send className="w-4 h-4" />
                {isPublishing
                  ? (uploadProgress !== null && uploadProgress < 100 ? `Enviando ${uploadProgress}%` : 'Publicando...')
                  : 'Publicar'}
              </Button>
            </div>

            {/* Barra de progresso animada do envio */}
            {isPublishing && (
              <div className="mt-3">
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                  {uploadProgress !== null && uploadProgress < 100 ? (
                    // Determinada: cresce conforme o upload, com brilho passando por cima
                    <div
                      className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-rose-500 via-primary to-violet-500 transition-[width] duration-300 ease-out"
                      style={{ width: `${uploadProgress}%` }}
                    >
                      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                    </div>
                  ) : (
                    // Indeterminada: servidor finalizando/processando o vídeo
                    <div className="absolute top-0 h-full animate-progress-indeterminate rounded-full bg-gradient-to-r from-rose-500 via-primary to-violet-500" />
                  )}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {uploadProgress !== null && uploadProgress < 100
                    ? `Enviando mídia… ${uploadProgress}%`
                    : 'Processando e publicando…'}
                </p>
              </div>
            )}
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
      )}

      <div className="grid min-w-0 gap-4 md:grid-cols-3 md:gap-6">
        {/* Posts Feed */}
        <div className="min-w-0 space-y-4 md:col-span-2 md:space-y-6">
          <DailyMissions />
          <Card className="overflow-hidden px-3 py-2.5 glass border-2 border-primary/30 ring-1 ring-primary/10 shadow-[0_2px_16px_rgba(139,92,246,0.18)]">
            {/* Tab bar container */}
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {/* Segmented pill group */}
              <div className="flex shrink-0 items-center gap-0.5 rounded-xl bg-white/5 p-0.5 ring-1 ring-white/8">
                <button
                  type="button"
                  onClick={() => setFeedFilter('all')}
                  className={cn(
                    'flex items-center gap-1.5 rounded-[10px] px-3.5 py-1.5 text-sm font-medium transition-all duration-200',
                    feedFilter === 'all'
                      ? 'bg-gradient-primary text-white shadow-[0_2px_12px_rgba(139,92,246,0.45)]'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                  )}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setFeedFilter('friends')}
                  className={cn(
                    'flex items-center gap-1.5 rounded-[10px] px-3.5 py-1.5 text-sm font-medium transition-all duration-200',
                    feedFilter === 'friends'
                      ? 'bg-gradient-primary text-white shadow-[0_2px_12px_rgba(139,92,246,0.45)]'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                  )}
                >
                  <Users className="h-3.5 w-3.5" />
                  Amigos
                </button>
                <button
                  type="button"
                  onClick={() => setFeedFilter('experiences')}
                  className={cn(
                    'flex items-center gap-1.5 rounded-[10px] px-3.5 py-1.5 text-sm font-medium transition-all duration-200',
                    feedFilter === 'experiences'
                      ? 'bg-gradient-primary text-white shadow-[0_2px_12px_rgba(139,92,246,0.45)]'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                  )}
                >
                  ✍️ Meus Contos Eróticos
                </button>
              </div>

              {/* Separator */}
              {feedFilter !== 'experiences' && (
                <div className="mx-1 h-5 w-px shrink-0 bg-white/10" />
              )}

              {/* Rap — navigation shortcut */}
              {feedFilter !== 'experiences' && (
                <button
                  type="button"
                  onClick={() => navigate('/reels')}
                  className="flex shrink-0 items-center gap-1.5 rounded-[10px] px-3.5 py-1.5 text-sm font-medium text-muted-foreground ring-1 ring-white/10 transition-all duration-200 hover:bg-white/5 hover:text-foreground hover:ring-white/20"
                >
                  <Clapperboard className="h-3.5 w-3.5" />
                  Rap
                </button>
              )}

              {/* Somente curtidos */}
              {feedFilter !== 'experiences' && (
                <button
                  type="button"
                  onClick={() => setFeedFilter('favorites')}
                  disabled={favorites.length === 0}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-[10px] px-3.5 py-1.5 text-sm font-medium transition-all duration-200',
                    feedFilter === 'favorites'
                      ? 'animate-liked-filter bg-gradient-to-r from-pink-600 to-rose-500 text-white shadow-[0_2px_12px_rgba(236,72,153,0.4)] motion-reduce:animate-none'
                      : 'text-pink-400 ring-1 ring-pink-500/25 hover:bg-pink-500/10 hover:ring-pink-500/40 disabled:pointer-events-none disabled:opacity-40'
                  )}
                >
                  <Heart className={cn('h-3.5 w-3.5', feedFilter === 'favorites' && 'fill-current')} />
                  Curtidos
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                      feedFilter === 'favorites'
                        ? 'bg-white/20 text-white'
                        : 'bg-pink-500/15 text-pink-500'
                    )}
                  >
                    {favorites.length}
                  </span>
                </button>
              )}

              {/* Voltar ao feed (modo Experiências, mobile) */}
              {feedFilter === 'experiences' && (
                <button
                  type="button"
                  onClick={() => setFeedFilter('all')}
                  className="flex shrink-0 items-center gap-1.5 rounded-[10px] px-3.5 py-1.5 text-sm font-medium text-muted-foreground ring-1 ring-white/10 transition hover:bg-white/5 hover:text-foreground md:hidden"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Voltar
                </button>
              )}
            </div>

            {/* Proximity filter row — segunda linha, só quando tem localização e não está em Experiências */}
            {user?.lat && feedFilter !== 'experiences' ? (
              <div className="mt-2.5 pt-2.5 border-t border-border/40 flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span className="text-xs text-muted-foreground font-medium shrink-0">Perto de mim:</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={handleCityOnly}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-semibold transition-all',
                      cityOnly
                        ? 'bg-emerald-500 text-white shadow-sm'
                        : 'bg-muted text-muted-foreground hover:bg-emerald-100 hover:text-emerald-700 dark:hover:bg-emerald-950/60 dark:hover:text-emerald-400'
                    )}
                  >
                    🏙 Minha cidade
                  </button>
                  {NEARBY_OPTIONS.map((km) => (
                    <button
                      key={km}
                      type="button"
                      onClick={() => handleNearbyRadius(km)}
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-semibold transition-all',
                        nearbyRadius === km
                          ? 'bg-emerald-500 text-white shadow-sm'
                          : 'bg-muted text-muted-foreground hover:bg-emerald-100 hover:text-emerald-700 dark:hover:bg-emerald-950/60 dark:hover:text-emerald-400'
                      )}
                    >
                      {km} km
                    </button>
                  ))}
                  {(nearbyRadius !== null || cityOnly) && (
                    <button
                      type="button"
                      onClick={() => { setNearbyRadius(null); setCityOnly(false); void triggerNearbyReload(null, false); }}
                      className="ml-1 rounded-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      ✕ limpar
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </Card>
          {/* Social Pulse — variable reward curiosity gap card (mobile only; moves to sidebar on desktop) */}
          {feedFilter === 'all' && nearbyRadius === null && !cityOnly ? (
            <div className="md:hidden">
              <SocialPulseCard enabled={!!user?.id} />
            </div>
          ) : null}

          {/* Proximity active banner */}
          {feedFilter !== 'experiences' && (nearbyRadius !== null || cityOnly) ? (
            <Card className="overflow-hidden border-emerald-400/25 bg-gradient-to-r from-emerald-50/70 via-background to-teal-50/50 p-4 glass dark:from-emerald-950/30 dark:to-teal-950/20">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg">📍</span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {cityOnly ? 'Pessoas da sua cidade' : `Pessoas a até ${nearbyRadius} km de você`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Toque em qualquer perfil para iniciar uma conversa e marcar um encontro.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { setNearbyRadius(null); setCityOnly(false); void triggerNearbyReload(null, false); }}
                  className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors underline"
                >
                  Ver todos
                </button>
              </div>
            </Card>
          ) : null}
          {feedFilter === 'all' && nearbyRadius === null && !cityOnly && feedInsightsSummary ? (
            <Card className="overflow-hidden border-primary/10 bg-gradient-to-r from-primary/6 via-background to-pink-500/5 p-4 glass md:hidden">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Mais chance de encontrar algo agora</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{feedInsightsSummary}</p>
                </div>
                <Badge variant="secondary" className="shrink-0 border border-primary/15 bg-white/70 text-primary">
                  Ao vivo
                </Badge>
              </div>
            </Card>
          ) : null}
          {feedFilter === 'all' && radarHighlights.length > 0 ? (
            <Card className="overflow-hidden border-rose-200/50 bg-gradient-to-r from-rose-50/80 via-background to-orange-50/70 p-4 glass md:hidden">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-rose-500" />
                    <p className="text-sm font-semibold text-foreground">Radares ativos perto de você agora</p>
                  </div>
                  {radarHighlightsSummary ? (
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{radarHighlightsSummary}</p>
                  ) : null}
                </div>
                <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => navigate('/radar')}>
                  Ver radar
                </Button>
              </div>
              <div className="mt-3 grid gap-3">
                {radarHighlights.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate('/radar')}
                    className="rounded-2xl border border-rose-200/60 bg-white/85 p-3 text-left transition-colors hover:border-rose-300 hover:bg-white"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-foreground">{item.sender.name}</span>
                          {typeof item.distanceKm === 'number' ? (
                            <Badge variant="outline" className="border-rose-200 bg-rose-50 text-[11px] font-medium text-rose-600">
                              {item.distanceKm} km
                            </Badge>
                          ) : null}
                        </div>
                        {getIdentityLine(item.sender) ? (
                          <div className="truncate text-xs text-muted-foreground">{getIdentityLine(item.sender)}</div>
                        ) : null}
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{item.message}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1 text-xs font-medium text-rose-600">
                        <TimerReset className="h-3.5 w-3.5" />
                        <span>{formatRemainingRadarTime(item.expiresAt)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          ) : null}
          {feedFilter === 'experiences' ? (
            <>
              {/* Weekly theme challenge card */}
              <Card className="overflow-hidden border-primary/20 bg-gradient-to-r from-primary/8 via-background to-pink-500/6 p-4 glass">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg leading-none">{WEEKLY_THEME.emoji}</span>
                      <span className="text-[11px] font-bold uppercase tracking-widest text-primary/70">Tema da semana</span>
                    </div>
                    <p className="text-sm font-bold text-foreground">{WEEKLY_THEME.theme}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{WEEKLY_THEME.description}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge variant="outline" className="border-primary/25 bg-primary/5 text-primary text-[10px]">
                      {WEEKLY_THEME.deadline}
                    </Badge>
                  </div>
                </div>
              </Card>

              {isLoadingExperiences ? (
                <MobileState
                  loading
                  title="Carregando experiências"
                  description="Buscando os contos mais recentes da rede."
                />
              ) : null}
              {!isLoadingExperiences && allExperiences.length === 0 ? (
                <MobileState
                  title="Sem experiências por enquanto"
                  description="Seja o primeiro a compartilhar um conto e iniciar essa aba."
                />
              ) : null}
              {!isLoadingExperiences &&
                allExperiences.map((experience) => (
                  <Card key={experience.id} data-experience-card className="overflow-hidden glass">
                    <div className="flex items-center justify-between gap-2 p-3 sm:p-4">
                      <Link
                        to={getUserProfileHref(experience.author.id, user?.id, '/feed')}
                        className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-90 transition-opacity"
                      >
                        <Avatar className="h-11 w-11 sm:h-10 sm:w-10">
                          <AvatarImage src={experience.author.avatar ? resolveServerUrl(experience.author.avatar) : undefined} />
                          <AvatarFallback>{String(experience.author.name || 'U')[0]}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <span className="truncate text-[0.98rem] font-semibold hover:underline sm:text-base">{experience.author.name}</span>
                          {getIdentityLine(experience.author) ? (
                            <div className="truncate text-xs text-muted-foreground">{getIdentityLine(experience.author)}</div>
                          ) : null}
                          <span className="text-[13px] text-muted-foreground sm:text-sm">{formatWhen(experience.createdAt)}</span>
                        </div>
                      </Link>
                      {experience.author.id === user?.id ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full">
                              <MoreHorizontal className="h-4.5 w-4.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={async () => {
                                try {
                                  await experienceService.delete(experience.id);
                                  toast({ title: 'Experiência removida' });
                                  await reloadExperiences();
                                } catch {
                                  toast({ title: 'Falha ao remover', description: 'Tente novamente.', variant: 'destructive' });
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                              Remover experiência
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                    <div className="px-3 pb-3 sm:px-4">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedExp((prev) => ({ ...prev, [experience.id]: !prev[experience.id] }))
                        }
                        className="block w-full text-left"
                        aria-expanded={!!expandedExp[experience.id]}
                      >
                        <h3 className="text-lg font-bold hover:underline">{experience.title}</h3>
                        <p
                          className={cn(
                            'mt-2 text-[0.95rem] leading-6 text-muted-foreground sm:text-base',
                            expandedExp[experience.id] ? 'whitespace-pre-wrap' : 'line-clamp-3'
                          )}
                        >
                          {experience.description}
                        </p>
                        <span className="mt-1.5 inline-block text-sm font-semibold text-primary hover:underline">
                          {expandedExp[experience.id] ? 'Ler menos' : 'Ler conto completo →'}
                        </span>
                      </button>
                    </div>
                    {/* Photo carousel */}
                    {(experience.media ?? []).filter((m) => m.mimeType.startsWith('image/')).length > 0 && (() => {
                      const photos = (experience.media ?? []).filter((m) => m.mimeType.startsWith('image/'));
                      const idx = expPhotoIndex[experience.id] ?? 0;
                      return (
                        <div className="relative mx-3 mb-3 overflow-hidden rounded-xl">
                          <img src={resolveServerUrl(photos[idx].url)} className="w-full max-h-80 object-cover rounded-xl" />
                          {photos.length > 1 && (
                            <>
                              <span className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
                                {idx + 1}/{photos.length}
                              </span>
                              <button type="button" className="absolute left-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white" onClick={() => setExpPhotoIndex((p) => ({ ...p, [experience.id]: (idx - 1 + photos.length) % photos.length }))}>
                                <ChevronLeft className="w-4 h-4" />
                              </button>
                              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white" onClick={() => setExpPhotoIndex((p) => ({ ...p, [experience.id]: (idx + 1) % photos.length }))}>
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })()}
                    {/* Experience Actions */}
                    <div className="flex items-center justify-between border-t p-3 sm:p-4">
                      <div className="flex items-center gap-4">
                        {/* Reaction picker */}
                        <div
                          className="relative"
                          data-reaction-picker-root="true"
                          onMouseEnter={() => handleExpReactionHoverEnter(experience.id)}
                          onMouseLeave={scheduleReactionHoverClose}
                        >
                          <button
                            onMouseDown={() => startExpLikeLongPress(experience.id)}
                            onMouseUp={cancelExpLikeLongPress}
                            onMouseLeave={cancelExpLikeLongPress}
                            onTouchStart={() => startExpLikeLongPress(experience.id)}
                            onTouchEnd={cancelExpLikeLongPress}
                            onTouchCancel={cancelExpLikeLongPress}
                            onClick={() => void handleExpLikeClick(experience)}
                            aria-label={experience.likedByMe ? 'Remover curtida' : 'Curtir experiência'}
                            className={cn(
                              'flex items-center gap-2 transition-colors',
                              experience.likedByMe ? 'text-primary' : 'text-muted-foreground hover:text-primary'
                            )}
                          >
                            <Heart className={cn('w-5 h-5', experience.likedByMe && 'fill-current')} />
                            <span className="hidden text-[10px] font-medium text-muted-foreground/60 sm:inline">
                              {myExpReactions[experience.id]
                                ? EXP_REACTION_EMOJI[myExpReactions[experience.id]!]
                                : '· segure'}
                            </span>
                          </button>
                          {openReactionPickerExpId === experience.id ? (
                            <div
                              className="absolute bottom-[calc(100%+8px)] left-0 z-20 min-w-[240px] rounded-xl border border-white/10 bg-black/90 p-3 shadow-xl backdrop-blur-sm"
                              onMouseEnter={keepReactionPickerOpen}
                              onMouseLeave={scheduleReactionHoverClose}
                            >
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">Como você reagiu?</p>
                              <div className="grid grid-cols-2 gap-1.5">
                                {EXP_REACTIONS.map((item) => {
                                  const counts = expReactionCounts[experience.id] || EMPTY_REACTION_COUNTS;
                                  const mine = myExpReactions[experience.id] || null;
                                  return (
                                    <button
                                      key={`exp-${experience.id}-${item.id}`}
                                      type="button"
                                      className={cn(
                                        'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs text-white transition-colors',
                                        mine === item.id
                                          ? 'border-primary bg-primary/30'
                                          : 'border-white/15 bg-white/5 hover:bg-white/10'
                                      )}
                                      onClick={() => void reactToExp(experience.id, item.id)}
                                      disabled={!!isLoadingExpReactions[experience.id]}
                                    >
                                      <span>{item.emoji}</span>
                                      <span className="text-white/80">{item.label}</span>
                                      {(counts[item.id] || 0) > 0 && (
                                        <span className="ml-auto font-bold text-white/60">{counts[item.id]}</span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                        </div>
                        {/* Comment button */}
                        <button
                          type="button"
                          aria-label="Ver comentários"
                          onClick={() => void toggleExpComments(experience.id)}
                          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <MessageCircle className="w-5 h-5" />
                          <span className="text-sm font-medium">{experience.commentsCount}</span>
                        </button>
                      </div>
                      {/* Likes summary */}
                      {experience.likesCount > 0 && (
                        <button
                          type="button"
                          onClick={() => void openExpReactionsModal(experience.id)}
                          className="flex items-center gap-1.5 rounded-full hover:bg-muted/60 px-2 py-1 transition-colors"
                        >
                          <div className="flex items-center">
                            {(() => {
                              const counts = expReactionCounts[experience.id];
                              const bubbles = counts
                                ? Object.entries(counts).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k)
                                : ['heart'];
                              return bubbles.map((type, i) => (
                                <span
                                  key={type}
                                  className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[11px] ring-2 ring-background"
                                  style={{ marginLeft: i > 0 ? '-6px' : 0, zIndex: 3 - i }}
                                >
                                  {EXP_REACTION_EMOJI[type] ?? REACTION_EMOJI[type] ?? '💜'}
                                </span>
                              ));
                            })()}
                          </div>
                          <span className="text-sm font-medium text-muted-foreground">{experience.likesCount}</span>
                        </button>
                      )}
                    </div>
                    {/* Comments section */}
                    {openCommentsExpId === experience.id && (
                      <div className="space-y-3 border-t p-3 sm:p-4">
                        <div className="space-y-3">
                          {(commentsByExpId[experience.id] || []).map((c) => (
                            <div key={c.id} className="flex items-start gap-3">
                              <Link to={getUserProfileHref(c.user.id, user?.id, '/feed')} className="hover:opacity-90 transition-opacity">
                                <Avatar className="w-8 h-8">
                                  <AvatarImage src={c.user.avatar ? resolveServerUrl(c.user.avatar) : undefined} />
                                  <AvatarFallback>{String(c.user.name || 'U')[0]}</AvatarFallback>
                                </Avatar>
                              </Link>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <Link to={getUserProfileHref(c.user.id, user?.id, '/feed')} className="text-sm font-medium hover:underline">
                                    {c.user.name}
                                  </Link>
                                  <span className="text-xs text-muted-foreground">{formatWhen(c.createdAt)}</span>
                                  {String(c.user.id) === String(user?.id || '') ? (
                                    <div className="ml-auto flex items-center gap-2">
                                      <button type="button" className={`${COMMENT_ACTION_BUTTON_BASE} ${COMMENT_ACTION_EDIT_CLASS}`} onClick={() => startEditingExpComment(experience.id, c)}>Editar</button>
                                      <button type="button" className={`${COMMENT_ACTION_BUTTON_BASE} ${COMMENT_ACTION_DELETE_CLASS}`} onClick={() => void deleteExpComment(experience.id, c.id)}>Excluir</button>
                                    </div>
                                  ) : null}
                                </div>
                                {getIdentityLine(c.user) ? <div className="text-xs text-muted-foreground">{getIdentityLine(c.user)}</div> : null}
                                {editingCommentByExpId[experience.id] === c.id ? (
                                  <div className="mt-1 flex items-center gap-2">
                                    <Input
                                      value={editCommentDraftById[c.id] || ''}
                                      onChange={(e) => setEditCommentDraftById((prev) => ({ ...prev, [c.id]: e.target.value }))}
                                      onKeyDown={(e) => { if (e.key === 'Enter') void saveEditedExpComment(experience.id, c.id); }}
                                      className={COMMENT_INLINE_INPUT_CLASS}
                                    />
                                    <Button type="button" size="sm" className={COMMENT_SAVE_BUTTON_CLASS} onClick={() => void saveEditedExpComment(experience.id, c.id)} disabled={!(editCommentDraftById[c.id] || '').trim()}>Salvar</Button>
                                    <Button type="button" size="sm" variant="outline" className={COMMENT_CANCEL_BUTTON_CLASS} onClick={() => cancelEditingExpComment(experience.id)}>Cancelar</Button>
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground">{c.content}</p>
                                )}
                              </div>
                            </div>
                          ))}
                          {(commentsByExpId[experience.id] || []).length === 0 && (
                            <p className="text-sm text-muted-foreground">Nenhum comentário ainda.</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Escreva um comentário..."
                            value={commentDraftByExpId[experience.id] || ''}
                            onChange={(e) => setCommentDraftByExpId((prev) => ({ ...prev, [experience.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') void sendExpComment(experience.id); }}
                          />
                          <Button type="button" onClick={() => void sendExpComment(experience.id)} disabled={!(commentDraftByExpId[experience.id] || '').trim()}>
                            Enviar
                          </Button>
                        </div>
                      </div>
                    )}
                  </Card>
                ))}
            </>
          ) : null}
          {feedFilter !== 'experiences' && isLoading && (
            <MobileState
              loading
              title="Carregando publicações"
              description="Organizando o feed para mostrar as novidades primeiro."
            />
          )}
          {feedFilter !== 'experiences' && !isLoading && feedFilter === 'favorites' && favorites.length > 0 && visiblePosts.length === 0 ? (
            <MobileState
              title="Nenhuma publicação dos curtidos"
              description="Quando as pessoas que você curtiu publicarem algo, aparece aqui."
            />
          ) : null}
          {feedFilter === 'friends' && !isLoading && visiblePosts.length === 0 ? (
            <MobileState
              title="Nada de amigos por aqui ainda"
              description="Mostra só publicações de amigos e perfis que você curtiu. Curta perfis e faça amigos para encher esta aba."
            />
          ) : null}
          {feedFilter !== 'experiences' && !isLoading && (nearbyRadius !== null || cityOnly) && allPosts.length === 0 ? (
            <Card className="overflow-hidden p-8 glass text-center space-y-3">
              <div className="text-4xl">📍</div>
              <p className="font-semibold text-foreground">
                {cityOnly ? 'Ninguém da sua cidade por enquanto' : 'Ninguém perto de você por enquanto'}
              </p>
              <p className="text-sm text-muted-foreground">
                {cityOnly
                  ? 'Não encontramos publicações de pessoas da sua cidade. Tente um raio de distância ou volte mais tarde.'
                  : `Não encontramos publicações de pessoas a até ${nearbyRadius} km. Tente ampliar o raio ou voltar mais tarde.`
                }
              </p>
              <div className="flex justify-center gap-2 pt-1">
                {!cityOnly && nearbyRadius !== null && NEARBY_OPTIONS.filter((km) => km > nearbyRadius).slice(0, 1).map((km) => (
                  <Button key={km} size="sm" variant="outline" onClick={() => handleNearbyRadius(km)}>
                    Ampliar para {km} km
                  </Button>
                ))}
                {cityOnly && (
                  <Button size="sm" variant="outline" onClick={() => { setCityOnly(false); void handleNearbyRadius(50); }}>
                    Ver até 50 km
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => { setNearbyRadius(null); setCityOnly(false); void triggerNearbyReload(null, false); }}>
                  Ver todos
                </Button>
              </div>
            </Card>
          ) : null}
          {feedFilter !== 'experiences' && !isLoading && feedDisplayItems.map((item) => (
            item.type === 'section' ? (
              <div key={item.id} className="flex items-center gap-3 px-1 py-2 select-none">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
                <div className="flex flex-col items-center gap-0.5 text-center">
                  <span className="text-xs font-bold tracking-wide text-primary uppercase">{item.title}</span>
                  <span className="text-[11px] text-muted-foreground max-w-[240px] leading-tight">{item.description}</span>
                </div>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
              </div>
            ) : (
            <Card key={item.post.id} id={`post-${item.post.id}`} data-post-card className="overflow-hidden glass" style={{ contain: 'paint' }}>
              {/* Post Header */}
                    <div className="flex items-center justify-between gap-2 p-3 sm:p-4">
                      <Link
                        to={getUserProfileHref(item.post.author.id, user?.id, '/feed')}
                        className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-90 transition-opacity"
                      >
                  <Avatar className="h-11 w-11 sm:h-10 sm:w-10">
                    <AvatarImage src={item.post.author.avatar ? resolveServerUrl(item.post.author.avatar) : undefined} />
                    <AvatarFallback>{String(item.post.author.name || 'U')[0]}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="truncate text-[0.98rem] font-semibold hover:underline sm:text-base">
                        {item.post.author.name}
                        {(() => { const a = buildProfileAgeLabel(item.post.author); return a ? <span className="font-normal text-muted-foreground">, {a}</span> : null; })()}
                      </span>
                      {(() => {
                        const badge = getProfileTypeBadge(item.post.author.gender);
                        const ctx = item.post.feedContext;
                        const isVeryRecent = Date.now() - new Date(item.post.createdAt).getTime() < 2 * 60 * 60 * 1000;
                        return (
                          <>
                            {badge && (
                              <Badge variant="outline" className={cn('shrink-0 border text-[10px] font-semibold px-1.5 py-0 leading-5', badge.cls)}>
                                {badge.emoji} {badge.label}
                              </Badge>
                            )}
                            {ctx?.label && ctx.label !== 'Novo agora' && (
                              <Badge variant="outline" className="shrink-0 max-w-[10rem] truncate border-primary/20 bg-primary/5 text-[10px] font-medium text-primary">
                                {ctx.reason === 'nearby' ? '📍' : ctx.reason === 'affinity' ? '💬' : ctx.reason === 'popular_local' ? '🔥' : ''} {ctx.label}
                              </Badge>
                            )}
                            {isVeryRecent && (
                              <Badge variant="outline" className="shrink-0 border-emerald-400/30 bg-emerald-500/10 text-[10px] font-bold text-emerald-600 px-1.5 py-0 leading-5 animate-pulse-slow">
                                NOVO
                              </Badge>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    {getIdentityLine(item.post.author) ? (
                      <div className="truncate text-xs text-muted-foreground">{getIdentityLine(item.post.author)}</div>
                    ) : null}
                    <span className="text-[13px] text-muted-foreground sm:text-sm">{formatWhen(item.post.createdAt)}</span>
                  </div>
                </Link>
                <div className="flex shrink-0 items-center gap-1">
                  {item.post.author.id !== user?.id ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-full"
                      onClick={() => void handleToggleFavorite(item.post.author)}
                      aria-label={isFavorite(String(item.post.author.id)) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                    >
                      <Star
                        className={cn(
                          'h-4.5 w-4.5',
                          isFavorite(String(item.post.author.id)) ? 'text-gold fill-current' : 'text-muted-foreground'
                        )}
                      />
                    </Button>
                  ) : null}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full">
                        <MoreHorizontal className="h-4.5 w-4.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {item.post.author.id === user?.id ? (
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={async () => {
                            try {
                              await feedService.deletePost(item.post.id);
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
              {item.post.content?.trim() ? (
                <div className="px-3 pb-3 sm:px-4">
                  <p className="text-base leading-6 sm:text-lg sm:leading-7">{item.post.content}</p>
                </div>
              ) : null}

              {/* Post Media */}
              {item.post.media?.length > 0 && (
                <div className="px-3 pb-3 sm:px-4">
                  <PostMediaCarousel
                    media={item.post.media
                      .filter((m) => !!m.url)
                      .map((m) => ({ id: m.id, url: m.url as string, mimeType: m.mimeType ?? '' }))}
                    resolveUrl={resolveMediaUrl}
                    aspectStyle={aspectStyleForKey}
                    onAspectLoaded={setAspectForKey}
                    premiumAccess={premiumAccess}
                    onPremiumGate={() => setPaywallOpen(true)}
                  />
                </div>
              )}

              {/* Post Actions */}
              <div className="flex items-center justify-between border-t p-3 sm:p-4">
                <div className="flex items-center gap-4">
                  {/* Like button with long-press (touch) / hover (desktop) reaction picker */}
                  <div
                    className="relative"
                    data-reaction-picker-root="true"
                    onMouseEnter={() => handlePostReactionHoverEnter(item.post)}
                    onMouseLeave={scheduleReactionHoverClose}
                  >
                    <button
                      type="button"
                      aria-label={item.post.likedByMe ? 'Remover curtida' : 'Curtir publicação'}
                      onMouseDown={() => startLikeLongPress(item.post)}
                      onMouseUp={cancelLikeLongPress}
                      onMouseLeave={cancelLikeLongPress}
                      onTouchStart={() => startLikeLongPress(item.post)}
                      onTouchEnd={cancelLikeLongPress}
                      onTouchCancel={cancelLikeLongPress}
                      onClick={() => void handleLikeButtonClick(item.post)}
                      className={cn(
                        'flex items-center gap-2 transition-colors',
                        item.post.likedByMe ? 'text-primary' : 'text-muted-foreground hover:text-primary'
                      )}
                    >
                      <Heart className={cn('w-5 h-5', item.post.likedByMe && 'fill-current')} />
                    </button>
                    {openReactionPickerPostId === item.post.id ? (
                      <div
                        className="absolute bottom-[calc(100%+8px)] left-0 z-20 min-w-[220px] rounded-xl border border-white/10 bg-black/85 p-2 shadow-lg backdrop-blur-sm"
                        onMouseEnter={keepReactionPickerOpen}
                        onMouseLeave={scheduleReactionHoverClose}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          {PHOTO_REACTIONS.map((reaction) => {
                            const photoId = getPrimaryPhotoId(item.post);
                            const counts = photoReactionCounts[photoId] || EMPTY_REACTION_COUNTS;
                            const mine = myPhotoReactions[photoId] || null;
                            return (
                              <button
                                key={`${item.post.id}-${reaction.id}`}
                                type="button"
                                className={cn(
                                  'rounded-full border px-2.5 py-1 text-xs text-white transition-colors',
                                  mine === reaction.id
                                    ? 'border-primary bg-primary/25'
                                    : 'border-white/15 bg-white/5 hover:bg-white/10'
                                )}
                                onClick={() => void handleReactFromPost(item.post, reaction.id)}
                                disabled={!!isLoadingPhotoReactions[photoId]}
                              >
                                <span className="mr-1">{reaction.emoji}</span>
                                <span>{counts[reaction.id] || 0}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Comment button */}
                  <button
                    type="button"
                    aria-label="Ver comentários"
                    onClick={() => void toggleComments(item.post.id)}
                    className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <MessageCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">{item.post.commentsCount}</span>
                  </button>
                </div>

                {/* Reactions summary — right side */}
                {item.post.likesCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void openReactionsModal(item.post.id)}
                    className="flex items-center gap-1.5 rounded-full hover:bg-muted/60 px-2 py-1 transition-colors"
                  >
                    {/* Stacked emoji bubbles */}
                    <div className="flex items-center">
                      {(item.post.reactions && item.post.reactions.length > 0
                        ? item.post.reactions.slice(0, 3)
                        : [{ type: 'heart', count: item.post.likesCount }]
                      ).map((r, i) => (
                        <span
                          key={r.type}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[11px] ring-2 ring-background"
                          style={{ marginLeft: i > 0 ? '-6px' : 0, zIndex: 3 - i }}
                        >
                          {REACTION_EMOJI[r.type] ?? '💜'}
                        </span>
                      ))}
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">
                      {item.post.likesCount >= 10 ? (
                        <span className="text-primary font-semibold">🔥 {item.post.likesCount}</span>
                      ) : item.post.likesCount}
                    </span>
                  </button>
                )}
              </div>

              {/* CTA — Ver perfil / Chamar para encontro */}
              {item.post.author.id !== user?.id && (
                <Link
                  to={getUserProfileHref(item.post.author.id, user?.id, '/feed')}
                  className={cn(
                    'flex items-center justify-between border-t px-3 py-2.5 sm:px-4 transition-colors group',
                    nearbyRadius !== null && item.post.distanceKm !== null && item.post.distanceKm !== undefined
                      ? 'hover:bg-emerald-50/60 dark:hover:bg-emerald-950/30'
                      : 'hover:bg-primary/5'
                  )}
                >
                  <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                    {(() => {
                      const badge = getProfileTypeBadge(item.post.author.gender);
                      const name = item.post.author.name?.split(' ')[0] || 'esse perfil';
                      const d = item.post.distanceKm;
                      if (nearbyRadius !== null && d !== null && d !== undefined) {
                        return `📍 ${d} km — toque para chamar ${name} para um encontro`;
                      }
                      if (badge) return `${badge.emoji} Ver o perfil de ${name}`;
                      return `Ver o perfil de ${name}`;
                    })()}
                  </span>
                  <span className={cn(
                    'text-[11px] font-semibold group-hover:translate-x-0.5 transition-transform shrink-0',
                    nearbyRadius !== null && item.post.distanceKm !== null && item.post.distanceKm !== undefined
                      ? 'text-emerald-600'
                      : 'text-primary'
                  )}>
                    {nearbyRadius !== null && item.post.distanceKm !== null && item.post.distanceKm !== undefined
                      ? 'Chamar →'
                      : 'Ver perfil →'}
                  </span>
                </Link>
              )}

              {openCommentsPostId === item.post.id && (
                <div className="space-y-3 border-t p-3 sm:p-4">
                  {isLoadingComments && <p className="text-sm text-muted-foreground">Carregando comentários...</p>}
                  {!isLoadingComments && (
                    <div className="space-y-3">
                      {(commentsByPostId[item.post.id] || []).map((c) => (
                        <div key={c.id}>
                          {/* Top-level comment */}
                          <div className="flex items-start gap-3">
                            <Link to={getUserProfileHref(c.user.id, user?.id, '/feed')} className="hover:opacity-90 transition-opacity">
                              <Avatar className="w-8 h-8">
                                <AvatarImage src={c.user.avatar ? resolveServerUrl(c.user.avatar) : undefined} />
                                <AvatarFallback>{String(c.user.name || 'U')[0]}</AvatarFallback>
                              </Avatar>
                            </Link>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <Link to={getUserProfileHref(c.user.id, user?.id, '/feed')} className="text-sm font-medium hover:underline">
                                  {c.user.name}
                                </Link>
                                <span className="text-xs text-muted-foreground">{formatWhen(c.createdAt)}</span>
                                <div className="ml-auto flex items-center gap-2">
                                  {/* Reply button — visible for all except own comment */}
                                  {String(c.user.id) !== String(user?.id || '') && (
                                    <button
                                      type="button"
                                      className="text-[11px] text-primary hover:underline"
                                      onClick={() => {
                                        setReplyingToByPostId((prev) => ({
                                          ...prev,
                                          [item.post.id]: prev[item.post.id]?.id === c.id ? null : c,
                                        }));
                                        setCommentDraftByPostId((prev) => ({ ...prev, [item.post.id]: '' }));
                                      }}
                                    >
                                      {replyingToByPostId[item.post.id]?.id === c.id ? '↩ Cancelar' : '↩ Responder'}
                                    </button>
                                  )}
                                  {String(c.user.id) === String(user?.id || '') && (
                                    <>
                                      <button type="button" className={`${COMMENT_ACTION_BUTTON_BASE} ${COMMENT_ACTION_EDIT_CLASS}`} onClick={() => startEditingComment(item.post.id, c)}>Editar</button>
                                      <button type="button" className={`${COMMENT_ACTION_BUTTON_BASE} ${COMMENT_ACTION_DELETE_CLASS}`} onClick={() => void deleteComment(item.post.id, c.id)}>Excluir</button>
                                    </>
                                  )}
                                </div>
                              </div>
                              {getIdentityLine(c.user) ? <div className="text-xs text-muted-foreground">{getIdentityLine(c.user)}</div> : null}
                              {editingCommentByPostId[item.post.id] === c.id ? (
                                <div className="mt-1 flex items-center gap-2">
                                  <Input value={editCommentDraftById[c.id] || ''} onChange={(e) => setEditCommentDraftById((prev) => ({ ...prev, [c.id]: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') void saveEditedComment(item.post.id, c.id); }} className={COMMENT_INLINE_INPUT_CLASS} />
                                  <Button type="button" size="sm" className={COMMENT_SAVE_BUTTON_CLASS} onClick={() => void saveEditedComment(item.post.id, c.id)} disabled={!(editCommentDraftById[c.id] || '').trim()}>Salvar</Button>
                                  <Button type="button" size="sm" variant="outline" className={COMMENT_CANCEL_BUTTON_CLASS} onClick={() => cancelEditingComment(item.post.id)}>Cancelar</Button>
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">{c.content}</p>
                              )}
                            </div>
                          </div>

                          {/* Replies */}
                          {(c.replies ?? []).length > 0 && (
                            <div className="ml-11 mt-2 space-y-2 border-l-2 border-primary/20 pl-3">
                              {(c.replies ?? []).map((r) => (
                                <div key={r.id} className="flex items-start gap-2">
                                  <Link to={getUserProfileHref(r.user.id, user?.id, '/feed')} className="hover:opacity-90 transition-opacity">
                                    <Avatar className="w-6 h-6">
                                      <AvatarImage src={r.user.avatar ? resolveServerUrl(r.user.avatar) : undefined} />
                                      <AvatarFallback>{String(r.user.name || 'U')[0]}</AvatarFallback>
                                    </Avatar>
                                  </Link>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <Link to={getUserProfileHref(r.user.id, user?.id, '/feed')} className="text-xs font-medium hover:underline">{r.user.name}</Link>
                                      <span className="text-[10px] text-muted-foreground">{formatWhen(r.createdAt)}</span>
                                      {String(r.user.id) === String(user?.id || '') && (
                                        <button type="button" className={`ml-auto ${COMMENT_ACTION_BUTTON_BASE} ${COMMENT_ACTION_DELETE_CLASS}`} onClick={() => void deleteComment(item.post.id, r.id)}>Excluir</button>
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground">{r.content}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      {(commentsByPostId[item.post.id] || []).length === 0 && (
                        <p className="text-sm text-muted-foreground">Nenhum comentário ainda.</p>
                      )}
                    </div>
                  )}

                  {/* Reply context banner */}
                  {replyingToByPostId[item.post.id] && (
                    <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5 text-xs text-primary">
                      <span>↩ Respondendo <strong>{replyingToByPostId[item.post.id]?.user.name}</strong></span>
                      <button type="button" className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => setReplyingToByPostId((prev) => ({ ...prev, [item.post.id]: null }))}>✕</button>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Input
                      placeholder={replyingToByPostId[item.post.id] ? `Responder ${replyingToByPostId[item.post.id]?.user.name}...` : 'Escreva um comentário...'}
                      value={commentDraftByPostId[item.post.id] || ''}
                      onChange={(e) => setCommentDraftByPostId((prev) => ({ ...prev, [item.post.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') void sendComment(item.post.id); }}
                    />
                    <Button type="button" onClick={() => void sendComment(item.post.id)} disabled={!(commentDraftByPostId[item.post.id] || '').trim()}>
                      Enviar
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {COMMENT_QUICK_EMOJIS.map((emoji) => (
                      <button key={`${item.post.id}-emoji-${emoji}`} type="button" onClick={() => appendEmojiToCommentDraft(item.post.id, emoji)} className={COMMENT_EMOJI_CHIP_CLASS}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Card>
            )
          ))}
          {feedFilter !== 'experiences' && !isLoading && visiblePosts.length === 0 && feedFilter === 'all' ? (
            <MobileState
              title="Sem publicações por enquanto"
              description="Assim que alguém postar no feed, você já vê por aqui."
            />
          ) : null}
          {feedFilter !== 'experiences' && !isLoading && hasMore ? (
            <Card className="p-4 glass flex items-center justify-center">
              <Button type="button" variant="secondary" disabled={isLoadingMore} onClick={() => void loadMore()}>
                {isLoadingMore ? 'Carregando...' : 'Carregar mais'}
              </Button>
            </Card>
          ) : null}
          {feedFilter !== 'experiences' ? <div ref={loadMoreRef} /> : null}
        </div>

        {/* ── Sidebar — desktop only (col 3 of the grid) ────────────────── */}
        <div className="hidden md:flex md:flex-col md:gap-4 md:sticky md:top-4 md:self-start">
          {/* Social Pulse */}
          {feedFilter === 'all' && nearbyRadius === null ? (
            <SocialPulseCard enabled={!!user?.id} />
          ) : null}

          {/* Feed Insights */}
          {feedFilter === 'all' && nearbyRadius === null && !cityOnly && feedInsightsSummary ? (
            <Card className="overflow-hidden border-primary/10 bg-gradient-to-r from-primary/6 via-background to-pink-500/5 p-4 glass">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Mais chance agora</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{feedInsightsSummary}</p>
                </div>
                <Badge variant="secondary" className="shrink-0 border border-primary/15 bg-white/70 text-primary text-[10px]">
                  Ao vivo
                </Badge>
              </div>
            </Card>
          ) : null}

          {/* Radar Highlights */}
          {feedFilter === 'all' && radarHighlights.length > 0 ? (
            <Card className="overflow-hidden border-rose-200/50 bg-gradient-to-r from-rose-50/80 via-background to-orange-50/70 p-4 glass">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-rose-500" />
                    <p className="text-sm font-semibold text-foreground">Radares perto de você</p>
                  </div>
                </div>
                <Button type="button" size="sm" variant="outline" className="shrink-0 text-xs px-2 h-7" onClick={() => navigate('/radar')}>
                  Ver radar
                </Button>
              </div>
              <div className="mt-3 grid gap-2">
                {radarHighlights.slice(0, 2).map((item) => (
                  <button
                    key={`sb2-${item.id}`}
                    type="button"
                    onClick={() => navigate('/radar')}
                    className="rounded-xl border border-rose-200/60 bg-white/85 p-2.5 text-left transition-colors hover:border-rose-300 hover:bg-white"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-semibold text-foreground">{item.sender.name}</span>
                          {typeof item.distanceKm === 'number' ? (
                            <Badge variant="outline" className="border-rose-200 bg-rose-50 text-[10px] font-medium text-rose-600 px-1.5 py-0">
                              {item.distanceKm} km
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted-foreground">{item.message}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-rose-600">
                        <TimerReset className="h-3 w-3" />
                        <span>{formatRemainingRadarTime(item.expiresAt)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          ) : null}

          {/* Premium upgrade */}
          {!premiumAccess && (
            <Card className="p-4 bg-gradient-to-br from-gold/20 to-primary/20 border-gold/30">
              <Badge className="bg-gold text-black mb-3">Premium</Badge>
              <h3 className="font-semibold mb-2">Destaque seu perfil</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Apareça mais e tenha acesso a recursos exclusivos.
              </p>
              <Button className="w-full bg-gold text-black hover:bg-gold/90" onClick={() => setPaywallOpen(true)}>
                Ver Planos
              </Button>
            </Card>
          )}

          {/* Promoter CTA — always visible on desktop sidebar */}
          <Card
            className="overflow-hidden border-0 cursor-pointer"
            onClick={() => navigate('/ganhe')}
          >
            <div className="bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 p-4 text-white space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">💰</span>
                <p className="text-sm font-bold leading-tight">Ganhe dinheiro<br />indicando a plataforma</p>
              </div>
              <p className="text-xs text-white/80 leading-relaxed">
                R$1,98 por assinatura confirmada. Pix todo mês. Grátis para participar.
              </p>
              <div className="flex items-center gap-1 text-yellow-300 text-xs font-semibold">
                Quero saber como <ArrowRight className="w-3 h-3" />
              </div>
            </div>
          </Card>

          {/* Quick nav — always visible on desktop */}
          <Card className="p-4 glass border-border/50">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Explorar</p>
            <nav className="flex flex-col gap-1">
              {[
                { path: '/match',   emoji: '💜', label: 'Match' },
                { path: '/radar',   emoji: '📡', label: 'Radar' },
                { path: '/search',  emoji: '🔍', label: 'Buscar' },
                { path: '/friends', emoji: '🤝', label: 'Amigos' },
                { path: '/reels',   emoji: '🎬', label: 'Rap (Vídeos)' },
                { path: '/videos',  emoji: '🔎', label: 'Buscar Vídeos' },
                { path: '/events',  emoji: '🎉', label: 'Eventos' },
              ].map(({ path, emoji, label }) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => navigate(path)}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground text-left"
                >
                  <span className="text-base leading-none">{emoji}</span>
                  {label}
                </button>
              ))}
            </nav>
          </Card>
        </div>

      </div>{/* ── end grid ─────────────────────────────────────────────────── */}

      {/* Non-grid elements (dialogs, hidden inputs) — must live OUTSIDE the grid */}
      <input
          ref={profilePhotoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void handleProfilePhotoGateChange(e.target.files)}
        />

        <Dialog
          open={showProfilePhotoGate}
          onOpenChange={(open) => {
            if (!open && user?.id) {
              // Mark as dismissed for this session so it doesn't reopen on re-navigate
              sessionStorage.setItem(`nosigilo:photo-prompt-dismissed:${user.id}`, '1');
            }
            setShowProfilePhotoGate(open);
          }}
        >
          <DialogContent className="sm:max-w-md">
            <div className="space-y-4">
              <div className="space-y-2 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Camera className="h-7 w-7" />
                </div>
                <h2 className="text-xl font-semibold">Adicione sua foto de perfil</h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  Perfis com foto recebem muito mais atenção. Adicione agora para aproveitar melhor a plataforma.
                </p>
              </div>

              <div className="rounded-2xl border bg-secondary/20 p-4 text-sm text-muted-foreground">
                Sem foto, você não aparece no Match e na Busca — mas pode navegar pelo Feed e Chat normalmente.
              </div>

              <Button
                type="button"
                className="w-full"
                disabled={isUploadingProfilePhoto}
                onClick={() => profilePhotoInputRef.current?.click()}
              >
                {isUploadingProfilePhoto ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
                {isUploadingProfilePhoto ? 'Enviando foto...' : 'Escolher foto de perfil'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => {
                  if (user?.id) sessionStorage.setItem(`nosigilo:photo-prompt-dismissed:${user.id}`, '1');
                  setShowProfilePhotoGate(false);
                }}
              >
                Pular por agora
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Reactions Modal */}
        {reactionsModalPostId !== null && (() => {
          const modalPost = allPosts.find((p) => p.id === reactionsModalPostId);
          if (!modalPost) return null;

          // Build tabs: all + each distinct reaction type
          const reactionTypes = reactionsModalData.reduce<Record<string, typeof reactionsModalData>>((acc, r) => {
            const key = r.reaction || 'heart';
            if (!acc[key]) acc[key] = [];
            acc[key].push(r);
            return acc;
          }, {});
          const tabList = [
            { key: 'all', label: `Todas`, count: reactionsModalData.length },
            ...Object.entries(reactionTypes)
              .sort((a, b) => b[1].length - a[1].length)
              .map(([k, v]) => ({ key: k, label: REACTION_EMOJI[k] ?? '💜', count: v.length })),
          ];
          const displayRows = reactionsModalTab === 'all'
            ? reactionsModalData
            : reactionsModalData.filter((r) => (r.reaction || 'heart') === reactionsModalTab);

          return (
            <Dialog open onOpenChange={(open) => { if (!open) setReactionsModalPostId(null); }}>
              <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden">
                {/* Header tabs */}
                <div className="flex items-center gap-1 overflow-x-auto border-b px-3 pt-3 pb-0">
                  {tabList.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setReactionsModalTab(tab.key)}
                      className={cn(
                        'flex items-center gap-1.5 whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-medium transition-colors',
                        reactionsModalTab === tab.key
                          ? 'border-b-2 border-primary text-primary'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <span>{tab.label}</span>
                      <span className={cn(
                        'rounded-full px-1.5 py-0.5 text-xs font-semibold',
                        reactionsModalTab === tab.key ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                      )}>
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>

                {/* User list */}
                <div className="max-h-[60vh] overflow-y-auto">
                  {isLoadingReactionsModal ? (
                    <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      Carregando...
                    </div>
                  ) : displayRows.length === 0 ? (
                    <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma reação ainda.</p>
                  ) : (
                    <ul className="divide-y">
                      {displayRows.map((r) => (
                        <li key={r.id}>
                          <Link
                            to={getUserProfileHref(r.user.id, user?.id, '/feed')}
                            onClick={() => setReactionsModalPostId(null)}
                            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                          >
                            <div className="relative shrink-0">
                              <Avatar className="h-10 w-10">
                                <AvatarImage src={r.user.avatar ? resolveServerUrl(r.user.avatar) : undefined} />
                                <AvatarFallback>{String(r.user.name || 'U')[0]}</AvatarFallback>
                              </Avatar>
                              <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-background text-[10px] ring-1 ring-border">
                                {REACTION_EMOJI[r.reaction || 'heart'] ?? '💜'}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{r.user.name}</p>
                              {getIdentityLine(r.user) ? (
                                <p className="truncate text-xs text-muted-foreground">{getIdentityLine(r.user)}</p>
                              ) : null}
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          );
        })()}

        {/* Experience Reactions Modal */}
        {reactionsModalExpId !== null && (() => {
          const reactionTypes = reactionsModalExpData.reduce<Record<string, typeof reactionsModalExpData>>((acc, r) => {
            const key = r.reaction || 'heart';
            if (!acc[key]) acc[key] = [];
            acc[key].push(r);
            return acc;
          }, {});
          const tabList = [
            { key: 'all', label: 'Todas', count: reactionsModalExpData.length },
            ...Object.entries(reactionTypes)
              .sort((a, b) => b[1].length - a[1].length)
              .map(([k, v]) => ({ key: k, label: REACTION_EMOJI[k] ?? '💜', count: v.length })),
          ];
          const displayRows = reactionsModalExpTab === 'all'
            ? reactionsModalExpData
            : reactionsModalExpData.filter((r) => (r.reaction || 'heart') === reactionsModalExpTab);
          return (
            <Dialog open onOpenChange={(open) => { if (!open) setReactionsModalExpId(null); }}>
              <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden">
                <div className="flex items-center gap-1 overflow-x-auto border-b px-3 pt-3 pb-0">
                  {tabList.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setReactionsModalExpTab(tab.key)}
                      className={cn(
                        'flex items-center gap-1.5 whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-medium transition-colors',
                        reactionsModalExpTab === tab.key
                          ? 'border-b-2 border-primary text-primary'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <span>{tab.label}</span>
                      <span className={cn(
                        'rounded-full px-1.5 py-0.5 text-xs font-semibold',
                        reactionsModalExpTab === tab.key ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                      )}>
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="max-h-[60vh] overflow-y-auto">
                  {isLoadingExpReactionsModal ? (
                    <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      Carregando...
                    </div>
                  ) : displayRows.length === 0 ? (
                    <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma reação ainda.</p>
                  ) : (
                    <ul className="divide-y">
                      {displayRows.map((r) => (
                        <li key={r.id}>
                          <Link
                            to={getUserProfileHref(r.user.id, user?.id, '/feed')}
                            onClick={() => setReactionsModalExpId(null)}
                            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                          >
                            <div className="relative shrink-0">
                              <Avatar className="h-10 w-10">
                                <AvatarImage src={r.user.avatar ? resolveServerUrl(r.user.avatar) : undefined} />
                                <AvatarFallback>{String(r.user.name || 'U')[0]}</AvatarFallback>
                              </Avatar>
                              <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-background text-[10px] ring-1 ring-border">
                                {REACTION_EMOJI[r.reaction || 'heart'] ?? '💜'}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{r.user.name}</p>
                              {getIdentityLine(r.user) ? (
                                <p className="truncate text-xs text-muted-foreground">{getIdentityLine(r.user)}</p>
                              ) : null}
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          );
        })()}

      <ReferralPaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />

      {/* Pergunta se quer postar a imagem nos stories também */}
      <AlertDialog open={!!storyPromptMediaId} onOpenChange={(open) => { if (!open) setStoryPromptMediaId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Postar nos stories também?</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja publicar essa imagem no seu story? Ela ficará disponível por 24h.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Não</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!storyPromptMediaId) return;
                try {
                  await storiesService.create(storyPromptMediaId);
                  toast({ title: '✨ Story publicado!', description: 'Expira em 24 horas.' });
                } catch {
                  toast({ title: 'Erro ao publicar story', variant: 'destructive' });
                } finally {
                  setStoryPromptMediaId(null);
                }
              }}
            >
              Sim, publicar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

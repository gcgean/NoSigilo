import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Image, Video, Send, Heart, MessageCircle, MoreHorizontal, X, Lock, Crown, Trash2, Star, Clapperboard, Clapperboard as ReelsIcon, ChevronLeft, ChevronRight, Camera, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { experienceService, feedService, interactionsService, profileService } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { hasPremiumAccess } from '@/utils/premium';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useFavorites } from '@/contexts/FavoritesContext';
import { SERVER_ORIGIN, resolveServerUrl } from '@/utils/serverUrl';
import { formatProfileIdentityLine } from '@/utils/profileIdentity';
import VideoWithPreview from '@/components/VideoWithPreview';
import MobileState from '@/components/MobileState';
import { getUserProfileHref } from '@/utils/userProfileNavigation';
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
  mediaIds: string[];
  media: FeedMedia[];
  likesCount: number;
  commentsCount: number;
  likedByMe: boolean;
  reactions?: { type: string; count: number }[];
};

type FeedExperience = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  media?: Array<{ id: string; url: string; mimeType: string }>;
  author: { id: string; name: string; avatar?: string | null; gender?: string | null; city?: string | null; state?: string | null };
  likesCount: number;
  commentsCount: number;
  likedByMe: boolean;
};

type Comment = {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string; avatar?: string | null; gender?: string | null; city?: string | null; state?: string | null };
};

type PhotoReaction = 'heart' | 'fire' | 'love' | 'wow' | 'devil' | 'splash';
const PHOTO_REACTIONS: Array<{ id: PhotoReaction; emoji: string }> = [
  { id: 'heart', emoji: '💜' },
  { id: 'fire', emoji: '🔥' },
  { id: 'love', emoji: '😍' },
  { id: 'wow', emoji: '🤭' },
  { id: 'devil', emoji: '😈' },
  { id: 'splash', emoji: '💦' },
];
const EMPTY_REACTION_COUNTS: Record<PhotoReaction, number> = {
  heart: 0,
  fire: 0,
  love: 0,
  wow: 0,
  devil: 0,
  splash: 0,
};
const PHOTO_REACTION_LONG_PRESS_MS = 400;
const VIDEO_MAX_BYTES = 200 * 1024 * 1024;
const REACTION_EMOJI: Record<string, string> = {
  heart: '💜',
  fire: '🔥',
  love: '😍',
  wow: '🤭',
  devil: '😈',
  splash: '💦',
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
  const { user, updateUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { favorites, isFavorite, toggleFavorite } = useFavorites();
  const premiumAccess = hasPremiumAccess(user);
  const [postContent, setPostContent] = useState('');
  const [experienceTitle, setExperienceTitle] = useState('');
  const [experienceDescription, setExperienceDescription] = useState('');
  const [reelsOnly, setReelsOnly] = useState(false);
  const [allPosts, setAllPosts] = useState<FeedPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPublishingExperience, setIsPublishingExperience] = useState(false);
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
  const [editingCommentByPostId, setEditingCommentByPostId] = useState<Record<string, string | null>>({});
  const [editCommentDraftById, setEditCommentDraftById] = useState<Record<string, string>>({});
  const [isLoadingComments, setIsLoadingComments] = useState(false);
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
  const firstAccessPostMode = new URLSearchParams(location.search).get('firstAccess') === 'post';
  const profilePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [showProfilePhotoGate, setShowProfilePhotoGate] = useState(false);
  const [isUploadingProfilePhoto, setIsUploadingProfilePhoto] = useState(false);
  const [showFirstAccessPostHint, setShowFirstAccessPostHint] = useState(false);
  const [checkedFirstAccessPostHint, setCheckedFirstAccessPostHint] = useState(false);
  const [allExperiences, setAllExperiences] = useState<FeedExperience[]>([]);
  const [isLoadingExperiences, setIsLoadingExperiences] = useState(false);
  const [expAttachments, setExpAttachments] = useState<Array<{ id: string; file: File; url: string }>>([]);
  const [expPhotoIndex, setExpPhotoIndex] = useState<Record<string, number>>({});
  const expFileInputRef = useRef<HTMLInputElement | null>(null);
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

  const [feedFilter, setFeedFilter] = useState<'all' | 'favorites' | 'experiences'>(() => {
    const v = localStorage.getItem('nosigilo_feed_filter');
    return v === 'favorites' || v === 'experiences' ? v : 'all';
  });
  useEffect(() => {
    localStorage.setItem('nosigilo_feed_filter', feedFilter);
  }, [feedFilter]);

  const visiblePosts = useMemo(() => {
    if (feedFilter !== 'favorites') return allPosts;
    const favIds = new Set(favorites.map((f) => String(f.id)));
    return allPosts.filter((p) => favIds.has(String(p.author.id)));
  }, [allPosts, feedFilter, favorites]);

  const getIdentityLine = (profile?: { gender?: string | null; city?: string | null; state?: string | null } | null) =>
    formatProfileIdentityLine(profile);

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
    } catch {
      toast({ title: 'Erro ao carregar feed', description: 'Tente novamente.', variant: 'destructive' });
      setAllPosts([]);
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
    } catch {
      toast({ title: 'Erro ao carregar experiências', description: 'Tente novamente.', variant: 'destructive' });
      setAllExperiences([]);
    } finally {
      setIsLoadingExperiences(false);
    }
  };

  useEffect(() => {
    void reload();
    void reloadExperiences();
  }, []);

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
    setShowProfilePhotoGate(!user.avatar);
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
    const acceptedFiles = Array.from(files).filter((f) => {
      if (f.type.startsWith('video/') && f.size > VIDEO_MAX_BYTES) {
        toast({
          title: 'Vídeo muito grande',
          description: 'O tamanho máximo permitido é 200 MB por vídeo.',
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
    setIsPublishing(true);
    try {
      let completedFirstPostStep = false;
      const mediaIds: string[] = [];
      for (const a of attachments) {
        if (a.file.type.startsWith('video/') && !premiumAccess) {
          throw new Error('Vídeos são Premium após o teste grátis.');
        }
        const uploaded = await profileService.uploadMedia(a.file);
        if (uploaded?.id) mediaIds.push(String(uploaded.id));
      }
      const hasVideo = attachments.some((a) => a.file.type.startsWith('video/'));
      const wasReelsOnly = hasVideo && reelsOnly;
      await feedService.createPost({ content, mediaIds: mediaIds.length ? mediaIds : undefined, reelsOnly: wasReelsOnly });
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
      if (completedFirstPostStep) {
        toast({ title: 'Primeira publicação concluída', description: 'Agora seu perfil está completo para começar as conexões.' });
      } else if (wasReelsOnly) {
        toast({ title: 'Vídeo publicado', description: 'Seu vídeo aparecerá somente em Vídeos Curtos, não no feed.' });
      } else {
        toast({ title: 'Publicado', description: 'Seu post foi publicado.' });
      }
      if (firstAccessPostMode) {
        navigate('/feed', { replace: true });
      }
      await reload();
    } catch (e: any) {
      toast({ title: 'Erro ao publicar', description: e?.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsPublishing(false);
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
      toast({ title: 'Experiência publicada', description: 'Seu conto já está visível na aba Experiências.' });
      await reloadExperiences();
    } catch (e: any) {
      toast({ title: 'Erro ao publicar experiência', description: e?.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsPublishingExperience(false);
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
    <div className="w-full min-w-0 overflow-x-hidden pb-24 md:pb-0">
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
      {/* Composer */}
      {feedFilter === 'experiences' ? (
        <Card className="mb-4 glass p-3 sm:mb-6 sm:p-4">
          <div className="space-y-3">
            <Input
              placeholder="Título do conto (opcional)"
              value={experienceTitle}
              onChange={(e) => setExperienceTitle(e.target.value)}
              maxLength={120}
            />
            <div className="relative">
              <Textarea
                placeholder="Descreva sua experiência..."
                value={experienceDescription}
                onChange={(e) => setExperienceDescription(e.target.value)}
                className="min-h-[160px] resize-y rounded-xl border-2 border-primary/15 bg-background px-4 py-3 text-[15px] leading-6 focus-visible:ring-2 focus-visible:ring-primary/40 sm:min-h-[140px] sm:rounded-md sm:border-input sm:text-sm"
                rows={6}
              />
              <span className={cn('absolute bottom-2 right-3 text-xs', experienceDescription.trim().length < 20 ? 'text-muted-foreground' : 'text-green-500')}>
                {experienceDescription.trim().length}/20 mín.
              </span>
            </div>
            {/* Photo previews */}
            {expAttachments.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {expAttachments.map((a, i) => (
                  <div key={a.id} className="relative w-20 h-20">
                    <img src={a.url} className="w-20 h-20 rounded-lg object-cover" />
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
            <div className="flex items-center justify-between">
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
                    setExpAttachments((p) => [...p, ...files.map((f) => ({ id: `${f.name}-${Math.random()}`, file: f, url: URL.createObjectURL(f) }))]);
                    if (expFileInputRef.current) expFileInputRef.current.value = '';
                  }}
                />
              </label>
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
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage src={user?.avatar ? resolveServerUrl(user.avatar) : undefined} />
            <AvatarFallback>{String(user?.name || 'U')[0]}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <Textarea
              ref={composerRef}
              placeholder="O que está pensando?"
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
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
      )}

      <div className="grid min-w-0 gap-4 md:grid-cols-3 md:gap-6">
        {/* Posts Feed */}
        <div className="min-w-0 space-y-4 md:col-span-2 md:space-y-6">
          <Card className="overflow-hidden p-3 glass">
            <div className={cn(
              'flex min-w-0 items-center gap-2',
              feedFilter === 'experiences'
                ? 'flex-wrap'
                : 'flex-nowrap overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
            )}>
              <Button
                type="button"
                size="sm"
                variant={feedFilter === 'all' ? 'secondary' : 'ghost'}
                className="shrink-0"
                onClick={() => setFeedFilter('all')}
              >
                Todos
              </Button>
              <Button
                type="button"
                size="sm"
                variant={feedFilter === 'experiences' ? 'secondary' : 'ghost'}
                className="shrink-0"
                onClick={() => setFeedFilter('experiences')}
              >
                Experiências
              </Button>
              {feedFilter === 'experiences' ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setFeedFilter('all')}
                  className="h-11 basis-full shrink-0 gap-2 rounded-xl bg-gradient-primary px-3 text-center text-sm font-semibold text-white whitespace-normal leading-tight hover:opacity-95 md:hidden"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Voltar para o feed
                </Button>
              ) : null}
              {feedFilter !== 'experiences' ? (
                <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-11 shrink-0 rounded-xl gap-2 border-primary/30 bg-background px-4 text-sm font-medium sm:h-9 sm:rounded-md sm:px-3"
                onClick={() => navigate('/reels')}
              >
                <Clapperboard className="h-4 w-4" />
                Rap
              </Button>
              <Button
                type="button"
                size="sm"
                variant={feedFilter === 'favorites' ? 'default' : 'outline'}
                onClick={() => setFeedFilter('favorites')}
                disabled={favorites.length === 0}
                className={cn(
                  'shrink-0 gap-2',
                  feedFilter === 'favorites'
                    ? 'animate-liked-filter border-0 bg-gradient-primary text-white hover:opacity-95 motion-reduce:animate-none'
                    : 'border-primary/50 bg-primary/5 text-primary hover:bg-primary/10'
                )}
              >
                <Heart className={cn('h-4 w-4', feedFilter === 'favorites' && 'fill-current')} />
                Somente curtidos
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-semibold',
                    feedFilter === 'favorites'
                      ? 'bg-pink-300/30 text-white'
                      : 'bg-pink-500/15 text-pink-600'
                  )}
                >
                  {favorites.length}
                </span>
              </Button>
              {feedFilter === 'favorites' && favorites.length === 0 ? (
                <span className="ml-1 text-sm text-muted-foreground">Adicione curtidos para filtrar.</span>
              ) : null}
                </>
              ) : null}
            </div>
          </Card>
          {feedFilter === 'experiences' ? (
            <>
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
                  <Card key={experience.id} className="overflow-hidden glass">
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
                      <h3 className="text-lg font-bold">{experience.title}</h3>
                      <p className="mt-2 whitespace-pre-wrap text-[0.95rem] leading-6 text-muted-foreground sm:text-base">
                        {experience.description}
                      </p>
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
                        <div className="relative" data-reaction-picker-root="true">
                          <button
                            onMouseDown={() => startExpLikeLongPress(experience.id)}
                            onMouseUp={cancelExpLikeLongPress}
                            onMouseLeave={cancelExpLikeLongPress}
                            onTouchStart={() => startExpLikeLongPress(experience.id)}
                            onTouchEnd={cancelExpLikeLongPress}
                            onTouchCancel={cancelExpLikeLongPress}
                            onClick={() => void handleExpLikeClick(experience)}
                            className={cn(
                              'flex items-center gap-2 transition-colors',
                              experience.likedByMe ? 'text-primary' : 'text-muted-foreground hover:text-primary'
                            )}
                          >
                            <Heart className={cn('w-5 h-5', experience.likedByMe && 'fill-current')} />
                          </button>
                          {openReactionPickerExpId === experience.id ? (
                            <div className="absolute bottom-[calc(100%+8px)] left-0 z-20 min-w-[220px] rounded-xl border border-white/10 bg-black/85 p-2 shadow-lg backdrop-blur-sm">
                              <div className="flex flex-wrap items-center gap-2">
                                {PHOTO_REACTIONS.map((item) => {
                                  const counts = expReactionCounts[experience.id] || EMPTY_REACTION_COUNTS;
                                  const mine = myExpReactions[experience.id] || null;
                                  return (
                                    <button
                                      key={`exp-${experience.id}-${item.id}`}
                                      type="button"
                                      className={cn(
                                        'rounded-full border px-2.5 py-1 text-xs text-white transition-colors',
                                        mine === item.id
                                          ? 'border-primary bg-primary/25'
                                          : 'border-white/15 bg-white/5 hover:bg-white/10'
                                      )}
                                      onClick={() => void reactToExp(experience.id, item.id)}
                                      disabled={!!isLoadingExpReactions[experience.id]}
                                    >
                                      <span className="mr-1">{item.emoji}</span>
                                      <span>{counts[item.id] || 0}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                        </div>
                        {/* Comment button */}
                        <button
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
                                  {REACTION_EMOJI[type] ?? '💜'}
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
          {feedFilter !== 'experiences' && !isLoading && visiblePosts.map((post) => (
            <Card key={post.id} id={`post-${post.id}`} className="overflow-hidden glass">
              {/* Post Header */}
                    <div className="flex items-center justify-between gap-2 p-3 sm:p-4">
                      <Link
                        to={getUserProfileHref(post.author.id, user?.id, '/feed')}
                        className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-90 transition-opacity"
                      >
                  <Avatar className="h-11 w-11 sm:h-10 sm:w-10">
                    <AvatarImage src={post.author.avatar ? resolveServerUrl(post.author.avatar) : undefined} />
                    <AvatarFallback>{String(post.author.name || 'U')[0]}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[0.98rem] font-semibold hover:underline sm:text-base">{post.author.name}</span>
                    </div>
                    {getIdentityLine(post.author) ? (
                      <div className="truncate text-xs text-muted-foreground">{getIdentityLine(post.author)}</div>
                    ) : null}
                    <span className="text-[13px] text-muted-foreground sm:text-sm">{formatWhen(post.createdAt)}</span>
                  </div>
                </Link>
                <div className="flex shrink-0 items-center gap-1">
                  {post.author.id !== user?.id ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-full"
                      onClick={() => void handleToggleFavorite(post.author)}
                      aria-label={isFavorite(String(post.author.id)) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                    >
                      <Star
                        className={cn(
                          'h-4.5 w-4.5',
                          isFavorite(String(post.author.id)) ? 'text-gold fill-current' : 'text-muted-foreground'
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
                <div className="px-3 pb-3 sm:px-4">
                  <p className="text-[0.95rem] leading-6 sm:text-base">{post.content}</p>
                </div>
              ) : null}

              {/* Post Media */}
              {post.media?.length > 0 && (
                <div className="space-y-2 px-3 pb-3 sm:px-4">
                  {post.media.map((m) => (
                    <div key={m.id} className="relative rounded-lg overflow-hidden">
                      {String(m.mimeType || '').startsWith('video/') ? (
                        premiumAccess ? (
                          <div className="w-full" style={aspectStyleForKey(m.id)}>
                            <VideoWithPreview
                              src={resolveMediaUrl(m.url)}
                              className="h-full w-full bg-black object-contain sm:object-cover"
                              controls
                              muted
                              playsInline
                              preload="auto"
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
                            className="h-full w-full bg-black object-contain sm:object-cover"
                            onLoad={(e) => setAspectForKey(m.id, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Post Actions */}
              <div className="flex items-center justify-between border-t p-3 sm:p-4">
                <div className="flex items-center gap-4">
                  {/* Like button with long-press reaction picker */}
                  <div className="relative" data-reaction-picker-root="true">
                    <button
                      onMouseDown={() => startLikeLongPress(post)}
                      onMouseUp={cancelLikeLongPress}
                      onMouseLeave={cancelLikeLongPress}
                      onTouchStart={() => startLikeLongPress(post)}
                      onTouchEnd={cancelLikeLongPress}
                      onTouchCancel={cancelLikeLongPress}
                      onClick={() => void handleLikeButtonClick(post)}
                      className={cn(
                        'flex items-center gap-2 transition-colors',
                        post.likedByMe ? 'text-primary' : 'text-muted-foreground hover:text-primary'
                      )}
                    >
                      <Heart className={cn('w-5 h-5', post.likedByMe && 'fill-current')} />
                    </button>
                    {openReactionPickerPostId === post.id ? (
                      <div className="absolute bottom-[calc(100%+8px)] left-0 z-20 min-w-[220px] rounded-xl border border-white/10 bg-black/85 p-2 shadow-lg backdrop-blur-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          {PHOTO_REACTIONS.map((item) => {
                            const photoId = getPrimaryPhotoId(post);
                            const counts = photoReactionCounts[photoId] || EMPTY_REACTION_COUNTS;
                            const mine = myPhotoReactions[photoId] || null;
                            return (
                              <button
                                key={`${post.id}-${item.id}`}
                                type="button"
                                className={cn(
                                  'rounded-full border px-2.5 py-1 text-xs text-white transition-colors',
                                  mine === item.id
                                    ? 'border-primary bg-primary/25'
                                    : 'border-white/15 bg-white/5 hover:bg-white/10'
                                )}
                                onClick={() => void handleReactFromPost(post, item.id)}
                                disabled={!!isLoadingPhotoReactions[photoId]}
                              >
                                <span className="mr-1">{item.emoji}</span>
                                <span>{counts[item.id] || 0}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Comment button */}
                  <button
                    onClick={() => void toggleComments(post.id)}
                    className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <MessageCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">{post.commentsCount}</span>
                  </button>
                </div>

                {/* Reactions summary — right side */}
                {post.likesCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void openReactionsModal(post.id)}
                    className="flex items-center gap-1.5 rounded-full hover:bg-muted/60 px-2 py-1 transition-colors"
                  >
                    {/* Stacked emoji bubbles */}
                    <div className="flex items-center">
                      {(post.reactions && post.reactions.length > 0
                        ? post.reactions.slice(0, 3)
                        : [{ type: 'heart', count: post.likesCount }]
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
                    <span className="text-sm font-medium text-muted-foreground">{post.likesCount}</span>
                  </button>
                )}
              </div>

              {openCommentsPostId === post.id && (
                <div className="space-y-3 border-t p-3 sm:p-4">
                  {isLoadingComments && <p className="text-sm text-muted-foreground">Carregando comentários...</p>}
                  {!isLoadingComments && (
                    <div className="space-y-3">
                      {(commentsByPostId[post.id] || []).map((c) => (
                        <div key={c.id} className="flex items-start gap-3">
                          <Link
                            to={getUserProfileHref(c.user.id, user?.id, '/feed')}
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
                                to={getUserProfileHref(c.user.id, user?.id, '/feed')}
                                className="text-sm font-medium hover:underline"
                              >
                                {c.user.name}
                              </Link>
                              <span className="text-xs text-muted-foreground">{formatWhen(c.createdAt)}</span>
                              {String(c.user.id) === String(user?.id || '') ? (
                                <div className="ml-auto flex items-center gap-2">
                                  <button
                                    type="button"
                                    className={`${COMMENT_ACTION_BUTTON_BASE} ${COMMENT_ACTION_EDIT_CLASS}`}
                                    onClick={() => startEditingComment(post.id, c)}
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    className={`${COMMENT_ACTION_BUTTON_BASE} ${COMMENT_ACTION_DELETE_CLASS}`}
                                    onClick={() => void deleteComment(post.id, c.id)}
                                  >
                                    Excluir
                                  </button>
                                </div>
                              ) : null}
                            </div>
                            {getIdentityLine(c.user) ? (
                              <div className="text-xs text-muted-foreground">{getIdentityLine(c.user)}</div>
                            ) : null}
                            {editingCommentByPostId[post.id] === c.id ? (
                              <div className="mt-1 flex items-center gap-2">
                                <Input
                                  value={editCommentDraftById[c.id] || ''}
                                  onChange={(e) =>
                                    setEditCommentDraftById((prev) => ({ ...prev, [c.id]: e.target.value }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') void saveEditedComment(post.id, c.id);
                                  }}
                                  className={COMMENT_INLINE_INPUT_CLASS}
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  className={COMMENT_SAVE_BUTTON_CLASS}
                                  onClick={() => void saveEditedComment(post.id, c.id)}
                                  disabled={!(editCommentDraftById[c.id] || '').trim()}
                                >
                                  Salvar
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className={COMMENT_CANCEL_BUTTON_CLASS}
                                  onClick={() => cancelEditingComment(post.id)}
                                >
                                  Cancelar
                                </Button>
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">{c.content}</p>
                            )}
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
                  <div className="flex flex-wrap items-center gap-1.5">
                    {COMMENT_QUICK_EMOJIS.map((emoji) => (
                      <button
                        key={`${post.id}-emoji-${emoji}`}
                        type="button"
                        onClick={() => appendEmojiToCommentDraft(post.id, emoji)}
                        className={COMMENT_EMOJI_CHIP_CLASS}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Card>
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
            if (open || !showProfilePhotoGate) {
              setShowProfilePhotoGate(open);
            }
          }}
        >
          <DialogContent className="sm:max-w-md [&>button]:hidden">
            <div className="space-y-4">
              <div className="space-y-2 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Camera className="h-7 w-7" />
                </div>
                <h2 className="text-xl font-semibold">Adicione sua foto de perfil</h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  Para continuar no feed, envie agora uma foto principal para o seu perfil.
                </p>
              </div>

              <div className="rounded-2xl border bg-secondary/20 p-4 text-sm text-muted-foreground">
                Sua conta já foi criada. Falta só essa etapa para liberar a navegação normalmente.
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

        {/* Sidebar */}
        <div className="hidden md:block space-y-6">
          {!premiumAccess && (
            <Card className="p-4 bg-gradient-to-br from-gold/20 to-primary/20 border-gold/30">
              <Badge className="bg-gold text-black mb-3">Premium</Badge>
              <h3 className="font-semibold mb-2">Destaque seu perfil</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Apareça mais e tenha acesso a recursos exclusivos.
              </p>
              <Button asChild className="w-full bg-gold text-black hover:bg-gold/90">
                <Link to="/subscriptions">Ver Planos</Link>
              </Button>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

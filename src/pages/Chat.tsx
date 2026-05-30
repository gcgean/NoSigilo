import { useEffect, useMemo, useState, useRef, useCallback, Suspense, lazy } from 'react';
import { Search, Send, Phone, Video, MoreVertical, ArrowLeft, Image, Smile, Lock, Check, CheckCheck, Zap, Eye, EyeOff, X, Trash2, User, WifiOff, MessageCircle, Pin, Copy, HeartHandshake } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/UserAvatar';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { chatService, profileService } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { resolveServerUrl } from '@/utils/serverUrl';
const EmojiPicker = lazy(() => import('emoji-picker-react').then(m => ({ default: m.default })));
import { formatProfileIdentityLine } from '@/utils/profileIdentity';
import { hasPremiumAccess } from '@/utils/premium';
import { useProfileGate } from '@/contexts/ProfileGateContext';
import VideoWithPreview from '@/components/VideoWithPreview';
import MobileState from '@/components/MobileState';
import ReferralPaywallModal from '@/components/ReferralPaywallModal';
import { getUserProfileHref } from '@/utils/userProfileNavigation';
import { useActivityTracker } from '@/contexts/ActivityTrackerContext';

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';

type Conversation = {
  id: string;
  user: { id: string; name: string; avatar?: string | null; gender?: string | null; city?: string | null; state?: string | null; distanceKm?: number | null; isOnline?: boolean; lastSeenAt?: string | null };
  createdAt?: string;
  lastMessageAt?: string | null;
  unreadCount?: number;
  isHighlighted?: boolean;
  highlightNote?: string | null;
  highlightColor?: 'rose' | 'amber' | 'violet' | 'sky' | null;
};

function formatLastSeen(lastSeenAt: string | null | undefined, isOnline?: boolean): string {
  if (isOnline) return 'Online agora';
  if (!lastSeenAt) return '';
  const diff = Date.now() - new Date(lastSeenAt).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 2) return 'Visto agora há pouco';
  if (minutes < 60) return `Visto há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Visto há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Visto ontem';
  if (days < 7) return `Visto há ${days} dias`;
  return '';
}

function generateIceBreakers(
  partnerName: string,
  partnerCity: string | null | undefined,
  myCity: string | undefined,
): string[] {
  const first = partnerName.split(' ')[0];
  const spicy = [
    `Oi ${first}! Vi seu perfil e fiquei bem curioso(a)... posso te fazer algumas perguntas? 😏`,
    `${first}, seu perfil me deixou com bastante vontade de te conhecer melhor 🔥`,
    `Oi ${first}! Direto ao ponto: gostei muito do que vi e quero saber se a química existe 😈`,
    `${first}, tenho algumas fantasias que adoraria compartilhar com alguém como você… topa? 🌶️`,
    `Oi ${first}! Você parece exatamente o tipo de pessoa que eu estava procurando 😍`,
    `${first}, o que você estaria disposto(a) a experimentar com alguém novo? Pergunto por curiosidade 😏`,
  ];
  const suggestions: string[] = [];
  if (partnerCity && myCity && partnerCity.toLowerCase() === myCity.toLowerCase()) {
    suggestions.push(`Oi ${first}! Somos da mesma cidade — acho que o destino quis que nos encontrássemos 😏`);
  } else if (partnerCity) {
    suggestions.push(`Oi ${first}! ${partnerCity} deve ser uma cidade boa para quem curte aventuras 🔥`);
  }
  // fill remaining slots with spicy suggestions (shuffled)
  const shuffled = spicy.sort(() => Math.random() - 0.5);
  for (const s of shuffled) {
    if (suggestions.length >= 4) break;
    suggestions.push(s);
  }
  return suggestions.slice(0, 4);
}

type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  mediaId?: string | null;
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  isViewOnce?: boolean;
  isViewed?: boolean;
  isDelivered?: boolean;
  isRead?: boolean;
  isLocked?: boolean;
  isDeletedForAll?: boolean;
  isDeletedForMe?: boolean;
  createdAt: string;
  isSending?: boolean;
  clientId?: string;
};

const HIGHLIGHT_COLORS: Array<{ id: 'rose' | 'amber' | 'violet' | 'sky'; label: string; className: string; borderColor: string }> = [
  { id: 'rose', label: 'Rosa', className: 'bg-rose-50/70', borderColor: '#f43f5e' },
  { id: 'amber', label: 'Âmbar', className: 'bg-amber-50/70', borderColor: '#f59e0b' },
  { id: 'violet', label: 'Violeta', className: 'bg-violet-50/70', borderColor: '#8b5cf6' },
  { id: 'sky', label: 'Azul', className: 'bg-sky-50/70', borderColor: '#0ea5e9' },
];

function getHighlightColorMeta(color?: 'rose' | 'amber' | 'violet' | 'sky' | null) {
  return HIGHLIGHT_COLORS.find((item) => item.id === color) || HIGHLIGHT_COLORS[0];
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function isMutualMatchSystemMessage(message: Message) {
  return !message.mediaId && String(message.content || '').trim() === 'Vocês se curtiram mutuamente. Agora podem conversar por aqui.';
}

function formatDistanceLabel(distanceKm?: number | null) {
  const value = Number(distanceKm);
  if (!Number.isFinite(value) || value < 0) return '';
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: value % 1 === 0 ? 0 : 1, maximumFractionDigits: 1 })} km de você`;
}

export default function Chat() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { emit, on, off, isConnected } = useSocket();
  const { toast } = useToast();
  const { registerActivity } = useActivityTracker();
  const location = useLocation();
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [selectedConversationSnapshot, setSelectedConversationSnapshot] = useState<Conversation | null>(null);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [conversationTab, setConversationTab] = useState<'all' | 'unread' | 'new'>('all');
  const [messageSearch, setMessageSearch] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [showOnlyHighlighted, setShowOnlyHighlighted] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isViewOnceEnabled, setIsViewOnceEnabled] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ messageId: string; x: number; y: number } | null>(null);
  const [confirmDeleteConv, setConfirmDeleteConv] = useState(false);
  // Long-press menu na lista de conversas
  const [convListMenu, setConvListMenu] = useState<{ id: string; name: string } | null>(null);
  const convLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [highlightDialogOpen, setHighlightDialogOpen] = useState(false);
  const [highlightNoteDraft, setHighlightNoteDraft] = useState('');
  const [highlightColorDraft, setHighlightColorDraft] = useState<'rose' | 'amber' | 'violet' | 'sky'>('rose');
  const [isSavingHighlight, setIsSavingHighlight] = useState(false);
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null); // for auto-scroll-to-bottom
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Capture touch coords at touch-start so they're available when timer fires
  const touchCoords = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const selectedConversation = conversations.find((c) => c.id === selectedChat);
  const activeConversation =
    selectedConversation ?? (selectedConversationSnapshot?.id === selectedChat ? selectedConversationSnapshot : null);
  const premiumAccess = hasPremiumAccess(user);
  const { requireFields } = useProfileGate();
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  // Tracks whether the sm: breakpoint (640px) is active – needed for header height (3.5rem vs 4rem)
  const [isSmMobile, setIsSmMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 640 : false
  );
  // Dynamically computed style for the outer chat container on mobile.
  // Uses position:fixed + visualViewport tracking so the chat correctly
  // shrinks/moves when the on-screen keyboard appears on iOS and Android.
  const [mobileStyle, setMobileStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    const onChange = () => setIsMobileViewport(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 640px)');
    const onChange = () => setIsSmMobile(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  // ─── Mobile layout: visualViewport-aware positioning ───────────────────────
  // Problem: on iOS Safari, when the on-screen keyboard opens the layout
  // viewport does NOT shrink. The browser may also scroll the page to keep the
  // focused input visible, shifting our sticky/fixed elements out of view.
  //
  // Fix: when a conversation is open on mobile, switch the outer container to
  // position:fixed and re-compute its top/height from visualViewport every time
  // the viewport resizes or scrolls (i.e., every time the keyboard
  // appears/disappears). This keeps the chat panel pixel-perfect within the
  // visible screen area regardless of keyboard state. See the selectedChat
  // branch comments below for a full explanation of the iOS Safari quirk and fix.
  //
  // For the conversation list (no selected chat) we keep the CSS-calc approach
  // because the user isn't typing and keyboard interactions there are brief.
  useEffect(() => {
    if (!isMobileViewport) {
      setMobileStyle({});
      return;
    }

    // Header height in px: h-14 (56 px) below 640 px, sm:h-16 (64 px) above.
    const headerPx = isSmMobile ? 64 : 56;
    const headerRem = isSmMobile ? '4rem' : '3.5rem';

    const vv = window.visualViewport;

    const update = () => {
      const viewport = window.visualViewport;
      const vh = viewport ? viewport.height : window.innerHeight;
      const vLeft = viewport ? Math.round(viewport.offsetLeft) : 0;
      const vWidth = viewport ? Math.round(viewport.width) : window.innerWidth;

      if (selectedChat) {
        // Conversation open → full-screen fixed panel, keyboard-aware.
        //
        // iOS Safari problem with the previous approach (top: headerPx, height: vh - headerPx):
        //   position:fixed on iOS is relative to the LAYOUT viewport, not the visual
        //   viewport. When the keyboard opens, iOS internally scrolls the page to keep
        //   the focused input visible. That scroll shifts the layout viewport origin,
        //   so our `top: 56px` container ends up rendered at the wrong position —
        //   input bar appears at the top, messages area appears mostly off-screen.
        //
        // Fix: anchor to top:0 / bottom:0 (always covers full screen height in the
        //   layout viewport), then use paddingBottom equal to the keyboard height so
        //   the *content* stays above the keyboard. zIndex:60 covers the Layout header
        //   (z-40) for a true full-screen chat experience on mobile.
        //   paddingTop:env(safe-area-inset-top) protects content from the notch/island.
        const kbHeight = Math.max(0, window.innerHeight - Math.round(vh));
        // When the keyboard is open kbHeight pushes content above it.
        // When the keyboard is closed kbHeight ≈ 0, but we still need to keep
        // the input bar above the iPhone home indicator (~34 px on modern iPhones).
        // Using env(safe-area-inset-bottom) for this avoids double-counting
        // because iOS includes the home-indicator zone inside the keyboard footprint
        // when kbHeight is calculated, so the two branches are mutually exclusive.
        const bottomPad: React.CSSProperties['paddingBottom'] =
          kbHeight > 0 ? kbHeight : 'env(safe-area-inset-bottom, 0px)';
        setMobileStyle({
          position: 'fixed',
          top: 0,
          bottom: 0,
          left: vLeft,
          width: Math.max(vWidth, 280),
          maxWidth: '100vw',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: bottomPad,
          boxSizing: 'border-box',
          zIndex: 60,
          overflowX: 'hidden',
        });
      } else {
        // Conversation list on iPhone Safari also needs visual viewport tracking,
        // otherwise the bottom browser bar can leave an empty clipped area.
        setMobileStyle({
          position: 'relative',
          top: 0,
          left: 0,
          width: '100%',
          height: Math.max(Math.floor(vh) - headerPx - 56, 260),
          maxHeight: `calc(var(--vh, 100dvh) - ${headerRem} - 3.5rem - env(safe-area-inset-bottom, 0px))`,
          overflowX: 'hidden',
        });
      }
    };

    if (vv) {
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update);
    }
    window.addEventListener('resize', update);
    update(); // run immediately

    return () => {
      const vv2 = window.visualViewport;
      if (vv2) {
        vv2.removeEventListener('resize', update);
        vv2.removeEventListener('scroll', update);
      }
      window.removeEventListener('resize', update);
      setMobileStyle({});
    };
  }, [isMobileViewport, selectedChat, isSmMobile]);

  // Lock page scroll while a conversation is open on mobile so iOS can't scroll
  // the page under our fixed chat panel when the keyboard appears.
  useEffect(() => {
    const lock = isMobileViewport && !!selectedChat;
    if (lock) {
      // Reset horizontal scroll before locking so the fixed chat panel
      // aligns correctly with the viewport left edge (scrollX must be 0).
      window.scrollTo(0, window.scrollY);
      document.documentElement.style.overflow = 'hidden';
      document.documentElement.style.overflowX = 'hidden';
      document.body.style.overflow = 'hidden';
      document.body.style.overflowX = 'hidden';
    } else {
      document.documentElement.style.overflow = '';
      document.documentElement.style.overflowX = '';
      document.body.style.overflow = '';
      document.body.style.overflowX = '';
    }
    return () => {
      document.documentElement.style.overflow = '';
      document.documentElement.style.overflowX = '';
      document.body.style.overflow = '';
      document.body.style.overflowX = '';
    };
  }, [isMobileViewport, selectedChat]);
  // ───────────────────────────────────────────────────────────────────────────

  // When a conversation is open on mobile, signal Layout to hide the bottom nav so
  // the chat can use the full screen (keyboard-aware via --vh CSS variable).
  useEffect(() => {
    if (selectedChat && isMobileViewport) {
      document.body.setAttribute('data-chat-open', '1');
    } else {
      document.body.removeAttribute('data-chat-open');
    }
    return () => {
      document.body.removeAttribute('data-chat-open');
    };
  }, [selectedChat, isMobileViewport]);

  const redirectToPlans = () => {
    setPaywallOpen(true);
  };

  const goToUserProfile = (userId?: string) => {
    navigate(getUserProfileHref(userId, user?.id, '/chat'));
  };

  // Scroll to bottom when messages change – uses native scrollTop on the container div
  // (avoids the Radix ScrollArea port-scrolling issue on iOS/Android)
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  // When the keyboard opens/closes on mobile the messages container shrinks/grows.
  // If the user was already at the bottom, keep them there so the latest message
  // stays visible instead of getting clipped at the bottom edge.
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 60;
      if (atBottom) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const adjustMessageInputHeight = () => {
    const el = messageInputRef.current;
    if (!el) return;
    el.style.height = '0px';
    const lineHeight = 20;
    const minHeight = 24;
    const maxHeight = lineHeight * 3;
    const next = Math.max(minHeight, Math.min(el.scrollHeight, maxHeight));
    el.style.height = `${next}px`;
  };

  useEffect(() => {
    adjustMessageInputHeight();
  }, [message]);

  const unreadConversationsCount = useMemo(() => {
    return conversations.filter(c => (c.unreadCount || 0) > 0).length;
  }, [conversations]);

  const isConversationNew = useCallback((conversation: Conversation) => {
    const baseDate = conversation.lastMessageAt || conversation.createdAt;
    if (!baseDate) return false;
    const timestamp = new Date(baseDate).getTime();
    if (Number.isNaN(timestamp)) return false;
    return Date.now() - timestamp <= 24 * 60 * 60 * 1000;
  }, []);

  const unreadTabCount = useMemo(
    () => conversations.filter((c) => (c.unreadCount || 0) > 0).length,
    [conversations]
  );

  const newTabCount = useMemo(
    () => conversations.filter((c) => isConversationNew(c) && (c.unreadCount || 0) > 0).length,
    [conversations, isConversationNew]
  );

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (conversationTab === 'unread' && (c.unreadCount || 0) <= 0) return false;
      if (conversationTab === 'new' && !(isConversationNew(c) && (c.unreadCount || 0) > 0)) return false;
      if (showOnlyHighlighted && !c.isHighlighted) return false;
      if (!q) return true;
      return (
        c.user?.name?.toLowerCase().includes(q) ||
        (c.highlightNote || '').toLowerCase().includes(q)
      );
    });
  }, [search, conversations, showOnlyHighlighted, conversationTab, isConversationNew]);

  const filteredMessages = useMemo(() => {
    const q = messageSearch.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) => String(m.content || '').toLowerCase().includes(q));
  }, [messages, messageSearch]);
  const getIdentityLine = (profile?: { gender?: string | null; city?: string | null; state?: string | null } | null) =>
    formatProfileIdentityLine(profile);

  const loadConversations = useCallback(async () => {
    if (USE_MOCKS) return;
    setIsLoadingConversations(true);
    try {
      const data = await chatService.getConversations();
      setConversations(Array.isArray(data) ? data : []);
    } catch {
      toast({ title: 'Erro ao carregar conversas', description: 'Tente novamente.', variant: 'destructive' });
      setConversations([]);
    } finally {
      setIsLoadingConversations(false);
    }
  }, [toast]);

  useEffect(() => {
    if (USE_MOCKS) return;
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    const stateConversationId = (location.state as any)?.conversationId ? String((location.state as any).conversationId) : '';
    const queryConversationId = new URLSearchParams(location.search).get('conversationId') || '';
    const conversationId = stateConversationId || queryConversationId;
    if (!conversationId) return;
    setSelectedChat(conversationId);
  }, [location.state, location.search]);

  // Abre ou cria conversa diretamente quando ?userId= está na URL (ex: "Mandar msg" nos Stories)
  useEffect(() => {
    const targetUserId = new URLSearchParams(location.search).get('userId');
    if (!targetUserId) return;
    (async () => {
      try {
        const data = await chatService.createConversation(targetUserId);
        if (data?.id) {
          await loadConversations();
          setSelectedChat(data.id);
        }
      } catch {
        // falha silenciosa — usuário continua na lista de conversas
      }
    })();
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedChat) {
      setSelectedConversationSnapshot(null);
      return;
    }
    if (selectedConversation) {
      setSelectedConversationSnapshot(selectedConversation);
    }
  }, [selectedChat, selectedConversation]);

  useEffect(() => {
    if (USE_MOCKS) return;
    if (!selectedChat || !user?.id) return;
    setMessageSearch('');
    setShowMessageSearch(false);
    
    // Reset unread count locally
    setConversations(prev => prev.map(c => 
      c.id === selectedChat ? { ...c, unreadCount: 0 } : c
    ));

    emit('join.conversation', selectedChat);
    
    // Mark as read in backend
    chatService.markAsRead(selectedChat).catch(() => {});

    let cancelled = false;
    setIsLoadingMessages(true);
    chatService
      .getMessages(selectedChat)
      .then((data) => {
        if (cancelled) return;
        setMessages(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (cancelled) return;
        toast({ title: 'Erro ao carregar mensagens', description: 'Tente novamente.', variant: 'destructive' });
        setMessages([]);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoadingMessages(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedChat, emit, toast, loadConversations, user?.id]);

  useEffect(() => {
    if (USE_MOCKS) return;
    const handler = async (msg: Message) => {
      if (!msg) return;
      
      // Update conversations list with unread count and move to top
      setConversations(prev => {
        const index = prev.findIndex(c => c.id === msg.conversationId);
        
        if (index === -1) {
          // If conversation not found, we should fetch it or just reload the list
          void loadConversations();
          return prev;
        }
        
        const updated = [...prev];
        const conv = updated[index];
        
        if (msg.conversationId !== selectedChat) {
          updated[index] = { ...conv, unreadCount: (conv.unreadCount || 0) + 1 };
          
          // Notify user about new message in another conversation
          if (msg.senderId !== user?.id) {
            toast({
              title: `Nova mensagem de ${conv.user.name}`,
              description: msg.content || (msg.mediaId ? 'Mídia enviada' : 'Nova mensagem'),
              onClick: () => setSelectedChat(msg.conversationId)
            });
          }
        }
        
        // Move to top
        const [removed] = updated.splice(index, 1);
        updated.unshift(removed);
        
        return updated;
      });

      if (msg.conversationId !== selectedChat) return;
      
      // If receiver gets a message in the active chat, mark as read immediately
      if (msg.senderId !== user?.id) {
        chatService.markAsRead(selectedChat).catch(() => {});
      }

      setMessages((prev) => {
        // If we have a message with the same ID, don't add
        if (prev.some((m) => m.id === msg.id)) return prev;
        
        // If we have a message with the same clientId, replace it
        if (msg.clientId && prev.some(m => m.clientId === msg.clientId)) {
          return prev.map(m => m.clientId === msg.clientId ? msg : m);
        }

        return [...prev, msg];
      });
    };

    const readHandler = ({ conversationId, readerId }: { conversationId: string; readerId: string }) => {
      if (conversationId === selectedChat && readerId !== user?.id) {
        setMessages(prev => prev.map(m => 
          m.senderId === user?.id ? { ...m, isRead: true } : m
        ));
      }
    };

    const viewedHandler = ({ messageId, conversationId }: { messageId: string; conversationId: string }) => {
      if (conversationId === selectedChat) {
        setMessages(prev => prev.map(m =>
          m.id === messageId ? { ...m, isViewed: true } : m
        ));
      }
    };

    const deletedHandler = ({ messageId, conversationId, forEveryone }: { messageId: string; conversationId: string; forEveryone: boolean }) => {
      if (conversationId === selectedChat && forEveryone) {
        setMessages(prev => prev.map(m =>
          m.id === messageId ? { ...m, isDeletedForAll: true, isDeletedForMe: true, content: null, mediaId: null, mediaUrl: null } : m
        ));
      }
    };

    on('message.created', handler);
    on('message.new', handler);
    on('message.read', readHandler);
    on('message.viewed', viewedHandler);
    on('message.deleted', deletedHandler);
    return () => {
      off('message.created', handler);
      off('message.new', handler);
      off('message.read', readHandler);
      off('message.viewed', viewedHandler);
      off('message.deleted', deletedHandler);
    };
  }, [on, off, selectedChat, user?.id]);

  const handleDeleteMessage = useCallback(async (messageId: string, forEveryone: boolean) => {
    setContextMenu(null);
    try {
      await chatService.deleteMessage(messageId, forEveryone);
      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? {
              ...m,
              isDeletedForMe: true,
              isDeletedForAll: forEveryone ? true : m.isDeletedForAll,
              content: null,
              mediaId: null,
              mediaUrl: null,
            }
          : m
      ));
    } catch {
      toast({ title: 'Não foi possível apagar a mensagem', variant: 'destructive' });
    }
  }, [toast]);

  const handleCopyMessageText = useCallback(async (messageId: string) => {
    const messageToCopy = messages.find((messageItem) => messageItem.id === messageId);
    const text = String(messageToCopy?.content || '').trim();
    setContextMenu(null);
    if (!text) {
      toast({ title: 'Nada para copiar', description: 'Essa mensagem não possui texto.', variant: 'destructive' });
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Texto copiado' });
    } catch {
      toast({ title: 'Não foi possível copiar', description: 'Tente novamente.', variant: 'destructive' });
    }
  }, [messages, toast]);

  const openContextMenu = useCallback((e: React.MouseEvent, messageId: string) => {
    e.preventDefault();
    setContextMenu({ messageId, x: e.clientX, y: e.clientY });
  }, []);

  const startLongPress = useCallback((e: React.TouchEvent, messageId: string) => {
    // Capture coords NOW (before timer fires and touches collection clears)
    touchCoords.current = {
      x: e.touches[0]?.clientX ?? 0,
      y: e.touches[0]?.clientY ?? 0,
    };
    longPressTimer.current = setTimeout(() => {
      setContextMenu({ messageId, x: touchCoords.current.x, y: touchCoords.current.y });
    }, 600);
  }, []);

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleSendMessage = async (content?: string, mediaId?: string, localUrl?: string) => {
    if (!premiumAccess) {
      redirectToPlans();
      return;
    }
    const profileOk = await requireFields(['photo', 'birthDate']);
    if (!profileOk) return;
    if (!content?.trim() && !mediaId) return;
    if (!selectedChat) return;
    if (USE_MOCKS) {
      setMessage('');
      return;
    }

    const clientId = Math.random().toString(36).substring(7);
    const msgContent = content?.trim() || null;
    
    // Optimistic update
    const tempMsg: Message = {
      id: `temp-${clientId}`,
      clientId,
      conversationId: selectedChat,
      senderId: user?.id || 'me',
      content: msgContent,
      mediaId: mediaId || null,
      mediaUrl: localUrl || null,
      isViewOnce: isViewOnceEnabled,
      isDelivered: false,
      isRead: false,
      isSending: true,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempMsg]);
    if (!mediaId) setMessage('');

    try {
      const sent = await chatService.sendMessage(selectedChat, { 
        content: msgContent || undefined, 
        mediaId: mediaId || undefined,
        clientId,
        isViewOnce: isViewOnceEnabled 
      });
      
      if (sent?.id) {
        setMessages(prev => prev.map(m =>
          m.clientId === clientId ? { ...m, id: String(sent.id), isSending: false, isDelivered: true } : m
        ));
        setIsViewOnceEnabled(false);
        registerActivity('message');
      }
    } catch {
      setMessages(prev => prev.filter(m => m.clientId !== clientId));
      toast({ title: 'Não foi possível enviar', description: 'Tente novamente.', variant: 'destructive' });
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!premiumAccess) {
      redirectToPlans();
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    const localUrl = URL.createObjectURL(file);
    setIsUploading(true);
    try {
      const { id } = await profileService.uploadMedia(file, { source: 'chat' });
      await handleSendMessage(undefined, id, localUrl);
    } catch (err) {
      // Revoke the blob URL if we never managed to send it
      URL.revokeObjectURL(localUrl);
      toast({
        title: 'Erro no upload',
        description: err instanceof Error ? err.message : 'Tente novamente.',
        variant: 'destructive'
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteConversation = async () => {
    if (!selectedChat) return;
    try {
      await chatService.deleteConversation(selectedChat);
      setConversations(prev => prev.filter(c => c.id !== selectedChat));
      setSelectedChat(null);
      setMessages([]);
      setConfirmDeleteConv(false);
      toast({ title: 'Conversa apagada' });
    } catch {
      setConfirmDeleteConv(false);
      toast({ title: 'Erro ao apagar conversa', variant: 'destructive' });
    }
  };

  // Long-press handlers para a lista de conversas
  const startConvLongPress = (conv: Conversation) => {
    convLongPressTimer.current = setTimeout(() => {
      setConvListMenu({ id: conv.id, name: conv.user.name });
    }, 500);
  };
  const cancelConvLongPress = () => {
    if (convLongPressTimer.current) {
      clearTimeout(convLongPressTimer.current);
      convLongPressTimer.current = null;
    }
  };

  const handleDeleteConvFromList = async (convId: string) => {
    setConvListMenu(null);
    try {
      await chatService.deleteConversation(convId);
      setConversations(prev => prev.filter(c => c.id !== convId));
      if (selectedChat === convId) { setSelectedChat(null); setMessages([]); }
      toast({ title: 'Conversa apagada' });
    } catch {
      toast({ title: 'Erro ao apagar conversa', variant: 'destructive' });
    }
  };

  const openHighlightDialog = () => {
    if (!selectedConversation) return;
    setHighlightNoteDraft(selectedConversation.highlightNote || '');
    setHighlightColorDraft(selectedConversation.highlightColor || 'rose');
    setHighlightDialogOpen(true);
  };

  const handleSaveConversationHighlight = async () => {
    if (!selectedConversation) return;
    setIsSavingHighlight(true);
    try {
      await chatService.updateConversationHighlight(selectedConversation.id, {
        highlighted: true,
        note: highlightNoteDraft.trim() || null,
        color: highlightColorDraft,
      });
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === selectedConversation.id
            ? {
                ...conversation,
                isHighlighted: true,
                highlightNote: highlightNoteDraft.trim() || null,
                highlightColor: highlightColorDraft,
              }
            : conversation
        )
      );
      setHighlightDialogOpen(false);
      toast({ title: 'Conversa destacada' });
      void loadConversations();
    } catch {
      toast({ title: 'Erro ao destacar conversa', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsSavingHighlight(false);
    }
  };

  const handleRemoveConversationHighlight = async () => {
    if (!selectedConversation) return;
    try {
      await chatService.updateConversationHighlight(selectedConversation.id, {
        highlighted: false,
      });
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === selectedConversation.id
            ? { ...conversation, isHighlighted: false, highlightNote: null, highlightColor: null }
            : conversation
        )
      );
      toast({ title: 'Destaque removido' });
      void loadConversations();
    } catch {
      toast({ title: 'Erro ao remover destaque', description: 'Tente novamente.', variant: 'destructive' });
    }
  };

  return (
    <div
      className={cn(
        "flex w-full min-h-0 max-w-full md:overflow-hidden md:h-[calc(100dvh-8.5rem)] md:min-h-[28rem]",
        // On mobile with a conversation open the container is position:fixed
        // – no overflow-hidden needed (the fixed bounds contain children) and
        // it would clip the input bar's box-shadow at the bottom edge.
        !isMobileViewport && "overflow-hidden"
      )}
      style={isMobileViewport ? mobileStyle : undefined}
    >
      {/* Conversations List */}
      <div className={cn(
        "w-full md:w-80 border-r flex flex-col",
        selectedChat && "hidden md:flex"
      )}>
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold">Mensagens</h1>
            {unreadConversationsCount > 0 && (
              <Badge variant="destructive" className="rounded-full">
                {unreadConversationsCount} {unreadConversationsCount === 1 ? 'conversa' : 'conversas'}
              </Badge>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar conversas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={conversationTab === 'all' ? 'default' : 'outline'}
              className="h-8 rounded-full px-3 text-xs"
              onClick={() => setConversationTab('all')}
            >
              Todas
            </Button>
            <Button
              type="button"
              size="sm"
              variant={conversationTab === 'unread' ? 'default' : 'outline'}
              className="h-8 rounded-full px-3 text-xs"
              onClick={() => setConversationTab('unread')}
            >
              Não lidas
              <span className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]", conversationTab === 'unread' ? "bg-primary-foreground/20" : "bg-muted")}>
                {unreadTabCount}
              </span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant={conversationTab === 'new' ? 'default' : 'outline'}
              className="h-8 rounded-full px-3 text-xs"
              onClick={() => setConversationTab('new')}
            >
              Novas
              <span className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]", conversationTab === 'new' ? "bg-primary-foreground/20" : "bg-muted")}>
                {newTabCount}
              </span>
            </Button>
          </div>
          <div className="mt-3 flex items-center">
            <Button
              type="button"
              size="sm"
              variant={showOnlyHighlighted ? 'default' : 'outline'}
              className={cn(
                "h-8 rounded-full px-3 text-xs",
                showOnlyHighlighted ? "bg-primary text-primary-foreground" : ""
              )}
              onClick={() => setShowOnlyHighlighted((prev) => !prev)}
            >
              <Pin className="mr-1.5 h-3.5 w-3.5" />
              Somente destacadas
              <span className={cn("ml-2 rounded-full px-1.5 py-0.5 text-[10px]", showOnlyHighlighted ? "bg-primary-foreground/20" : "bg-muted")}>
                {conversations.filter((c) => c.isHighlighted).length}
              </span>
            </Button>
          </div>
        </div>

        {/* Native div – Radix ScrollArea has known issues with dynamic height on iOS/Android */}
        <div
          className="flex-1 overflow-y-auto overscroll-y-contain"
          style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {isLoadingConversations && (
            <div className="p-3 sm:p-4">
              <MobileState
                loading
                title="Carregando conversas"
                description="Buscando suas mensagens mais recentes."
              />
            </div>
          )}
          {!isLoadingConversations && filteredConversations.length === 0 ? (
            <div className="p-3 sm:p-4">
              <MobileState
                icon={MessageCircle}
                title="Nenhuma conversa por aqui"
                description="Quando alguém falar com você, a conversa aparece nesta lista."
              />
            </div>
          ) : null}
          {!isLoadingConversations && (USE_MOCKS ? [] : filteredConversations).map((conversation) => {
            const highlightMeta = getHighlightColorMeta(conversation.highlightColor);
            return (
              <div
              key={conversation.id}
              onClick={() => { cancelConvLongPress(); setSelectedChat(conversation.id); }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') setSelectedChat(conversation.id); }}
              onTouchStart={() => startConvLongPress(conversation)}
              onTouchEnd={cancelConvLongPress}
              onTouchMove={cancelConvLongPress}
              onMouseDown={() => startConvLongPress(conversation)}
              onMouseUp={cancelConvLongPress}
              onMouseLeave={cancelConvLongPress}
              className={cn(
                "w-full border-b p-3 flex items-center gap-3 hover:bg-secondary/50 transition-colors sm:p-4",
                selectedChat === conversation.id && "bg-secondary",
                conversation.isHighlighted && highlightMeta.className
              )}
              style={conversation.isHighlighted ? { borderLeft: `3px solid ${highlightMeta.borderColor}` } : undefined}
            >
              <div className="relative">
                <UserAvatar user={conversation.user} className="h-11 w-11 sm:h-10 sm:w-10" />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {conversation.isHighlighted ? (
                      <Pin className="h-3.5 w-3.5 shrink-0 text-primary" />
                    ) : null}
                    <span className="truncate pr-2 text-[0.98rem] font-medium sm:text-base">
                      {conversation.user.name}
                    </span>
                  </div>
                  {conversation.unreadCount && conversation.unreadCount > 0 && (
                    <Badge variant="destructive" className="flex h-5 min-w-[1.2rem] items-center justify-center rounded-full px-1 text-[10px] font-semibold">
                      {conversation.unreadCount}
                    </Badge>
                  )}
                </div>
                {getIdentityLine(conversation.user) ? (
                  <p className="text-xs truncate text-muted-foreground">{getIdentityLine(conversation.user)}</p>
                ) : null}
                {conversation.isHighlighted && conversation.highlightNote ? (
                  <p className="text-xs truncate text-primary font-medium">
                    {conversation.highlightNote}
                  </p>
                ) : null}
                <p className={cn(
                  "truncate text-[13px] sm:text-sm",
                  conversation.unreadCount && conversation.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground"
                )}>
                  {conversation.unreadCount && conversation.unreadCount > 0 ? 'Nova mensagem' : 'Toque para abrir'}
                </p>
              </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chat Area */}
      {selectedChat ? (
        <div className="flex w-full min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden bg-background">
          {/* Chat Header */}
          <div className="z-20 flex w-full min-w-0 max-w-full shrink-0 items-center justify-between border-b bg-background/95 px-2.5 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:static md:glass md:p-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-8.5 w-8.5 shrink-0 rounded-full md:hidden"
                onClick={() => {
                  // Dismiss the keyboard BEFORE clearing selectedChat so iOS
                  // doesn't trigger a simultaneous keyboard-close + layout-change
                  // that can swallow the state update and appear to "do nothing".
                  if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                  }
                  setSelectedChat(null);
                }}
              >
                <ArrowLeft className="w-4.5 h-4.5" />
              </Button>
              <div className="shrink-0">
                <UserAvatar user={activeConversation?.user} className="h-9 w-9 sm:h-10 sm:w-10" />
              </div>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    className="truncate text-left text-[15px] font-semibold leading-5 hover:underline"
                    onClick={() => goToUserProfile(activeConversation?.user.id)}
                  >
                    {activeConversation?.user.name || 'Conversa'}
                  </button>
                  {!isConnected && (
                    <WifiOff
                      className="w-3 h-3 text-destructive animate-pulse"
                      aria-label="Desconectado"
                    />
                  )}
                </div>
                <span className="block truncate text-[11px] leading-4 text-muted-foreground">
                  {getIdentityLine(activeConversation?.user) || 'Chat'}
                </span>
                {formatLastSeen(activeConversation?.user.lastSeenAt, activeConversation?.user.isOnline) ? (
                  <span className={cn(
                    "block truncate text-[11px] leading-4 font-medium",
                    activeConversation?.user.isOnline ? "text-success" : "text-muted-foreground"
                  )}>
                    {formatLastSeen(activeConversation?.user.lastSeenAt, activeConversation?.user.isOnline)}
                  </span>
                ) : formatDistanceLabel(activeConversation?.user.distanceKm) ? (
                  <span className="block truncate text-[11px] leading-4 font-medium text-primary">
                    {formatDistanceLabel(activeConversation?.user.distanceKm)}
                  </span>
                ) : null}
                {activeConversation?.isHighlighted && activeConversation.highlightNote ? (
                  <span className="block truncate text-[11px] leading-4 font-medium text-primary">
                    {activeConversation.highlightNote}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8.5 w-8.5 rounded-full"
                onClick={() => toast({ title: '🎙️ Em breve', description: 'Chamadas de voz estão chegando em breve.' })}
              >
                <Phone className="h-4.5 w-4.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="hidden h-8.5 w-8.5 rounded-full sm:inline-flex"
                onClick={() => toast({ title: '📹 Em breve', description: 'Chamadas de vídeo estão chegando em breve.' })}
              >
                <Video className="h-4.5 w-4.5" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8.5 w-8.5 rounded-full">
                    <MoreVertical className="h-4.5 w-4.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => navigate(getUserProfileHref(activeConversation?.user.id, user?.id, '/chat'))}>
                    <User className="w-4 h-4 mr-2" />
                    Ver Perfil
                  </DropdownMenuItem>
                  {isMobileViewport && (
                    <DropdownMenuItem onClick={() => setShowMessageSearch((v) => !v)}>
                      <Search className="w-4 h-4 mr-2" />
                      {showMessageSearch ? 'Fechar busca' : 'Buscar na conversa'}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={openHighlightDialog}>
                    <Pin className="w-4 h-4 mr-2" />
                    {activeConversation?.isHighlighted ? 'Editar destaque' : 'Destacar conversa'}
                  </DropdownMenuItem>
                  {activeConversation?.isHighlighted ? (
                    <DropdownMenuItem onClick={() => void handleRemoveConversationHighlight()}>
                      <X className="w-4 h-4 mr-2" />
                      Remover destaque
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setConfirmDeleteConv(true)}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Apagar Conversa
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Search bar — always visible on desktop, toggle-controlled on mobile */}
          {(!isMobileViewport || showMessageSearch) && (
            <div className="shrink-0 border-b bg-background px-2.5 py-2 md:px-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar nesta conversa..."
                  value={messageSearch}
                  onChange={(e) => setMessageSearch(e.target.value)}
                  className="h-9 pl-9 pr-9"
                  autoFocus={isMobileViewport && showMessageSearch}
                />
                {isMobileViewport && messageSearch && (
                  <button
                    type="button"
                    onClick={() => { setMessageSearch(''); setShowMessageSearch(false); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Messages – native scrollable div; ref used for scroll-to-bottom */}
          {/* flex-col + the leading flex-1 spacer keeps messages pinned to the   */}
          {/* bottom when content is shorter than the container (e.g. after the   */}
          {/* iOS keyboard closes and the container height suddenly grows).        */}
          <div
            ref={messagesContainerRef}
            className="flex-1 min-h-0 w-full min-w-0 max-w-full overflow-y-auto overscroll-y-contain overflow-x-hidden flex flex-col [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
          >
            {/* Spacer: pushes messages to the bottom when content < container height */}
            <div className="flex-1 shrink-0" />
            <div className="flex flex-col gap-2.5 px-2.5 py-3 md:gap-4 md:p-4">
              {isLoadingMessages && <div className="text-sm text-muted-foreground">Carregando...</div>}
              {!isLoadingMessages && !USE_MOCKS && messages.length === 0 && activeConversation && (
                <div className="flex flex-col items-center gap-3 py-6 px-2">
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">Comece a conversa</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Toque em uma sugestão ou escreva sua mensagem
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 w-full max-w-sm">
                    {generateIceBreakers(
                      activeConversation.user.name,
                      activeConversation.user.city,
                      user?.city,
                    ).map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setMessage(suggestion)}
                        className="text-left rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm text-foreground hover:bg-secondary/80 transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {!isLoadingMessages && (USE_MOCKS ? [] : filteredMessages).map((msg) => {
                const isMine = msg.senderId === user?.id;
                const isDeleted = msg.isDeletedForMe || msg.isDeletedForAll;
                const isMutualMatchMessage = isMutualMatchSystemMessage(msg);
                return (
                  <div
                    key={msg.id}
                    className={cn(
                      'flex w-full min-w-0 items-end gap-2',
                      isMutualMatchMessage ? 'justify-center' : isMine ? 'justify-end' : 'justify-start',
                    )}
                  >
                    {/* Small avatar beside received messages — hidden on very small screens to maximise message width */}
                    {!isMine && !isMutualMatchMessage && (
                      <div className="hidden min-[380px]:block shrink-0 mb-0.5">
                        <UserAvatar user={activeConversation?.user} className="h-7 w-7" />
                      </div>
                    )}
                    <div
                      className={cn(
                        'group relative min-w-0',
                        isMutualMatchMessage
                          ? 'max-w-[92%] rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-center shadow-sm sm:max-w-[80%] md:max-w-[70%]'
                          : cn(
                              'max-w-[88%] rounded-2xl px-3 py-2.5 min-[380px]:max-w-[84%] sm:max-w-[76%] md:max-w-[65%] md:px-4 md:py-2',
                              isMine
                                ? 'bg-gradient-primary text-primary-foreground rounded-br-sm'
                                : 'bg-secondary rounded-bl-sm'
                            )
                      )}
                      onContextMenu={(e) => !isDeleted && !msg.isSending && !isMutualMatchMessage && openContextMenu(e, msg.id)}
                      onTouchStart={(e) => { if (!isDeleted && !msg.isSending && !isMutualMatchMessage) startLongPress(e, msg.id); }}
                      onTouchEnd={cancelLongPress}
                      onTouchMove={cancelLongPress}
                    >
                      {isDeleted ? (
                        <p className="italic text-[13px] opacity-60">
                          {msg.isDeletedForAll ? 'Mensagem apagada' : 'Você apagou esta mensagem'}
                        </p>
                      ) : msg.isLocked ? (
                        <button
                          type="button"
                          className="flex items-center gap-2 text-left"
                          onClick={redirectToPlans}
                        >
                          <Lock className="w-4 h-4" />
                          <p>Assine para ver esta mensagem</p>
                        </button>
                      ) : (!premiumAccess && !isMine && !isMutualMatchMessage) ? (
                        /* Premium gate — blur incoming messages for non-subscribers */
                        <button
                          type="button"
                          className="flex w-full items-center gap-2.5 text-left"
                          onClick={redirectToPlans}
                        >
                          <Lock className="w-4 h-4 shrink-0 text-muted-foreground/80" />
                          <div className="min-w-0 flex-1">
                            {/* Blurred placeholder lines simulating hidden text */}
                            <div className="space-y-1.5 select-none pointer-events-none">
                              <div className="h-3.5 w-36 max-w-full rounded bg-muted-foreground/25 blur-[3px]" />
                              {(msg.content?.length ?? 0) > 40 && (
                                <div className="h-3.5 w-24 rounded bg-muted-foreground/20 blur-[3px]" />
                              )}
                            </div>
                            <p className="mt-1.5 text-[11px] font-semibold text-muted-foreground/80">
                              Assine para ler a mensagem
                            </p>
                          </div>
                        </button>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {isMutualMatchMessage && (
                            <div className="flex items-center justify-center gap-2 text-primary">
                              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/12">
                                <HeartHandshake className="h-4 w-4" />
                              </span>
                              <span className="text-xs font-bold uppercase tracking-[0.18em]">
                                Novo match confirmado
                              </span>
                            </div>
                          )}
                          {msg.mediaId && (
                            <div className="relative rounded-lg overflow-hidden max-w-full">
                              {msg.isViewOnce ? (
                                msg.isViewed ? (
                                  <div className="bg-black/10 backdrop-blur-sm p-4 flex items-center gap-3 border border-white/10 rounded-lg opacity-60">
                                    <EyeOff className="w-5 h-5 text-muted-foreground" />
                                    <span className="text-xs font-medium italic">Mensagem visualizada</span>
                                  </div>
                                ) : (
                                  <div
                                    className="bg-black/20 backdrop-blur-md p-8 flex flex-col items-center justify-center gap-2 border border-white/20 rounded-lg cursor-pointer hover:bg-black/30 transition-colors"
                                    onClick={async () => {
                                      if (!msg.mediaUrl || msg.isViewed || msg.id.startsWith('temp-')) return;
                                      const finalUrl = msg.mediaUrl.startsWith('blob:') ? msg.mediaUrl : resolveServerUrl(msg.mediaUrl);
                                      setViewingPhoto(finalUrl);
                                      try {
                                        await chatService.markMessageAsViewed(msg.id);
                                        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isViewed: true } : m));
                                      } catch (err) {
                                        console.error('Failed to mark as viewed:', err);
                                      }
                                    }}
                                  >
                                    <Zap className="w-8 h-8 text-yellow-400" />
                                    <span className="text-xs font-medium">Foto de visualização única</span>
                                    <button type="button" className="mt-2 h-8 px-3 text-sm rounded-md bg-secondary flex items-center gap-1">
                                      <Eye className="w-4 h-4 mr-1" /> Visualizar
                                    </button>
                                  </div>
                                )
                              ) : (
                                msg.mediaMimeType?.startsWith('video/') ? (
                                  <VideoWithPreview
                                    src={msg.mediaUrl?.startsWith('blob:') ? msg.mediaUrl : (msg.mediaUrl ? resolveServerUrl(msg.mediaUrl) : '')}
                                    controls
                                    className="max-h-60 max-w-full w-auto rounded-lg"
                                  />
                                ) : (
                                  <img
                                    src={msg.mediaUrl?.startsWith('blob:') ? msg.mediaUrl : (msg.mediaUrl ? resolveServerUrl(msg.mediaUrl) : '')}
                                    alt="Mídia"
                                    className="max-h-72 max-w-full w-auto object-contain rounded-lg"
                                    onClick={() => {
                                      if (!msg.mediaUrl) return;
                                      const finalUrl = msg.mediaUrl.startsWith('blob:') ? msg.mediaUrl : resolveServerUrl(msg.mediaUrl);
                                      setViewingPhoto(finalUrl);
                                    }}
                                  />
                                )
                              )}
                            </div>
                          )}
                          {msg.content && (
                            <p
                              className={cn(
                                'break-words text-[16px] leading-6 md:text-base',
                                isMutualMatchMessage && 'text-sm font-semibold leading-5 text-primary md:text-sm',
                              )}
                            >
                              {msg.content}
                            </p>
                          )}
                        </div>
                      )}
                      <div className={cn(
                        'flex items-center gap-1 mt-1',
                        isMutualMatchMessage
                          ? 'justify-center text-muted-foreground'
                          : isMine
                            ? 'justify-end text-primary-foreground/70'
                            : 'justify-end text-muted-foreground'
                      )}>
                        <span className="text-[10px]">{formatTime(msg.createdAt)}</span>
                        {isMine && !isMutualMatchMessage && (
                          <span className="flex items-center">
                            {msg.isSending ? (
                              <div className="w-3 h-3 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                            ) : msg.isRead ? (
                              <CheckCheck className="w-3 h-3 text-blue-400" />
                            ) : msg.isDelivered ? (
                              <CheckCheck className="w-3 h-3" />
                            ) : (
                              <Check className="w-3 h-3" />
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {/* Sentinel – keeps scroll-to-bottom target for future use */}
              <div aria-hidden />
            </div>{/* end inner flex-col messages wrapper */}
          </div>

          {/* Message Input
              NOTE: no "sticky" here – the chat panel is position:fixed and this
              element sits naturally at the bottom of the flex-col container.
              Using sticky inside a fixed overflow:hidden parent causes the bar
              to anchor to the viewport bottom (behind the home indicator) instead
              of the container bottom, which clips the icons on the left. */}
          <div
            className="w-full min-w-0 max-w-full border-t bg-background/96 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/82 md:p-4"
            style={{
              paddingLeft: 'max(0.625rem, env(safe-area-inset-left))',
              paddingRight: 'max(0.625rem, env(safe-area-inset-right))',
              // On mobile, add safe-area-inset-bottom here so the input clears
              // the iPhone home indicator – replaces the separate spacer div.
              ...(isMobileViewport
                ? { paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom, 0px))' }
                : {}),
            }}
          >
            {!premiumAccess && (
              <button
                type="button"
                onClick={redirectToPlans}
                className="mb-2 flex w-full items-center justify-between rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-left transition-colors hover:bg-destructive/10"
              >
                <div>
                  <p className="font-medium text-destructive">Acesso bloqueado</p>
                  <p className="text-sm text-muted-foreground">Assine para ler e responder todas as mensagens.</p>
                </div>
                <Lock className="h-4 w-4 text-destructive" />
              </button>
            )}
            {/* View-once active banner */}
            {isViewOnceEnabled && (
              <div className="mb-1.5 flex items-center gap-2 rounded-xl border border-yellow-400/40 bg-yellow-400/10 px-3 py-2">
                <Zap className="h-3.5 w-3.5 shrink-0 fill-yellow-400 text-yellow-400" />
                <p className="min-w-0 flex-1 text-xs font-medium text-yellow-700 dark:text-yellow-300">
                  Visualização única ativa — a próxima mídia só poderá ser vista uma vez pelo destinatário.
                </p>
                <button
                  type="button"
                  onClick={() => setIsViewOnceEnabled(false)}
                  className="shrink-0 rounded p-0.5 text-yellow-600 transition hover:bg-yellow-400/20"
                  aria-label="Desativar visualização única"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <div className={cn(
              "w-full min-w-0 max-w-full rounded-[1.25rem] p-1.5 shadow-sm transition-colors duration-200 md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none",
              isViewOnceEnabled
                ? "border border-yellow-400/70 bg-yellow-400/8 shadow-[0_0_0_2px_rgba(250,204,21,0.18)]"
                : "border border-border/70 bg-background"
            )}>
              <div className="flex w-full min-w-0 max-w-full items-end gap-2">
                <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleImageUpload}
                />
                <div className="flex shrink-0 items-center gap-0.5 rounded-xl bg-muted/40 px-0.5 py-0.5 md:gap-0 md:bg-transparent md:px-0 md:py-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => premiumAccess ? fileInputRef.current?.click() : redirectToPlans()}
                    disabled={isUploading}
                    className="h-11 w-9 rounded-xl min-[380px]:w-10 md:h-9 md:w-9"
                  >
                    {isUploading ? (
                      <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    ) : (
                      <Image className="w-5 h-5" />
                    )}
                  </Button>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" disabled={!premiumAccess} className="h-11 w-9 rounded-xl min-[380px]:w-10 md:h-9 md:w-9">
                        <Smile className="w-5 h-5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="top"
                      align="center"
                      sideOffset={8}
                      collisionPadding={8}
                      className="p-0 border-none w-auto max-h-[min(380px,45svh)] overflow-hidden"
                    >
                      <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Carregando…</div>}>
                        <div className="overflow-y-auto max-h-[min(380px,45svh)]">
                          <EmojiPicker
                            onEmojiClick={(emojiData: { emoji: string }) => setMessage(prev => prev + emojiData.emoji)}
                            theme={"light" as any}
                            width={Math.min(350, typeof window !== 'undefined' ? window.innerWidth - 16 : 350)}
                          />
                        </div>
                      </Suspense>
                    </PopoverContent>
                  </Popover>

                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => premiumAccess ? setIsViewOnceEnabled(!isViewOnceEnabled) : redirectToPlans()}
                          className={cn(
                            "h-11 w-9 rounded-xl transition-all duration-200 min-[380px]:w-10 md:h-9 md:w-9",
                            isViewOnceEnabled
                              ? "bg-yellow-400/20 text-yellow-500 ring-1 ring-yellow-400/60 hover:bg-yellow-400/30"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                          aria-label="Visualização única"
                          disabled={!premiumAccess}
                        >
                          <Zap className={cn("w-5 h-5 transition-all", isViewOnceEnabled && "fill-yellow-400 drop-shadow-[0_0_4px_rgba(250,204,21,0.8)]")} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[220px] text-center text-xs">
                        <p className="font-semibold">⚡ Visualização única</p>
                        <p className="mt-0.5 text-muted-foreground">
                          {isViewOnceEnabled
                            ? 'Ativo — a próxima mídia só poderá ser vista uma vez. Toque para desativar.'
                            : 'Ative para enviar uma foto que some após ser visualizada uma vez.'}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

              <textarea
                ref={messageInputRef}
                placeholder="Digite sua mensagem..."
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  adjustMessageInputHeight();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !isMobileViewport) {
                    e.preventDefault();
                    void handleSendMessage(message);
                  }
                }}
                rows={1}
                className={cn(
                  "min-h-[48px] w-full min-w-0 flex-1 resize-none overflow-y-auto rounded-xl border-2 px-3.5 py-3 text-[15px] leading-5 outline-none transition-all duration-200 focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60 placeholder:text-muted-foreground/90 md:min-h-[40px] md:rounded-md md:border-input md:px-3 md:py-2 md:text-sm",
                  isViewOnceEnabled
                    ? "border-yellow-400/50 bg-yellow-400/5 focus-visible:ring-yellow-400/40 placeholder:text-yellow-700/50 dark:placeholder:text-yellow-300/50"
                    : "border-primary/15 bg-background focus-visible:ring-primary/40"
                )}
                disabled={!premiumAccess}
                onClick={() => {
                  if (!premiumAccess) redirectToPlans();
                }}
              />
              <Button
                size="icon"
                className="h-12 w-12 shrink-0 rounded-xl bg-gradient-primary hover:opacity-90 md:h-10 md:w-10 md:rounded-md"
                onClick={() => handleSendMessage(message)}
                disabled={!premiumAccess || !message.trim() || isUploading}
              >
                <Send className="w-5.5 h-5.5 md:w-5 md:h-5" />
              </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground">
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
              <Send className="w-10 h-10 text-muted-foreground" />
            </div>
            <p className="text-lg">Selecione uma conversa para começar</p>
          </div>
        </div>
      )}
      
      {/* Message context menu */}
      {contextMenu && (() => {
        // Use visualViewport on iOS Safari — window.innerHeight includes hidden browser chrome
        const vp = typeof window !== 'undefined' ? window.visualViewport : null;
        const vw = vp ? Math.round(vp.width) : (typeof window !== 'undefined' ? window.innerWidth : 400);
        const vh = vp ? Math.round(vp.height) : (typeof window !== 'undefined' ? window.innerHeight : 700);
        const contextMessage = messages.find((m) => m.id === contextMenu.messageId);
        const canCopyText = Boolean(String(contextMessage?.content || '').trim());
        const canDeleteForEveryone = contextMessage?.senderId === user?.id;
        const menuW = 190;
        const itemCount = 1 + (canCopyText ? 1 : 0) + (canDeleteForEveryone ? 1 : 0);
        const menuH = itemCount * 56;
        const x = Math.max(8, Math.min(contextMenu.x, vw - menuW - 8));
        const y = Math.max(8, Math.min(contextMenu.y, vh - menuH - 8));
        return (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setContextMenu(null)}
              onTouchStart={() => setContextMenu(null)}
            />
            <div
              className="fixed z-50 min-w-[190px] overflow-hidden rounded-xl border bg-background shadow-2xl"
              style={{ left: x, top: y }}
            >
              {canCopyText && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 px-4 py-3 text-sm hover:bg-secondary transition-colors"
                  onClick={() => void handleCopyMessageText(contextMenu.messageId)}
                >
                  <Copy className="h-4 w-4 text-muted-foreground" />
                  Copiar texto
                </button>
              )}
              <button
                type="button"
                className="flex w-full items-center gap-2.5 border-t px-4 py-3 text-sm hover:bg-secondary transition-colors first:border-t-0"
                onClick={() => handleDeleteMessage(contextMenu.messageId, false)}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
                Apagar para mim
              </button>
              {canDeleteForEveryone && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 px-4 py-3 text-sm text-destructive hover:bg-destructive/10 transition-colors border-t"
                  onClick={() => handleDeleteMessage(contextMenu.messageId, true)}
                >
                  <Trash2 className="h-4 w-4" />
                  Apagar para todos
                </button>
              )}
            </div>
          </>
        );
      })()}

      {/* Delete conversation confirmation — overlay customizado (sem Radix Dialog para evitar freeze mobile) */}
      {confirmDeleteConv && (
        <div
          className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setConfirmDeleteConv(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              <h3 className="text-base font-semibold">Apagar conversa?</h3>
              <p className="text-sm text-muted-foreground">
                Esta ação não pode ser desfeita. Todas as mensagens serão removidas para você.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmDeleteConv(false)}>Cancelar</Button>
              <Button variant="destructive" onClick={() => void handleDeleteConversation()}>Apagar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Long-press menu na lista de conversas */}
      {convListMenu && (
        <div
          className="fixed inset-0 z-[9990] flex items-end justify-center bg-black/60 p-4"
          onClick={() => setConvListMenu(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-background shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b">
              <p className="font-semibold truncate">{convListMenu.name}</p>
              <p className="text-xs text-muted-foreground">Selecione uma ação</p>
            </div>
            <button
              type="button"
              className="w-full flex items-center gap-3 px-5 py-4 text-left text-destructive hover:bg-destructive/10 transition-colors"
              onClick={() => void handleDeleteConvFromList(convListMenu.id)}
            >
              <Trash2 className="h-4 w-4" />
              <span className="text-sm font-medium">Apagar conversa</span>
            </button>
            <button
              type="button"
              className="w-full flex items-center gap-3 px-5 py-4 text-left text-muted-foreground hover:bg-secondary transition-colors border-t"
              onClick={() => setConvListMenu(null)}
            >
              <X className="h-4 w-4" />
              <span className="text-sm font-medium">Cancelar</span>
            </button>
          </div>
        </div>
      )}

      <Dialog open={highlightDialogOpen} onOpenChange={setHighlightDialogOpen}>
        <DialogContent>
          <DialogTitle>Destacar conversa</DialogTitle>
          <DialogDescription>
            Marque esta conversa como prioridade e adicione um lembrete rápido para não esquecer.
          </DialogDescription>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Cor do destaque</p>
              <select
                value={highlightColorDraft}
                onChange={(e) => setHighlightColorDraft(e.target.value as 'rose' | 'amber' | 'violet' | 'sky')}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                {HIGHLIGHT_COLORS.map((color) => (
                  <option key={color.id} value={color.id}>
                    {color.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Lembrete (opcional)</p>
              <Input
                value={highlightNoteDraft}
                onChange={(e) => setHighlightNoteDraft(e.target.value)}
                maxLength={120}
                placeholder="Ex.: chamar quando estiver em cidade X"
              />
              <p className="text-[11px] text-muted-foreground">{highlightNoteDraft.length}/120</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setHighlightDialogOpen(false)}>Cancelar</Button>
            <Button disabled={isSavingHighlight} onClick={() => void handleSaveConversationHighlight()}>
              {isSavingHighlight ? 'Salvando...' : 'Salvar destaque'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Photo lightbox — custom overlay (avoids Radix Dialog scroll-lock bug on mobile) */}
      {viewingPhoto && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black/90"
          onClick={() => setViewingPhoto(null)}
        >
          <img
            src={viewingPhoto}
            alt="Visualização"
            className="max-h-[90vh] max-w-[95vw] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            aria-label="Fechar"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/20"
            onClick={() => setViewingPhoto(null)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      <ReferralPaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </div>
  );
}

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Search, Send, Phone, Video, MoreVertical, ArrowLeft, Image, Smile, Lock, Check, CheckCheck, Zap, Eye, EyeOff, X, Trash2, User, WifiOff, MessageCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/UserAvatar';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { chatService, profileService } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { resolveServerUrl } from '@/utils/serverUrl';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import { formatProfileIdentityLine } from '@/utils/profileIdentity';
import { hasPremiumAccess } from '@/utils/premium';
import VideoWithPreview from '@/components/VideoWithPreview';
import MobileState from '@/components/MobileState';
import { getUserProfileHref } from '@/utils/userProfileNavigation';

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';

type Conversation = {
  id: string;
  user: { id: string; name: string; avatar?: string | null; gender?: string | null; city?: string | null; state?: string | null };
  createdAt?: string;
  unreadCount?: number;
};

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

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function Chat() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { emit, on, off, isConnected } = useSocket();
  const { toast } = useToast();
  const location = useLocation();
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isViewOnceEnabled, setIsViewOnceEnabled] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ messageId: string; x: number; y: number } | null>(null);
  const [confirmDeleteConv, setConfirmDeleteConv] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null); // for auto-scroll-to-bottom
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Capture touch coords at touch-start so they're available when timer fires
  const touchCoords = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const selectedConversation = conversations.find((c) => c.id === selectedChat);
  const premiumAccess = hasPremiumAccess(user);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  // Tracks whether the sm: breakpoint (640px) is active – needed for header height (3.5rem vs 4rem)
  const [isSmMobile, setIsSmMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 640 : false
  );

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
    toast({
      title: 'Plano necessário',
      description: 'Renove seu plano para responder e desbloquear o conteúdo do chat.',
      variant: 'destructive',
    });
    navigate('/subscriptions');
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

  const adjustMessageInputHeight = () => {
    const el = messageInputRef.current;
    if (!el) return;
    el.style.height = '0px';
    const lineHeight = 24;
    const minHeight = lineHeight;
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

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.user?.name?.toLowerCase().includes(q));
  }, [search, conversations]);
  const getIdentityLine = (profile?: { gender?: string | null; city?: string | null; state?: string | null } | null) =>
    formatProfileIdentityLine(profile);

  useEffect(() => {
    if (USE_MOCKS) return;
    let cancelled = false;
    setIsLoadingConversations(true);
    chatService
      .getConversations()
      .then((data) => {
        if (cancelled) return;
        setConversations(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (cancelled) return;
        toast({ title: 'Erro ao carregar conversas', description: 'Tente novamente.', variant: 'destructive' });
        setConversations([]);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoadingConversations(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    const stateConversationId = (location.state as any)?.conversationId ? String((location.state as any).conversationId) : '';
    const queryConversationId = new URLSearchParams(location.search).get('conversationId') || '';
    const conversationId = stateConversationId || queryConversationId;
    if (!conversationId) return;
    setSelectedChat(conversationId);
  }, [location.state, location.search]);

  useEffect(() => {
    if (USE_MOCKS) return;
    if (!selectedChat || !user?.id) return;
    
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
  }, [selectedChat, emit, toast]);

  useEffect(() => {
    if (USE_MOCKS) return;
    const handler = async (msg: Message) => {
      if (!msg) return;
      
      // Update conversations list with unread count and move to top
      setConversations(prev => {
        const index = prev.findIndex(c => c.id === msg.conversationId);
        
        if (index === -1) {
          // If conversation not found, we should fetch it or just reload the list
          chatService.getConversations().then(data => {
            setConversations(Array.isArray(data) ? data : []);
          });
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

  // On mobile: use inline style so we can mix var(--vh) with env(safe-area-inset-bottom).
  // Header height: h-14 (3.5rem) on <640px, sm:h-16 (4rem) on 640-767px.
  // When a conversation is open the bottom nav is hidden → subtract header only.
  // When showing the conversation list the nav (h-14 = 3.5rem + safe-area-inset-bottom) is visible.
  const headerH = isSmMobile ? '4rem' : '3.5rem';
  const mobileHeightStyle: React.CSSProperties | undefined = isMobileViewport
    ? {
        height: selectedChat
          ? `calc(var(--vh, 100dvh) - ${headerH})`
          : `calc(var(--vh, 100dvh) - ${headerH} - 3.5rem - env(safe-area-inset-bottom, 0px))`,
      }
    : undefined;

  return (
    <div
      className="flex w-full min-h-0 max-w-full overflow-hidden md:h-[calc(100dvh-8.5rem)] md:min-h-[28rem]"
      style={mobileHeightStyle}
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
          {!isLoadingConversations && (USE_MOCKS ? [] : filteredConversations).map((conversation) => (
            <div
              key={conversation.id}
              onClick={() => setSelectedChat(conversation.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setSelectedChat(conversation.id);
              }}
              className={cn(
                "w-full border-b p-3 flex items-center gap-3 hover:bg-secondary/50 transition-colors sm:p-4",
                selectedChat === conversation.id && "bg-secondary"
              )}
            >
              <div className="relative">
                <UserAvatar user={conversation.user} className="h-11 w-11 sm:h-10 sm:w-10" />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    className="truncate pr-2 text-[0.98rem] font-medium hover:underline sm:text-base"
                    onClick={(e) => {
                      e.stopPropagation();
                      goToUserProfile(conversation.user.id);
                    }}
                  >
                    {conversation.user.name}
                  </button>
                  {conversation.unreadCount && conversation.unreadCount > 0 && (
                    <Badge variant="destructive" className="flex h-5 min-w-[1.2rem] items-center justify-center rounded-full px-1 text-[10px] font-semibold">
                      {conversation.unreadCount}
                    </Badge>
                  )}
                </div>
                {getIdentityLine(conversation.user) ? (
                  <p className="text-xs truncate text-muted-foreground">{getIdentityLine(conversation.user)}</p>
                ) : null}
                <p className={cn(
                  "truncate text-[13px] sm:text-sm",
                  conversation.unreadCount && conversation.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground"
                )}>
                  {conversation.unreadCount && conversation.unreadCount > 0 ? 'Nova mensagem' : 'Toque para abrir'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      {selectedChat ? (
        <div className="flex w-full min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden bg-background">
          {/* Chat Header */}
          <div className="sticky top-0 z-20 flex w-full min-w-0 max-w-full items-center justify-between border-b bg-background/95 px-2.5 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:static md:glass md:p-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-8.5 w-8.5 shrink-0 rounded-full md:hidden"
                onClick={() => setSelectedChat(null)}
              >
                <ArrowLeft className="w-4.5 h-4.5" />
              </Button>
              <div className="shrink-0">
                <UserAvatar user={selectedConversation?.user} className="h-9 w-9 sm:h-10 sm:w-10" />
              </div>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    className="truncate text-left text-[15px] font-semibold leading-5 hover:underline"
                    onClick={() => goToUserProfile(selectedConversation?.user.id)}
                  >
                    {selectedConversation?.user.name}
                  </button>
                  {!isConnected && (
                    <WifiOff
                      className="w-3 h-3 text-destructive animate-pulse"
                      aria-label="Desconectado"
                    />
                  )}
                </div>
                <span className="block truncate text-[11px] leading-4 text-muted-foreground">
                  {getIdentityLine(selectedConversation?.user) || 'Chat'}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8.5 w-8.5 rounded-full">
                <Phone className="h-4.5 w-4.5" />
              </Button>
              <Button variant="ghost" size="icon" className="hidden h-8.5 w-8.5 rounded-full sm:inline-flex">
                <Video className="h-4.5 w-4.5" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8.5 w-8.5 rounded-full">
                    <MoreVertical className="h-4.5 w-4.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => navigate(getUserProfileHref(selectedConversation?.user.id, user?.id, '/chat'))}>
                    <User className="w-4 h-4 mr-2" />
                    Ver Perfil
                  </DropdownMenuItem>
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

          {/* Messages – native scrollable div; ref used for scroll-to-bottom */}
          <div
            ref={messagesContainerRef}
            className="flex-1 min-h-0 w-full min-w-0 max-w-full overflow-y-auto overscroll-y-contain overflow-x-hidden space-y-2.5 px-2.5 py-2.5 md:space-y-4 md:p-4"
            style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
          >
              {isLoadingMessages && <div className="text-sm text-muted-foreground">Carregando...</div>}
              {!isLoadingMessages && (USE_MOCKS ? [] : messages).map((msg) => {
                const isMine = msg.senderId === user?.id;
                const isDeleted = msg.isDeletedForMe || msg.isDeletedForAll;
                return (
                  <div
                    key={msg.id}
                    className={cn("flex w-full min-w-0 items-end gap-2", isMine ? "justify-end" : "justify-start")}
                  >
                    {/* Small avatar beside received messages */}
                    {!isMine && (
                      <div className="shrink-0 mb-0.5">
                        <UserAvatar user={selectedConversation?.user} className="h-7 w-7" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "group relative min-w-0 max-w-[79%] rounded-2xl px-3 py-2.5 sm:max-w-[76%] md:max-w-[65%] md:px-4 md:py-2",
                        isMine
                          ? "bg-gradient-primary text-primary-foreground rounded-br-sm"
                          : "bg-secondary rounded-bl-sm"
                      )}
                      onContextMenu={(e) => !isDeleted && !msg.isSending && openContextMenu(e, msg.id)}
                      onTouchStart={(e) => { if (!isDeleted && !msg.isSending) startLongPress(e, msg.id); }}
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
                      ) : (
                        <div className="flex flex-col gap-2">
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
                          {msg.content && <p className="break-words text-[15px] leading-6 md:text-base">{msg.content}</p>}
                        </div>
                      )}
                      <div className={cn(
                        "flex items-center justify-end gap-1 mt-1",
                        isMine ? "text-primary-foreground/70" : "text-muted-foreground"
                      )}>
                        <span className="text-[10px]">{formatTime(msg.createdAt)}</span>
                        {isMine && (
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
          </div>

          {/* Message Input */}
          <div
            className="sticky bottom-0 z-10 w-full min-w-0 max-w-full border-t bg-background/96 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-background/82 md:p-4"
            style={{
              paddingLeft: 'max(0.625rem, env(safe-area-inset-left))',
              paddingRight: 'max(0.625rem, env(safe-area-inset-right))',
            }}
          >
            {!premiumAccess && (
              <button
                type="button"
                onClick={redirectToPlans}
                className="mb-2 flex w-full items-center justify-between rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-left transition-colors hover:bg-destructive/10"
              >
                <div>
                  <p className="font-medium text-destructive">Respostas bloqueadas</p>
                  <p className="text-sm text-muted-foreground">Renove seu plano para responder e liberar todas as mensagens.</p>
                </div>
                <Lock className="h-4 w-4 text-destructive" />
              </button>
            )}
            <div className="w-full min-w-0 max-w-full overflow-hidden rounded-[1.15rem] border border-border/70 bg-background p-1.5 shadow-sm md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none">
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
                    className="h-9.5 w-9.5 rounded-xl md:h-9 md:w-9"
                  >
                    {isUploading ? (
                      <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    ) : (
                      <Image className="w-5 h-5" />
                    )}
                  </Button>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" disabled={!premiumAccess} className="h-9.5 w-9.5 rounded-xl md:h-9 md:w-9">
                        <Smile className="w-5 h-5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent side="top" align="start" className="p-0 border-none w-auto">
                      <EmojiPicker
                        onEmojiClick={(emojiData) => setMessage(prev => prev + emojiData.emoji)}
                        theme={Theme.LIGHT}
                      />
                    </PopoverContent>
                  </Popover>

                  <Button
                    variant={isViewOnceEnabled ? "secondary" : "ghost"}
                    size="icon"
                    onClick={() => premiumAccess ? setIsViewOnceEnabled(!isViewOnceEnabled) : redirectToPlans()}
                    className={cn("h-9.5 w-9.5 rounded-xl md:h-9 md:w-9", isViewOnceEnabled && "text-yellow-500")}
                    title="Visualização única"
                    disabled={!premiumAccess}
                  >
                    <Zap className="w-5 h-5" />
                  </Button>
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
                className="min-h-[44px] w-0 min-w-0 flex-1 resize-none overflow-y-auto rounded-xl border-2 border-primary/15 bg-background px-3.5 py-2.5 text-[15px] leading-6 outline-none transition focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60 placeholder:text-muted-foreground/90 md:min-h-[40px] md:rounded-md md:border-input md:px-3 md:py-2 md:text-sm"
                disabled={!premiumAccess}
                onClick={() => {
                  if (!premiumAccess) redirectToPlans();
                }}
              />
              <Button
                size="icon"
                className="h-10.5 w-10.5 rounded-xl bg-gradient-primary hover:opacity-90 md:h-10 md:w-10 md:rounded-md"
                onClick={() => handleSendMessage(message)}
                disabled={!premiumAccess || !message.trim() || isUploading}
              >
                <Send className="w-5 h-5" />
              </Button>
              </div>
            </div>
            <div className="h-[max(env(safe-area-inset-bottom),0px)] md:hidden" />
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
        const vw = typeof window !== 'undefined' ? window.innerWidth : 400;
        const vh = typeof window !== 'undefined' ? window.innerHeight : 700;
        const menuW = 190;
        const menuH = messages.find(m => m.id === contextMenu.messageId)?.senderId === user?.id ? 110 : 56;
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
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-4 py-3 text-sm hover:bg-secondary transition-colors"
                onClick={() => handleDeleteMessage(contextMenu.messageId, false)}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
                Apagar para mim
              </button>
              {messages.find(m => m.id === contextMenu.messageId)?.senderId === user?.id && (
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

      {/* Delete conversation confirmation */}
      <Dialog open={confirmDeleteConv} onOpenChange={setConfirmDeleteConv}>
        <DialogContent>
          <DialogTitle>Apagar conversa?</DialogTitle>
          <DialogDescription>
            Esta ação não pode ser desfeita. Todas as mensagens desta conversa serão removidas para você.
          </DialogDescription>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDeleteConv(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => void handleDeleteConversation()}>Apagar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingPhoto} onOpenChange={(open) => !open && setViewingPhoto(null)}>
        <DialogContent className="max-w-4xl p-0 border-none bg-transparent shadow-none flex items-center justify-center">
          <DialogTitle className="sr-only">Visualizar Foto</DialogTitle>
          {viewingPhoto && (
            <div className="relative group">
              <img 
                src={viewingPhoto} 
                alt="Visualização" 
                className="max-h-[90vh] max-w-full object-contain rounded-lg"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 text-white hover:bg-white/20"
                onClick={() => setViewingPhoto(null)}
              >
                <X className="w-6 h-6" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

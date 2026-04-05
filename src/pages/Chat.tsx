import { useEffect, useMemo, useState, useRef } from 'react';
import { Search, Send, Phone, Video, MoreVertical, ArrowLeft, Image, Smile, Lock, Check, CheckCheck, ImagePlus, Zap, Eye, EyeOff, X, Trash2, User, Wifi, WifiOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/UserAvatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { chatService, profileService } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { resolveServerUrl } from '@/utils/serverUrl';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import { formatProfileIdentityLine } from '@/utils/profileIdentity';

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedConversation = conversations.find((c) => c.id === selectedChat);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

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
    const conversationId = (location.state as any)?.conversationId ? String((location.state as any).conversationId) : '';
    if (!conversationId) return;
    setSelectedChat(conversationId);
  }, [location.state]);

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

    on('message.created', handler);
    on('message.new', handler);
    on('message.read', readHandler);
    on('message.viewed', viewedHandler);
    return () => {
      off('message.created', handler);
      off('message.new', handler);
      off('message.read', readHandler);
      off('message.viewed', viewedHandler);
    };
  }, [on, off, selectedChat, user?.id]);

  const handleSendMessage = async (content?: string, mediaId?: string, localUrl?: string) => {
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
    const file = e.target.files?.[0];
    if (!file) return;

    const localUrl = URL.createObjectURL(file);
    setIsUploading(true);
    try {
      const { id } = await profileService.uploadMedia(file);
      await handleSendMessage(undefined, id, localUrl);
    } catch (err) {
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
    if (!window.confirm('Tem certeza que deseja apagar esta conversa?')) return;

    try {
      await chatService.deleteConversation(selectedChat);
      setConversations(prev => prev.filter(c => c.id !== selectedChat));
      setSelectedChat(null);
      setMessages([]);
      toast({ title: 'Conversa apagada' });
    } catch {
      toast({ title: 'Erro ao apagar conversa', variant: 'destructive' });
    }
  };

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] min-h-[28rem]">
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

        <ScrollArea className="flex-1">
          {isLoadingConversations && (
            <div className="p-4 text-sm text-muted-foreground">Carregando...</div>
          )}
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
                "w-full p-4 flex items-center gap-3 hover:bg-secondary/50 transition-colors border-b",
                selectedChat === conversation.id && "bg-secondary"
              )}
            >
              <div className="relative">
                <UserAvatar user={conversation.user} />
              </div>
              <div className="flex-1 text-left">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{conversation.user.name}</span>
                  {conversation.unreadCount && conversation.unreadCount > 0 && (
                    <Badge variant="destructive" className="h-5 min-w-[1.25rem] px-1 flex items-center justify-center rounded-full text-[10px] font-bold">
                      {conversation.unreadCount}
                    </Badge>
                  )}
                </div>
                {getIdentityLine(conversation.user) ? (
                  <p className="text-xs truncate text-muted-foreground">{getIdentityLine(conversation.user)}</p>
                ) : null}
                <p className={cn(
                  "text-sm truncate",
                  conversation.unreadCount && conversation.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground"
                )}>
                  {conversation.unreadCount && conversation.unreadCount > 0 ? 'Nova mensagem' : 'Toque para abrir'}
                </p>
              </div>
            </div>
          ))}
        </ScrollArea>
      </div>

      {/* Chat Area */}
      {selectedChat ? (
        <div className="flex-1 flex flex-col">
          {/* Chat Header */}
          <div className="p-4 border-b flex items-center justify-between glass">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setSelectedChat(null)}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <UserAvatar user={selectedConversation?.user} />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold">{selectedConversation?.user.name}</h2>
                  {!isConnected && (
                    <WifiOff
                      className="w-3 h-3 text-destructive animate-pulse"
                      aria-label="Desconectado"
                    />
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {getIdentityLine(selectedConversation?.user) || 'Chat'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon">
                <Phone className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon">
                <Video className="w-5 h-5" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => navigate(`/users/${selectedConversation?.user.id}`)}>
                    <User className="w-4 h-4 mr-2" />
                    Ver Perfil
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    className="text-destructive focus:text-destructive"
                    onClick={handleDeleteConversation}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Apagar Conversa
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {isLoadingMessages && <div className="text-sm text-muted-foreground">Carregando...</div>}
              {!isLoadingMessages && (USE_MOCKS ? [] : messages).map((msg, idx) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex",
                    msg.senderId === user?.id ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[70%] px-4 py-2 rounded-2xl relative group",
                      msg.senderId === user?.id
                        ? "bg-gradient-primary text-primary-foreground rounded-br-sm"
                        : "bg-secondary rounded-bl-sm"
                    )}
                  >
                    {msg.isLocked ? (
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4" />
                        <p>Assine para ver esta mensagem</p>
                      </div>
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
                                     
                                     const finalUrl = msg.mediaUrl.startsWith('blob:') 
                                       ? msg.mediaUrl 
                                       : resolveServerUrl(msg.mediaUrl);
                                     
                                     setViewingPhoto(finalUrl);
                                     
                                     // Mark as viewed in backend immediately
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
                                  <Button size="sm" variant="secondary" className="mt-2 h-8">
                                    <Eye className="w-4 h-4 mr-1" /> Visualizar
                                  </Button>
                                </div>
                              )
                            ) : (
                              msg.mediaMimeType?.startsWith('video/') ? (
                                <video 
                                  src={msg.mediaUrl?.startsWith('blob:') ? msg.mediaUrl : (msg.mediaUrl ? resolveServerUrl(msg.mediaUrl) : '')} 
                                  controls
                                  className="max-h-60 w-auto rounded-lg"
                                />
                              ) : (
                                <img 
                                  src={msg.mediaUrl?.startsWith('blob:') ? msg.mediaUrl : (msg.mediaUrl ? resolveServerUrl(msg.mediaUrl) : '')} 
                                  alt="Mídia" 
                                  className="max-h-60 w-auto object-contain rounded-lg"
                                  onClick={() => {
                                    if (!msg.mediaUrl) return;
                                    const finalUrl = msg.mediaUrl.startsWith('blob:') 
                                      ? msg.mediaUrl 
                                      : resolveServerUrl(msg.mediaUrl);
                                    setViewingPhoto(finalUrl);
                                  }}
                                />
                              )
                            )}
                          </div>
                        )}
                        {msg.content && <p>{msg.content}</p>}
                      </div>
                    )}
                    <div className={cn(
                      "flex items-center justify-end gap-1 mt-1",
                      msg.senderId === user?.id ? "text-primary-foreground/70" : "text-muted-foreground"
                    )}>
                      <span className="text-[10px]">
                        {formatTime(msg.createdAt)}
                      </span>
                      {msg.senderId === user?.id && (
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
              ))}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>

          {/* Message Input */}
          <div className="p-4 border-t glass">
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleImageUpload}
              />
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? (
                  <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                ) : (
                  <Image className="w-5 h-5" />
                )}
              </Button>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon">
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
                onClick={() => setIsViewOnceEnabled(!isViewOnceEnabled)}
                className={cn(isViewOnceEnabled && "text-yellow-500")}
                title="Visualização única"
              >
                <Zap className="w-5 h-5" />
              </Button>

              <Input
                placeholder="Digite sua mensagem..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(message)}
                className="flex-1"
              />
              <Button
                size="icon"
                className="bg-gradient-primary hover:opacity-90"
                onClick={() => handleSendMessage(message)}
                disabled={!message.trim() || isUploading}
              >
                <Send className="w-5 h-5" />
              </Button>
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

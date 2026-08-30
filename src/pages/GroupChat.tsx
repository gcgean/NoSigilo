import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Users, Send, LogOut, Crown, X, Image as ImageIcon, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useSocket } from '@/contexts/SocketContext';
import { hasPremiumAccess } from '@/utils/premium';
import { groupsService, profileService, type GroupDetail, type GroupMessage } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { UserAvatar } from '@/components/UserAvatar';
import ReferralPaywallModal from '@/components/ReferralPaywallModal';
import { cn } from '@/lib/utils';

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function GroupChat() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { emit, on, off } = useSocket();
  const premiumAccess = hasPremiumAccess(user);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    setIsLoading(true);
    Promise.all([groupsService.getGroup(groupId), groupsService.getMessages(groupId)])
      .then(([g, msgs]) => {
        if (cancelled) return;
        setGroup(g);
        setMessages(Array.isArray(msgs) ? msgs : []);
      })
      .catch(() => {
        if (cancelled) return;
        toast({ title: 'Não foi possível abrir o grupo', variant: 'destructive' });
        navigate('/chat/groups');
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [groupId, navigate, toast]);

  useEffect(() => {
    if (!groupId) return;
    emit('join.group', groupId);
    const handler = (msg: GroupMessage & { groupId: string }) => {
      if (msg.groupId !== groupId) return;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    };
    on('group.message.new', handler);
    return () => { off('group.message.new', handler); };
  }, [groupId, emit, on, off]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    if (!groupId) return;
    if (!premiumAccess) { setPaywallOpen(true); return; }
    const content = message.trim();
    if (!content || sending) return;
    setSending(true);
    setMessage('');
    try {
      await groupsService.sendMessage(groupId, content);
    } catch {
      toast({ title: 'Erro ao enviar', description: 'Tente novamente.', variant: 'destructive' });
      setMessage(content);
    } finally {
      setSending(false);
    }
  }, [groupId, message, sending, premiumAccess, toast]);

  const handleAttach = useCallback(async (file: File) => {
    if (!groupId) return;
    if (!premiumAccess) { setPaywallOpen(true); return; }
    setUploading(true);
    try {
      const { id } = await profileService.uploadMedia(file, { source: 'chat' });
      await groupsService.sendMessage(groupId, undefined, id);
    } catch {
      toast({ title: 'Erro ao enviar mídia', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }, [groupId, premiumAccess, toast]);

  const handleLeave = useCallback(async () => {
    if (!groupId) return;
    try {
      await groupsService.leave(groupId);
      toast({ title: 'Você saiu do grupo' });
      navigate('/chat/groups');
    } catch {
      toast({ title: 'Não foi possível sair do grupo', variant: 'destructive' });
    }
  }, [groupId, navigate, toast]);

  const handleRemoveMember = useCallback(async (memberId: string) => {
    if (!groupId) return;
    try {
      await groupsService.removeMember(groupId, memberId);
      setGroup((prev) => prev ? { ...prev, members: prev.members.filter((m) => m.id !== memberId) } : prev);
      toast({ title: 'Membro removido do grupo' });
    } catch {
      toast({ title: 'Não foi possível remover', variant: 'destructive' });
    }
  }, [groupId, toast]);

  const isOrganizer = group?.members.find((m) => m.id === user?.id)?.isOrganizer ?? false;

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }
  if (!group) return null;

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-2xl min-w-0 flex-col md:h-[calc(100dvh-6rem)]">
      <ReferralPaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />

      {/* Header */}
      <div className="flex items-center gap-2 border-b pb-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/chat/groups')} aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setMembersOpen(true)}>
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-secondary">
            {group.image ? <img src={resolveServerUrl(group.image)} alt="" className="h-full w-full object-cover" /> : null}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold leading-tight">{group.title}</p>
            <p className="truncate text-xs text-muted-foreground">{group.members.length} participante{group.members.length === 1 ? '' : 's'}</p>
          </div>
        </button>
        <Button variant="ghost" size="icon" onClick={() => setMembersOpen(true)} aria-label="Ver membros">
          <Users className="h-5 w-5" />
        </Button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto py-3">
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma mensagem ainda. Diga oi para o grupo! 👋
          </p>
        )}
        {messages.map((m) => {
          const isMine = m.senderId === user?.id;
          return (
            <div key={m.id} className={cn('flex items-end gap-2', isMine && 'flex-row-reverse')}>
              {!isMine && <UserAvatar user={{ name: m.senderName, avatar: m.senderAvatar }} className="h-7 w-7 shrink-0" />}
              <div className={cn('max-w-[75%] rounded-2xl px-3 py-2', isMine ? 'bg-primary text-primary-foreground' : 'bg-secondary')}>
                {!isMine && <p className="mb-0.5 text-[11px] font-semibold text-brand-pink">{m.senderName}</p>}
                {m.mediaUrl && (
                  m.mediaMimeType?.startsWith('video/') ? (
                    <video src={resolveServerUrl(m.mediaUrl)} controls className="mb-1 max-h-64 w-full rounded-lg" />
                  ) : (
                    <img src={resolveServerUrl(m.mediaUrl)} alt="" className="mb-1 max-h-64 w-full rounded-lg object-cover" />
                  )
                )}
                {m.content && <p className="whitespace-pre-wrap break-words text-sm">{m.content}</p>}
                <p className={cn('mt-0.5 text-[10px]', isMine ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                  {formatTime(m.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="border-t pt-2">
        {!premiumAccess && (
          <button
            type="button"
            onClick={() => setPaywallOpen(true)}
            className="mb-2 flex w-full items-center justify-between rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-left transition-colors hover:bg-destructive/10"
          >
            <div>
              <p className="font-medium text-destructive">Acesso bloqueado</p>
              <p className="text-sm text-muted-foreground">Assine para participar da conversa do grupo.</p>
            </div>
            <Lock className="h-4 w-4 text-destructive" />
          </button>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleAttach(f); e.target.value = ''; }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={uploading}
            onClick={() => (premiumAccess ? fileInputRef.current?.click() : setPaywallOpen(true))}
          >
            <ImageIcon className="h-5 w-5" />
          </Button>
          <textarea
            placeholder="Mensagem para o grupo..."
            value={message}
            readOnly={!premiumAccess}
            onMouseDown={!premiumAccess ? (e) => { e.preventDefault(); setPaywallOpen(true); } : undefined}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
            rows={1}
            className="max-h-28 flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
          />
          <Button type="button" size="icon" disabled={!message.trim() || sending} onClick={() => void handleSend()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Members modal */}
      <Dialog open={membersOpen} onOpenChange={setMembersOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Participantes ({group.members.length})</DialogTitle>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {group.members.map((m) => (
              <div key={m.id} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
                <UserAvatar user={{ name: m.name, avatar: m.avatar }} className="h-9 w-9" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.name}</p>
                  {m.isOrganizer && (
                    <span className="flex items-center gap-1 text-[11px] text-gold-text"><Crown className="h-3 w-3" /> Organizador(a)</span>
                  )}
                </div>
                {isOrganizer && !m.isOrganizer && m.id !== user?.id && (
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void handleRemoveMember(m.id)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Button variant="outline" className="mt-2 gap-2 text-destructive" onClick={() => void handleLeave()}>
            <LogOut className="h-4 w-4" /> Sair do grupo
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

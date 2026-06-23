import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Award, Bell, Check, Gift, Lock, UserCheck, UserX, Heart, MessageCircle, Star, BadgeDollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { chatService, invitesService, notificationsService, privatePhotosService } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { getNotificationHref } from '@/utils/notificationNavigation';

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  description?: string | null;
  isRead: boolean;
  createdAt: string;
  data?: any;
};

function timeAgo(iso: string) {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const min = Math.max(0, Math.floor(ms / 60000));
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const days = Math.floor(h / 24);
  return `${days} d`;
}

export default function Notifications() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const unreadCount = useMemo(() => items.filter((n) => !n.isRead).length, [items]);

  const load = async () => {
    setIsLoading(true);
    try {
      const list = await notificationsService.getNotifications();
      setItems(Array.isArray(list) ? list : []);
    } catch {
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const focus = searchParams.get('focus');
    if (!focus) return;
    if (isLoading) return;
    setFocusedId(focus);
    window.setTimeout(() => {
      const el = document.getElementById(`notification-${focus}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
  }, [searchParams, isLoading]);

  const markAsRead = async (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    try {
      await notificationsService.markAsRead(id);
    } catch {}
  };

  const handleMarkAll = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try {
      await notificationsService.markAllAsRead();
    } catch {}
  };

  const handleApprove = async (notification: NotificationItem) => {
    const requestId = notification?.data?.requestId ? String(notification.data.requestId) : '';
    if (!requestId) return;
    setBusyId(notification.id);
    try {
      await privatePhotosService.approveRequest(requestId);
      await markAsRead(notification.id);
      setItems((prev) => prev.filter((n) => n.id !== notification.id));
      toast({ title: 'Acesso permitido', description: 'Você autorizou o acesso às fotos privadas.' });
    } catch {
      toast({ title: 'Falha ao permitir', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const handleDeny = async (notification: NotificationItem) => {
    const requestId = notification?.data?.requestId ? String(notification.data.requestId) : '';
    if (!requestId) return;
    setBusyId(notification.id);
    try {
      await privatePhotosService.denyRequest(requestId);
      await markAsRead(notification.id);
      setItems((prev) => prev.filter((n) => n.id !== notification.id));
      toast({ title: 'Acesso negado' });
    } catch {
      toast({ title: 'Falha ao negar', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const handleApproveInvite = async (notification: NotificationItem) => {
    const inviteId = notification?.data?.inviteId ? String(notification.data.inviteId) : '';
    if (!inviteId) return;
    setBusyId(notification.id);
    try {
      await invitesService.approve(inviteId);
      await markAsRead(notification.id);
      setItems((prev) => prev.filter((n) => n.id !== notification.id));
      toast({ title: 'Convite aprovado', description: 'O novo perfil já pode entrar na rede.' });
    } catch {
      toast({ title: 'Falha ao aprovar', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const handleDenyInvite = async (notification: NotificationItem) => {
    const inviteId = notification?.data?.inviteId ? String(notification.data.inviteId) : '';
    if (!inviteId) return;
    setBusyId(notification.id);
    try {
      await invitesService.deny(inviteId);
      await markAsRead(notification.id);
      setItems((prev) => prev.filter((n) => n.id !== notification.id));
      toast({ title: 'Convite negado', description: 'Esse cadastro não foi aprovado por você.' });
    } catch {
      toast({ title: 'Falha ao negar', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const handleNotificationClick = async (notification: NotificationItem) => {
    if (!notification) return;
    if (notification.type === 'profile.liked' && notification?.data?.actorId) {
      try {
        const actorId = String(notification.data.actorId);
        const conversation = await chatService.createConversation(actorId);
        const conversationId = conversation?.id ? String(conversation.id) : '';
        await markAsRead(notification.id);
        if (conversationId) {
          navigate('/chat', { state: { conversationId } });
          return;
        }
      } catch {}
    }
    await markAsRead(notification.id);
    navigate(getNotificationHref(notification));
  };

  return (
    <div className="max-w-2xl mx-auto w-full min-w-0 overflow-x-hidden">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between min-w-0">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Notificações</h1>
          <p className="text-muted-foreground">Fique por dentro de tudo</p>
        </div>
        <Button variant="ghost" size="sm" className="w-full sm:w-auto gap-2" onClick={() => void handleMarkAll()} disabled={isLoading || unreadCount === 0}>
          <Check className="w-4 h-4" />
          Marcar todas como lidas
        </Button>
      </div>

      {/* Notifications List */}
      <div className="space-y-2">
        {isLoading && <div className="text-sm text-muted-foreground">Carregando...</div>}
        {!isLoading && items.length === 0 && <div className="text-sm text-muted-foreground">Sem notificações.</div>}
        {!isLoading &&
          items.map((notification) => {
            const isPrivateRequest = notification.type === 'private_photos.request';
            const isInvitePending = notification.type === 'invite.pending';
            const hasInlineActions = isPrivateRequest || isInvitePending;
            
            const isReferralReward = notification.type === 'referral.reward';

            const Icon = (() => {
              const type = notification.type;
              if (type === 'referral.reward') return Gift;
              if (type === 'promoter.commission') return BadgeDollarSign;
              if (type === 'feed.top_day' || type === 'feed.top_week') return Award;
              if (type === 'story.hot' || type.includes('liked')) return Heart;
              if (type.includes('commented') || type === 'story.comment') return MessageCircle;
              if (type.includes('testimonial')) return Star;
              if (type.includes('invite')) return UserCheck;
              if (type.includes('private_photos')) return Lock;
              return Bell;
            })();

            return (
              <div
                key={notification.id}
                id={`notification-${notification.id}`}
                className={cn(
                  'glass rounded-xl p-4 flex items-start gap-4 hover:bg-secondary/50 transition-colors',
                  !notification.isRead && 'bg-primary/5 border-primary/20',
                  isReferralReward && 'border-emerald-400/40 bg-emerald-500/5 hover:bg-emerald-500/10',
                  focusedId === notification.id && 'ring-2 ring-primary/40'
                )}
                onClick={() => {
                  if (hasInlineActions) return;
                  void handleNotificationClick(notification);
                }}
                role="button"
                tabIndex={0}
              >
                <div className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                  isReferralReward ? 'bg-emerald-500/15' : 'bg-primary/10'
                )}>
                  <Icon className={cn('w-5 h-5', isReferralReward ? 'text-emerald-500' : 'text-primary')} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className={cn(!notification.isRead && 'font-medium')}>{notification.title}</p>
                    {isReferralReward && (
                      <span className="text-xs rounded-full bg-emerald-500/15 text-emerald-600 px-2 py-0.5 font-medium shrink-0">
                        Recompensa
                      </span>
                    )}
                  </div>
                  {notification.description ? <p className="text-sm text-muted-foreground">{notification.description}</p> : null}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground">{timeAgo(notification.createdAt)}</span>
                    {!notification.isRead ? <span className={cn('w-2 h-2 rounded-full', isReferralReward ? 'bg-emerald-500' : 'bg-primary')} /> : null}
                  </div>

                  {isPrivateRequest && (
                    <div className="mt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <Button size="sm" className="gap-2" disabled={busyId === notification.id} onClick={(e) => { e.stopPropagation(); void handleApprove(notification); }}>
                        <UserCheck className="w-4 h-4" />
                        Permitir
                      </Button>
                      <Button size="sm" variant="outline" className="gap-2" disabled={busyId === notification.id} onClick={(e) => { e.stopPropagation(); void handleDeny(notification); }}>
                        <UserX className="w-4 h-4" />
                        Negar
                      </Button>
                    </div>
                  )}

                  {isInvitePending && (
                    <div className="mt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <Button size="sm" className="gap-2" disabled={busyId === notification.id} onClick={(e) => { e.stopPropagation(); void handleApproveInvite(notification); }}>
                        <UserCheck className="w-4 h-4" />
                        Aprovar entrada
                      </Button>
                      <Button size="sm" variant="outline" className="gap-2" disabled={busyId === notification.id} onClick={(e) => { e.stopPropagation(); void handleDenyInvite(notification); }}>
                        <UserX className="w-4 h-4" />
                        Negar
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

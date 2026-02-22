import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Bell, Check, Lock, UserCheck, UserX, Heart, MessageCircle, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { notificationsService, privatePhotosService } from '@/services/api';
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

  return (
    <div className="max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Notificações</h1>
          <p className="text-muted-foreground">Fique por dentro de tudo</p>
        </div>
        <Button variant="ghost" size="sm" className="gap-2" onClick={() => void handleMarkAll()} disabled={isLoading || unreadCount === 0}>
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
            
            const Icon = (() => {
              const type = notification.type;
              if (type.includes('liked')) return Heart;
              if (type.includes('commented')) return MessageCircle;
              if (type.includes('testimonial')) return Star;
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
                  focusedId === notification.id && 'ring-2 ring-primary/40'
                )}
                onClick={() => {
                  void markAsRead(notification.id);
                  navigate(getNotificationHref(notification));
                }}
                role="button"
                tabIndex={0}
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-primary" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className={cn('mb-1', !notification.isRead && 'font-medium')}>{notification.title}</p>
                  {notification.description ? <p className="text-sm text-muted-foreground">{notification.description}</p> : null}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground">{timeAgo(notification.createdAt)}</span>
                    {!notification.isRead ? <span className="w-2 h-2 rounded-full bg-primary" /> : null}
                  </div>

                  {isPrivateRequest && (
                    <div className="flex items-center gap-2 mt-3">
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
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

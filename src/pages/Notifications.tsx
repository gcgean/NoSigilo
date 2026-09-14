import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Award, Bell, Check, ChevronRight, Gift, Lock, UserCheck, UserX, Heart, MessageCircle, Star,
  BadgeDollarSign, Eye, AtSign, Play, CalendarDays, Radar, Coins, Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { invitesService, notificationsService, privatePhotosService } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { getNotificationHref, notificationUnavailableReason } from '@/utils/notificationNavigation';
import { resolveServerUrl } from '@/utils/serverUrl';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  description?: string | null;
  isRead: boolean;
  createdAt: string;
  data?: any;
  /** Miniatura do post/story ao qual a notificação se refere. */
  preview?: {
    imageUrl: string | null;
    isVideo: boolean;
    text: string | null;
    removed: boolean;
    expired: boolean;
  } | null;
  /** Avatar de quem agiu — ausente quando o backend censurou o autor. */
  actorAvatar?: string | null;
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

/** Faixa de data para os cabeçalhos da lista. */
function grupoDe(iso: string): 'Hoje' | 'Ontem' | 'Últimos 7 dias' | 'Anteriores' {
  const d = new Date(iso);
  const hoje = new Date();
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
  const t = d.getTime();
  if (t >= inicioHoje) return 'Hoje';
  if (t >= inicioHoje - 86_400_000) return 'Ontem';
  if (t >= inicioHoje - 7 * 86_400_000) return 'Últimos 7 dias';
  return 'Anteriores';
}

function iconeDo(type: string) {
  if (type === 'referral.reward') return Gift;
  if (type.startsWith('promoter.')) return BadgeDollarSign;
  if (type === 'feed.top_day' || type === 'feed.top_week') return Award;
  if (type.includes('visited') || type === 'radar.viewed') return Eye;
  if (type.endsWith('.mentioned')) return AtSign;
  if (type === 'match.mutual') return Sparkles;
  if (type === 'story.hot' || type.includes('liked') || type === 'profile.favorited') return Heart;
  if (type.includes('commented') || type === 'story.comment' || type === 'comment.replied' || type === 'message.reaction') return MessageCircle;
  if (type.startsWith('radar.')) return Radar;
  if (type === 'event_invitation') return CalendarDays;
  if (type.startsWith('tokens.') || type === 'daily.streak.milestone') return Coins;
  if (type.includes('testimonial')) return Star;
  if (type.includes('invite')) return UserCheck;
  if (type.includes('private_photos')) return Lock;
  return Bell;
}

export default function Notifications() {
  useDocumentTitle('Notificações');
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'todas' | 'nao_lidas'>('todas');

  const unreadCount = useMemo(() => items.filter((n) => !n.isRead).length, [items]);

  const load = async () => {
    setIsLoading(true);
    try {
      const list = await notificationsService.getNotifications({ preview: true });
      const itens: NotificationItem[] = Array.isArray(list) ? list : [];
      setItems(itens);
      // Zera o contador do sino no servidor, mas a lista desta visita continua
      // mostrando o que chegou de novo (estado local intacto). Marcar antes de
      // carregar apagava o destaque.
      if (itens.some((n) => !n.isRead)) void notificationsService.markAllAsRead().catch(() => {});
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

  const acaoInline = async (
    notification: NotificationItem,
    executar: () => Promise<unknown>,
    ok: { title: string; description?: string },
    falha: string,
  ) => {
    setBusyId(notification.id);
    try {
      await executar();
      await markAsRead(notification.id);
      setItems((prev) => prev.filter((n) => n.id !== notification.id));
      toast(ok);
    } catch {
      toast({ title: falha, description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const handleNotificationClick = async (notification: NotificationItem) => {
    // Story vencido ou post apagado: avisa em vez de abrir uma tela vazia —
    // era isso que fazia o toque "não funcionar" nesses casos.
    const indisponivel = notificationUnavailableReason(notification);
    await markAsRead(notification.id);
    if (indisponivel) {
      toast({ title: indisponivel });
      return;
    }
    const href = getNotificationHref(notification);
    if (href) navigate(href);
  };

  const visiveis = filtro === 'nao_lidas' ? items.filter((n) => !n.isRead) : items;
  const grupos = useMemo(() => {
    const ordem = ['Hoje', 'Ontem', 'Últimos 7 dias', 'Anteriores'] as const;
    const mapa = new Map<string, NotificationItem[]>();
    for (const n of visiveis) {
      const g = grupoDe(n.createdAt);
      if (!mapa.has(g)) mapa.set(g, []);
      mapa.get(g)!.push(n);
    }
    return ordem.filter((g) => mapa.has(g)).map((g) => ({ titulo: g, itens: mapa.get(g)! }));
  }, [visiveis]);

  return (
    <div className="max-w-2xl mx-auto w-full min-w-0 overflow-x-hidden">
      {/* Header */}
      <div className="mb-4 flex items-end justify-between gap-3 min-w-0">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Notificações</h1>
          <p className="text-sm text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} não lida${unreadCount > 1 ? 's' : ''}` : 'Tudo em dia'}
          </p>
        </div>
        <Button variant="ghost" size="sm" className="shrink-0 gap-2" onClick={() => void handleMarkAll()} disabled={isLoading || unreadCount === 0}>
          <Check className="w-4 h-4" />
          <span className="hidden sm:inline">Marcar todas como lidas</span>
          <span className="sm:hidden">Ler todas</span>
        </Button>
      </div>

      {/* Filtro */}
      <div className="mb-4 flex gap-2">
        {([
          { id: 'todas' as const, rotulo: 'Todas' },
          { id: 'nao_lidas' as const, rotulo: `Não lidas${unreadCount > 0 ? ` (${unreadCount})` : ''}` },
        ]).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFiltro(f.id)}
            aria-pressed={filtro === f.id}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              filtro === f.id ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {f.rotulo}
          </button>
        ))}
      </div>

      {isLoading && <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>}
      {!isLoading && visiveis.length === 0 && (
        <div className="glass rounded-2xl p-8 text-center">
          <Bell className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {filtro === 'nao_lidas' ? 'Nenhuma notificação não lida.' : 'Sem notificações por enquanto.'}
          </p>
        </div>
      )}

      <div className="space-y-5">
        {!isLoading && grupos.map((grupo) => (
          <section key={grupo.titulo}>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{grupo.titulo}</h2>
            <div className="space-y-2">
              {grupo.itens.map((notification) => {
                const isPrivateRequest = notification.type === 'private_photos.request';
                const isInvitePending = notification.type === 'invite.pending';
                const hasInlineActions = isPrivateRequest || isInvitePending;
                const isReferralReward = notification.type === 'referral.reward';
                const Icon = iconeDo(notification.type);
                const preview = notification.preview;
                const indisponivel = notificationUnavailableReason(notification);
                const navegavel = !hasInlineActions && !indisponivel && !!getNotificationHref(notification);
                // A descrição já diz quem fez o quê ("Casaldosul curtiu sua
                // publicação"); o título repetia a mesma coisa em outras
                // palavras. Vira a linha principal, e o título só aparece
                // sozinho quando não há descrição.
                const principal = notification.description?.trim() || notification.title;

                return (
                  <div
                    key={notification.id}
                    id={`notification-${notification.id}`}
                    className={cn(
                      'glass flex items-center gap-3 rounded-xl p-3 transition-colors',
                      !hasInlineActions && 'cursor-pointer hover:bg-secondary/50 active:scale-[0.99]',
                      !notification.isRead && 'border-primary/25 bg-primary/5',
                      isReferralReward && 'border-emerald-400/40 bg-emerald-500/5 hover:bg-emerald-500/10',
                      focusedId === notification.id && 'ring-2 ring-primary/40',
                    )}
                    onClick={() => {
                      if (hasInlineActions) return;
                      void handleNotificationClick(notification);
                    }}
                    onKeyDown={(e) => {
                      if (hasInlineActions) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        void handleNotificationClick(notification);
                      }
                    }}
                    role={hasInlineActions ? undefined : 'button'}
                    tabIndex={hasInlineActions ? undefined : 0}
                  >
                    {/* Avatar de quem agiu, com o ícone do tipo no canto */}
                    <div className="relative shrink-0">
                      {notification.actorAvatar ? (
                        <img
                          src={resolveServerUrl(notification.actorAvatar)}
                          alt=""
                          loading="lazy"
                          className="h-11 w-11 rounded-full object-cover"
                        />
                      ) : (
                        <div className={cn(
                          'flex h-11 w-11 items-center justify-center rounded-full',
                          isReferralReward ? 'bg-emerald-500/15' : 'bg-primary/10',
                        )}>
                          <Icon className={cn('h-5 w-5', isReferralReward ? 'text-emerald-500' : 'text-primary')} />
                        </div>
                      )}
                      {notification.actorAvatar && (
                        <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-primary">
                          <Icon className="h-2.5 w-2.5 text-white" />
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className={cn('text-sm leading-snug', !notification.isRead ? 'font-semibold' : 'font-normal')}>
                          {principal}
                        </p>
                        {isReferralReward && (
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                            Recompensa
                          </span>
                        )}
                      </div>
                      {/* Trecho do post comentado / texto do story, para lembrar do que se trata */}
                      {preview?.text && !preview.imageUrl && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">“{preview.text}”</p>
                      )}
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {!notification.isRead && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                        {timeAgo(notification.createdAt)}
                        {indisponivel && <span>· {preview?.expired ? 'story expirado' : 'removido'}</span>}
                      </p>

                      {isPrivateRequest && (
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                          <Button size="sm" className="gap-2" disabled={busyId === notification.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              const requestId = String(notification.data?.requestId || '');
                              if (!requestId) return;
                              void acaoInline(notification, () => privatePhotosService.approveRequest(requestId),
                                { title: 'Acesso permitido', description: 'Você autorizou o acesso às fotos privadas.' }, 'Falha ao permitir');
                            }}>
                            <UserCheck className="h-4 w-4" />
                            Permitir
                          </Button>
                          <Button size="sm" variant="outline" className="gap-2" disabled={busyId === notification.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              const requestId = String(notification.data?.requestId || '');
                              if (!requestId) return;
                              void acaoInline(notification, () => privatePhotosService.denyRequest(requestId),
                                { title: 'Acesso negado' }, 'Falha ao negar');
                            }}>
                            <UserX className="h-4 w-4" />
                            Negar
                          </Button>
                        </div>
                      )}

                      {isInvitePending && (
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                          <Button size="sm" className="gap-2" disabled={busyId === notification.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              const inviteId = String(notification.data?.inviteId || '');
                              if (!inviteId) return;
                              void acaoInline(notification, () => invitesService.approve(inviteId),
                                { title: 'Convite aprovado', description: 'O novo perfil já pode entrar na rede.' }, 'Falha ao aprovar');
                            }}>
                            <UserCheck className="h-4 w-4" />
                            Aprovar entrada
                          </Button>
                          <Button size="sm" variant="outline" className="gap-2" disabled={busyId === notification.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              const inviteId = String(notification.data?.inviteId || '');
                              if (!inviteId) return;
                              void acaoInline(notification, () => invitesService.deny(inviteId),
                                { title: 'Convite negado', description: 'Esse cadastro não foi aprovado por você.' }, 'Falha ao negar');
                            }}>
                            <UserX className="h-4 w-4" />
                            Negar
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Miniatura do post/story, à direita */}
                    {preview && (preview.imageUrl || preview.isVideo) && (
                      <div className={cn('relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-secondary', indisponivel && 'opacity-40')}>
                        {preview.imageUrl ? (
                          <img src={resolveServerUrl(preview.imageUrl)} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Play className="h-4 w-4 fill-current text-muted-foreground" />
                          </div>
                        )}
                      </div>
                    )}

                    {navegavel && !(preview && (preview.imageUrl || preview.isVideo)) && (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

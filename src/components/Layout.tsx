import { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Home, 
  Heart, 
  MessageCircle, 
  User, 
  Bell, 
  Search,
  LogOut,
  Settings,
  Calendar,
  Shield,
  Star,
  Crown,
  Radio,
  UserPlus,
  CheckCircle2,
  Circle,
  Camera,
  Send,
  PartyPopper,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import HelpButton from '@/components/HelpButton';
import FirstAccessTutorial from '@/components/FirstAccessTutorial';
import { notificationsService, chatService } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { useSocket } from '@/contexts/SocketContext';
import { resolveServerUrl } from '@/utils/serverUrl';
import { ToastAction } from '@/components/ui/toast';
import { getNotificationHref } from '@/utils/notificationNavigation';
import BrandLogo from '@/components/BrandLogo';

const navItems = [
  { path: '/feed', icon: Home, label: 'Feed' },
  { path: '/match', icon: Heart, label: 'Match' },
  { path: '/radar', icon: Radio, label: 'Radar' },
  { path: '/chat', icon: MessageCircle, label: 'Chat' },
  { path: '/profile', icon: User, label: 'Perfil' },
];

const extraNavItems = [
  { path: '/invites', icon: UserPlus, label: 'Gerar/Gerenciar convites', highlight: true },
  { path: '/search', icon: Search, label: 'Buscar' },
  { path: '/events', icon: Calendar, label: 'Eventos' },
  { path: '/favorites', icon: Star, label: 'Favoritos' },
  { path: '/subscriptions', icon: Crown, label: 'Planos' },
];

function parseValidDate(value?: string | null) {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(time) ? null : time;
}

function formatRemainingTime(targetMs: number, nowMs: number) {
  const diff = targetMs - nowMs;
  if (diff <= 0) return 'expirado';

  const hours = Math.ceil(diff / (1000 * 60 * 60));
  if (hours <= 24) return `${hours}h restantes`;

  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return `${days} dia(s) restantes`;
}

function formatDetailedRemainingTime(targetMs: number, nowMs: number) {
  const diff = targetMs - nowMs;
  if (diff <= 0) return null;

  const totalMinutes = Math.floor(diff / (1000 * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes - days * 24 * 60) / 60);
  const minutes = totalMinutes - days * 24 * 60 - hours * 60;
  return `${days} dia(s), ${hours} hora(s) e ${minutes} minuto(s)`;
}

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { socket } = useSocket();
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [unreadConversationsCount, setUnreadConversationsCount] = useState(0);
  const [hasUnreadMatch, setHasUnreadMatch] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now());
  const [firstAccessFlow, setFirstAccessFlow] = useState<{ needsPhoto?: boolean; needsPost?: boolean } | null>(null);
  const [showFirstAccessReward, setShowFirstAccessReward] = useState(false);
  const [firstAccessFlowVersion, setFirstAccessFlowVersion] = useState(0);
  const hadFirstAccessFlowRef = useRef(false);
  const subscriptionsEnabled = user?.subscriptionsEnabled !== false;
  const trialEnds = parseValidDate(user?.trialEndsAt);
  const licenseEnds = parseValidDate(user?.hubLicenseEndAt);
  const trialDaysLeft =
    trialEnds !== null ? Math.ceil((trialEnds - clockNow) / (1000 * 60 * 60 * 24)) : null;
  const firstAccessRewardKey = user?.id ? `nosigilo:first-access-reward:${user.id}` : null;
  const accessCountdown = useMemo(() => {
    if (!user) return null;
    if (!subscriptionsEnabled) return null;

    if (!user.isPremium) {
      if (trialEnds === null) {
        return {
          href: '/subscriptions',
          tone: 'danger',
          title: 'Seu acesso nao esta ativo',
          label: 'Acesso inativo',
        };
      }
      const expiresSoon = trialEnds - clockNow <= 24 * 60 * 60 * 1000;
      return {
        href: '/subscriptions',
        tone: expiresSoon ? 'danger' : 'muted',
        title: trialEnds <= clockNow ? 'Seu acesso grátis expirou' : `Acesso grátis: ${formatRemainingTime(trialEnds, clockNow)}`,
        label: trialEnds <= clockNow ? 'Acesso expirado' : formatRemainingTime(trialEnds, clockNow),
      };
    }

    if (licenseEnds === null) {
      return {
        href: '/subscriptions',
        tone: 'danger',
        title: 'Assinatura sem data de vencimento disponível',
        label: 'Assinante sem prazo',
      };
    }
    const diff = licenseEnds - clockNow;

    return {
      href: '/subscriptions',
      tone: diff <= 24 * 60 * 60 * 1000 ? 'danger' : 'premium',
      title: diff <= 0 ? 'Sua licença premium expirou' : `Assinatura ativa: ${formatRemainingTime(licenseEnds, clockNow)}`,
      label: diff <= 0 ? 'Licença expirada' : `Assinante: ${formatRemainingTime(licenseEnds, clockNow)}`,
    };
  }, [clockNow, licenseEnds, subscriptionsEnabled, trialEnds, user]);

  const accessBanner = useMemo(() => {
    if (!subscriptionsEnabled) return null;
    if (!user || user.isPremium) return null;

    if (trialEnds !== null && trialEnds > clockNow) {
      const detailed = formatDetailedRemainingTime(trialEnds, clockNow);
      return {
        href: '/subscriptions',
        tone: 'trial' as const,
        message: detailed
          ? `Seu teste grátis acaba em ${detailed}`
          : 'Seu teste grátis está ativo.',
        cta: 'ASSINE AGORA',
      };
    }

    return {
      href: '/subscriptions',
      tone: 'inactive' as const,
      message: 'Seu acesso está inativo ou sua licença venceu. Assine para continuar com todos os recursos.',
      cta: 'VER PLANOS',
    };
  }, [clockNow, subscriptionsEnabled, trialEnds, user]);

  const visibleExtraNavItems = useMemo(
    () => extraNavItems.filter((item) => subscriptionsEnabled || item.path !== '/subscriptions'),
    [subscriptionsEnabled]
  );

  const firstAccessChecklist = useMemo(() => {
    const steps = [
      {
        key: 'photo',
        title: '1. Foto de perfil',
        description: user?.avatar || !firstAccessFlow?.needsPhoto ? 'Concluida' : 'Envie sua foto principal',
        done: Boolean(user?.avatar || !firstAccessFlow?.needsPhoto),
        action: () => navigate('/profile?firstAccess=photo#profile-photo'),
        icon: Camera,
      },
      {
        key: 'post',
        title: '2. Primeira publicação',
        description: !firstAccessFlow?.needsPost ? 'Concluida' : 'Compartilhe seu primeiro post',
        done: Boolean(!firstAccessFlow?.needsPost),
        action: () => navigate('/feed?firstAccess=post'),
        icon: Send,
      },
    ];
    const completed = steps.filter((step) => step.done).length;
    const progress = Math.round((completed / steps.length) * 100);
    return { steps, completed, progress, remaining: steps.length - completed };
  }, [firstAccessFlow?.needsPhoto, firstAccessFlow?.needsPost, navigate, user?.avatar]);

  useEffect(() => {
    const handleFlowChange = () => setFirstAccessFlowVersion((value) => value + 1);
    window.addEventListener('nosigilo:first-access-flow-changed', handleFlowChange as EventListener);
    return () => {
      window.removeEventListener('nosigilo:first-access-flow-changed', handleFlowChange as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const key = `nosigilo:first-access-flow:${user.id}`;
    hadFirstAccessFlowRef.current = hadFirstAccessFlowRef.current || Boolean(localStorage.getItem(key));
    if (firstAccessRewardKey && sessionStorage.getItem(firstAccessRewardKey) === '1') {
      setShowFirstAccessReward(true);
    }
    const raw = localStorage.getItem(key);
    if (!raw) {
      setFirstAccessFlow(null);
      return;
    }

    try {
      const flow = JSON.parse(raw) as { needsPhoto?: boolean; needsPost?: boolean };
      const nextFlow = { ...flow };
      if (nextFlow.needsPhoto && user.avatar) nextFlow.needsPhoto = false;
      setFirstAccessFlow(nextFlow);

      if (nextFlow.needsPhoto || nextFlow.needsPost) {
        localStorage.setItem(key, JSON.stringify(nextFlow));
        return;
      }

      localStorage.removeItem(key);
      setFirstAccessFlow(null);
      if (firstAccessRewardKey) {
        sessionStorage.setItem(firstAccessRewardKey, '1');
        setShowFirstAccessReward(true);
      }
    } catch {
      localStorage.removeItem(key);
      setFirstAccessFlow(null);
    }
  }, [firstAccessFlowVersion, firstAccessRewardKey, user?.avatar, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    if (!firstAccessRewardKey) return;
    const flowKey = `nosigilo:first-access-flow:${user.id}`;
    const hasFlow = Boolean(localStorage.getItem(flowKey));
    if (hasFlow) {
      hadFirstAccessFlowRef.current = true;
      return;
    }
    if (!hadFirstAccessFlowRef.current) return;
    if (sessionStorage.getItem(firstAccessRewardKey) === '1') {
      setShowFirstAccessReward(true);
    }
  }, [firstAccessRewardKey, user?.id, location.key]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const refreshUnread = async () => {
      try {
        const [notifs, chatUnread] = await Promise.all([
          notificationsService.getNotifications(),
          chatService.getUnreadCount()
        ]);
        const unread = Array.isArray(notifs) ? notifs.filter((n: any) => !n?.isRead) : [];
        if (!cancelled) {
          setUnreadCount(unread.length);
          setUnreadMessagesCount(chatUnread.messagesCount || 0);
          setUnreadConversationsCount(chatUnread.conversationsCount || 0);
          setHasUnreadMatch(unread.some((n: any) => n.type === 'profile.liked'));
        }
      } catch {}
    };
    void refreshUnread();
    const intervalId = window.setInterval(() => void refreshUnread(), 20000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!socket || !user) return;
    const handler = (n: any) => {
      const href = getNotificationHref(n);
      toast({
        title: String(n?.title || 'Nova notificação'),
        description: n?.description ? String(n.description) : undefined,
        action: (
          <ToastAction
            altText="Abrir"
            onClick={() => {
              if (n?.id) void notificationsService.markAsRead(String(n.id)).catch(() => {});
              setUnreadCount((c) => Math.max(0, c - 1));
              navigate(href);
            }}
          >
            Abrir
          </ToastAction>
        ),
      });
      setUnreadCount((c) => c + 1);
      if (n.type === 'profile.liked') setHasUnreadMatch(true);
    };
    const messageHandler = (msg: any) => {
      if (msg && msg.senderId !== user?.id) {
        setUnreadMessagesCount((c) => c + 1);
        // We don't easily know if it's a new conversation without state,
        // so we rely on the next refreshUnread poll (20s) for the conversation count.
      }
    };
    socket.on('notification.created', handler);
    socket.on('message.created', messageHandler);
    socket.on('message.new', messageHandler);
    return () => {
      socket.off('notification.created', handler);
      socket.off('message.created', messageHandler);
      socket.off('message.new', messageHandler);
    };
  }, [socket, toast, user?.id, navigate]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setClockNow(Date.now()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <FirstAccessTutorial />
      {/* Header */}
      <header className="sticky top-0 z-40 glass-strong border-b">
        <div className="container mx-auto flex h-16 items-center justify-between gap-4 px-3 sm:px-4">
          <NavLink to="/feed" className="flex min-w-0 shrink-0 items-center gap-2">
            <BrandLogo
              size="sm"
              className="gap-2"
              markClassName="shadow-[0_12px_28px_rgba(169,59,255,0.34)]"
              textClassName="hidden sm:block truncate text-xl"
            />
          </NavLink>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:gap-2">
            <NavLink to="/notifications">
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="w-5 h-5" />
                {unreadCount > 0 ? (
                  <span className="absolute top-1 right-1 inline-flex items-center justify-center min-w-5 h-5 px-1 text-xs rounded-full bg-primary text-primary-foreground">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                ) : null}
              </Button>
            </NavLink>

            <HelpButton />

            {accessCountdown && (
              <NavLink to={accessCountdown.href} className="hidden min-w-0 shrink sm:block">
                <Badge
                  className={cn(
                    'max-w-[112px] truncate rounded-full px-2 py-1 text-[11px] md:max-w-[152px] lg:max-w-[180px] lg:px-3 xl:max-w-none',
                    accessCountdown.tone === 'danger'
                      ? 'bg-destructive text-destructive-foreground'
                      : accessCountdown.tone === 'premium'
                        ? 'border border-gold/30 bg-gold/15 text-gold'
                        : 'bg-secondary text-secondary-foreground'
                  )}
                  title={accessCountdown.title}
                >
                  {accessCountdown.label}
                </Badge>
              </NavLink>
            )}

            {subscriptionsEnabled ? (
              <NavLink to="/subscriptions" className="shrink-0 sm:hidden">
                <Button variant="ghost" size="icon" className="relative" aria-label="Ver planos">
                  <Crown className="w-5 h-5 text-gold" />
                  {!user?.isPremium ? (
                    <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-destructive" />
                  ) : null}
                </Button>
              </NavLink>
            ) : null}

            <NavLink to="/profile" className="shrink-0 flex items-center gap-2">
              <div
                className={cn(
                  'rounded-full transition-all',
                  user?.isPremium
                    ? 'bg-gradient-to-br from-amber-200 via-yellow-400 to-amber-500 p-[3px] shadow-[0_0_0_1px_rgba(251,191,36,0.35),0_10px_24px_rgba(245,158,11,0.28)]'
                    : ''
                )}
              >
                <div className="h-9 w-9 shrink-0 rounded-full bg-secondary overflow-hidden">
                  {user?.avatar ? (
                    <img src={resolveServerUrl(user.avatar)} alt={user.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <User className="w-5 h-5" />
                    </div>
                  )}
                </div>
              </div>
            </NavLink>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="hidden md:flex w-64 border-r glass flex-col p-4 sticky top-16 h-[calc(100dvh-4rem)] overflow-y-auto">
          <nav className="flex-1 space-y-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg transition-all relative",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                  {item.path === '/match' && hasUnreadMatch && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-destructive animate-pulse" />
                  )}
                  {item.path === '/chat' && unreadMessagesCount > 0 && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
                      {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                    </span>
                  )}
                </NavLink>
              );
            })}

            <div className="border-t my-3" />

            {visibleExtraNavItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg transition-all relative",
                    item.highlight && !isActive && "bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90",
                    item.highlight && isActive && "bg-primary text-primary-foreground shadow-glow",
                    !item.highlight &&
                      (isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary")
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                  {item.highlight ? (
                    <Badge className={cn("ml-auto text-[10px]", isActive ? "bg-white/15 text-white" : "bg-white/20 text-white")}>
                      Novo
                    </Badge>
                  ) : null}
                </NavLink>
              );
            })}
          </nav>

          <div className="border-t pt-4 space-y-1">
            {user?.isAdmin && (
              <NavLink
                to="/admin"
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                  location.pathname === "/admin"
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <Shield className="w-5 h-5" />
                <span className="font-medium">Admin</span>
                <Badge className="ml-auto bg-destructive text-xs">Admin</Badge>
              </NavLink>
            )}

            <NavLink
              to="/settings"
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                location.pathname === "/settings"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              <Settings className="w-5 h-5" />
              <span className="font-medium">Configurações</span>
            </NavLink>

            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">Sair</span>
            </button>
          </div>
        </aside>

        <main className="flex-1 min-w-0 px-3 py-4 pb-24 sm:px-4 sm:py-6 md:pb-6">
          <div className="mx-auto w-full max-w-6xl">
            {accessBanner ? (
              <div className="mb-4">
                <NavLink
                  to={accessBanner.href}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-white shadow-[0_14px_40px_rgba(91,33,182,0.18)] transition hover:opacity-95',
                    accessBanner.tone === 'trial'
                      ? 'bg-[linear-gradient(90deg,hsl(273_51%_43%),hsl(267_48%_41%))]'
                      : 'bg-[linear-gradient(90deg,hsl(355_78%_56%),hsl(8_84%_58%))]'
                  )}
                >
                  <span className="min-w-0 text-sm sm:text-base">{accessBanner.message}</span>
                  <span className="shrink-0 text-sm font-semibold uppercase tracking-[0.08em] underline underline-offset-4">
                    {accessBanner.cta}
                  </span>
                </NavLink>
              </div>
            ) : null}
            {accessCountdown && (
              <div className="mb-4 sm:hidden">
                {accessCountdown.tone === 'premium' ? (
                  <NavLink to="/subscriptions" className="inline-flex max-w-full">
                    <Badge
                      className="max-w-full truncate rounded-full border border-gold/30 bg-gold/15 px-3 py-1.5 text-xs text-gold"
                      title={accessCountdown.title}
                    >
                      {accessCountdown.label}
                    </Badge>
                  </NavLink>
                ) : (
                  <NavLink
                    to="/subscriptions"
                    className={cn(
                      'flex items-center justify-between rounded-2xl border px-4 py-3',
                      accessCountdown.tone === 'danger'
                        ? 'border-destructive/30 bg-destructive/5'
                        : 'border-gold/30 bg-gradient-to-r from-gold/15 to-primary/10'
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {accessCountdown.tone === 'danger' ? 'Regularize sua assinatura' : 'Assine um plano'}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {accessCountdown.label}
                      </p>
                    </div>
                    <Crown className="h-5 w-5 shrink-0 text-gold" />
                  </NavLink>
                )}
              </div>
            )}
            <div className="mb-4 md:hidden">
              <NavLink
                to="/invites"
                className="flex items-center gap-3 rounded-2xl bg-gradient-primary px-4 py-4 text-primary-foreground shadow-glow transition hover:opacity-95"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/16">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">Gerar/Gerenciar convites</p>
                    <Badge className="shrink-0 bg-white/20 text-[10px] text-white">Novo</Badge>
                  </div>
                  <p className="truncate text-xs text-white/85">Crie links exclusivos e acompanhe quem entrou pela sua indicação.</p>
                </div>
              </NavLink>
            </div>
            {showFirstAccessReward ? (
              <div className="mb-4">
                <div className="relative overflow-hidden rounded-2xl border border-emerald-300/40 bg-gradient-to-r from-emerald-500/12 via-lime-400/10 to-amber-400/12 p-4 shadow-[0_18px_48px_rgba(16,185,129,0.12)]">
                  <button
                    type="button"
                    onClick={() => {
                      if (firstAccessRewardKey) sessionStorage.removeItem(firstAccessRewardKey);
                      setShowFirstAccessReward(false);
                    }}
                    className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground transition hover:bg-background/70 hover:text-foreground"
                    aria-label="Fechar conquista"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div className="flex flex-col gap-3 pr-8 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg">
                        <PartyPopper className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">Perfil liberado</p>
                        <h2 className="text-lg font-bold sm:text-xl">100% pronto. Seu perfil ja estreou do jeito certo.</h2>
                        <p className="text-sm text-muted-foreground">
                          Foto principal e primeira publicacao concluidas. Agora e so aproveitar a rede com mais destaque e contexto.
                        </p>
                      </div>
                    </div>
                    <Badge className="w-fit rounded-full bg-emerald-600 px-3 py-1 text-white">Conquista desbloqueada</Badge>
                  </div>
                </div>
              </div>
            ) : null}
            {user?.id && firstAccessFlow && (firstAccessFlow.needsPhoto || firstAccessFlow.needsPost) ? (
              <div className="mb-4">
                <div className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/12 via-rose-500/10 to-orange-400/10 p-4 shadow-[0_12px_40px_rgba(236,72,153,0.08)]">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-primary">Jornada premium de primeiro acesso</p>
                      <h2 className="text-lg font-bold sm:text-xl">
                        {firstAccessChecklist.progress}% pronto. Seu perfil esta quase pronto para chamar mais atencao.
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {firstAccessChecklist.remaining === 2
                          ? 'Comece pela foto principal e depois faca sua primeira publicacao.'
                          : 'Falta so mais um passo para liberar sua estreia completa na rede.'}
                      </p>
                      <div className="mt-3 flex items-center gap-3">
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/60 sm:max-w-xs">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-primary via-rose-500 to-orange-400 transition-all duration-500"
                            style={{ width: `${firstAccessChecklist.progress}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                          {firstAccessChecklist.completed}/2 concluidos
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      {firstAccessChecklist.steps.map((step) => (
                        <button
                          key={step.key}
                          type="button"
                          onClick={step.action}
                          className={cn(
                            'flex items-center gap-3 rounded-xl border bg-background/80 px-4 py-3 text-left transition hover:bg-background',
                            step.done && 'border-emerald-300/60 bg-emerald-50/70'
                          )}
                        >
                          {step.done ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                          ) : (
                            <Circle className="h-5 w-5 text-primary" />
                          )}
                          <div>
                            <div className="text-sm font-medium">{step.title}</div>
                            <div className="text-xs text-muted-foreground">{step.description}</div>
                          </div>
                          <step.icon className="ml-1 h-4 w-4 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            <Outlet />
          </div>
        </main>
      </div>

      <nav className="sticky bottom-0 z-40 glass-strong border-t md:hidden pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around h-16 px-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center gap-1 px-2 py-2 rounded-lg transition-colors relative",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <item.icon className={cn("w-5 h-5", isActive && "animate-scale-in")} />
                <span className="max-w-full truncate text-[11px]">{item.label}</span>
                {item.path === '/match' && hasUnreadMatch && (
                  <span className="absolute top-2 right-4 w-2 h-2 rounded-full bg-destructive animate-pulse" />
                )}
                {item.path === '/chat' && unreadMessagesCount > 0 && (
                  <span className="absolute top-1 right-3 min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white border-2 border-background">
                    {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

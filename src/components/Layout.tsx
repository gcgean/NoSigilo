import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Home,
  Heart,
  MessageCircle,
  User,
  Bell,
  Search,
  Clapperboard,
  LogOut,
  Settings,
  Calendar,
  Shield,
  Star,
  Crown,
  Radio,
  Sparkles,
  UserPlus,
  Users,
  CheckCircle2,
  Circle,
  Camera,
  Send,
  PartyPopper,
  X,
  Gift,
  Moon,
  Sun,
  BadgeDollarSign,
  Coins,
  Plus,
  LifeBuoy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import FirstAccessTutorial from '@/components/FirstAccessTutorial';
import WelcomeModal from '@/components/WelcomeModal';
import TokenBadge from '@/components/TokenBadge';
import { notificationsService, chatService } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { useSocket } from '@/contexts/SocketContext';
import { resolveServerUrl } from '@/utils/serverUrl';
import { ToastAction } from '@/components/ui/toast';
import { getNotificationHref } from '@/utils/notificationNavigation';
import BrandLogo from '@/components/BrandLogo';
import PhotoGateOverlay from '@/components/PhotoGateOverlay';
import ScreenGuard from '@/components/ScreenGuard';
import RadarNightPrompt from '@/components/RadarNightPrompt';
import OnboardingModal from '@/components/OnboardingModal';
import CityRequiredModal from '@/components/CityRequiredModal';
import DailyAvailabilityModal from '@/components/DailyAvailabilityModal';
import WeekendAdventureModal from '@/components/WeekendAdventureModal';
import SubscribeModal from '@/components/SubscribeModal';
import SupportChatDialog from '@/components/SupportChatDialog';
import InviteModal from '@/components/InviteModal';
import { hasPremiumAccess } from '@/utils/premium';
import { saveLastAuthRoute } from '@/utils/sessionNavigation';
import { useTheme } from '@/contexts/ThemeContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { syncPushSubscription } from '@/utils/pushNotifications';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const navItems = [
  { path: '/feed', icon: Home, label: 'Feed' },
  { path: '/match', icon: Heart, label: 'Match' },
  { path: '/radar', icon: Radio, label: 'Radar' },
  { path: '/chat', icon: MessageCircle, label: 'Chat' },
  { path: '/friends', icon: Users, label: 'Amigos' },
  { path: '/tokens', icon: Coins, label: 'Tokens' },
  { path: '/profile', icon: User, label: 'Perfil' },
];

const mobileNavItems = [
  { path: '/feed',    icon: Home,         label: 'Feed' },
  { path: '/match',   icon: Heart,        label: 'Match' },
  { path: '/stories', icon: Sparkles,     label: 'Stories' },
  { path: '/chat',    icon: MessageCircle,label: 'Chat' },
  { path: '/search',  icon: Search,       label: 'Buscar' },
];

const extraNavItems = [
  { path: '/invites', icon: UserPlus, label: 'Gerar/Gerenciar convites', highlight: true },
  { path: '/ganhe', icon: BadgeDollarSign, label: 'Ganhe dinheiro 💰', highlight: true },
  { path: '/search', icon: Search, label: 'Buscar' },
  { path: '/reels', icon: Clapperboard, label: 'Rap' },
  { path: '/videos', icon: Search, label: 'Buscar Vídeos' },
  { path: '/events', icon: Calendar, label: 'Eventos' },
  { path: '/favorites', icon: Heart, label: 'Curtidos' },
  { path: '/subscriptions', icon: Crown, label: 'Planos' },
];

const PWA_INSTALL_DISMISS_KEY = 'nosigilo:pwa-install-dismissed-date';
const INTERESTS_NUDGE_DISMISS_KEY = 'nosigilo:interests-nudge-dismissed-date';

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
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { socket } = useSocket();
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [radarSheetOpen, setRadarSheetOpen] = useState(false);
  const [unreadConversationsCount, setUnreadConversationsCount] = useState(0);
  const [hasUnreadMatch, setHasUnreadMatch] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now());
  const [firstAccessFlow, setFirstAccessFlow] = useState<{ needsPhoto?: boolean; needsPost?: boolean } | null>(null);
  const [showFirstAccessReward, setShowFirstAccessReward] = useState(false);
  const [firstAccessFlowVersion, setFirstAccessFlowVersion] = useState(0);
  const [bannerDismissed, setBannerDismissed] = useState(
    () => sessionStorage.getItem('nosigilo:banner-dismissed') === '1'
  );
  const [promoterBannerDismissed, setPromoterBannerDismissed] = useState(() => {
    try {
      const v = localStorage.getItem('nosigilo:promoter-banner-dismissed');
      if (!v) return false;
      // Reaparece após 7 dias
      return Date.now() - new Date(v).getTime() < 7 * 24 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  });
  const isMobile = useIsMobile();
  const isMobileChatRoute = isMobile && location.pathname === '/chat';
  const isMobileReelsRoute = isMobile && location.pathname === '/reels';
  const [isChatConvOpen, setIsChatConvOpen] = useState(false);
  const [isReelsMaximized, setIsReelsMaximized] = useState(false);
  const isMobileReelsMaximized = isMobileReelsRoute && isReelsMaximized;
  const shouldHideMobileNav = (isMobileChatRoute && isChatConvOpen) || isMobileReelsMaximized;

  // Track when Chat.tsx sets data-chat-open on body (conversation selected on mobile)
  useEffect(() => {
    const check = () => {
      setIsChatConvOpen(document.body.hasAttribute('data-chat-open'));
      setIsReelsMaximized(document.body.hasAttribute('data-reels-maximized'));
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-chat-open', 'data-reels-maximized'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isMobileChatRoute) {
      document.body.removeAttribute('data-chat-open');
      setIsChatConvOpen(false);
    }
    if (!isMobileReelsRoute) {
      document.body.removeAttribute('data-reels-maximized');
      setIsReelsMaximized(false);
    }
  }, [isMobileChatRoute, isMobileReelsRoute, location.pathname]);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPwaInstallPrompt, setShowPwaInstallPrompt] = useState(false);
  const [interestsNudgeDismissed, setInterestsNudgeDismissed] = useState(() => {
    const today = new Date().toISOString().slice(0, 10);
    return localStorage.getItem(INTERESTS_NUDGE_DISMISS_KEY) === today;
  });
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const subscriptionsEnabled = user?.subscriptionsEnabled !== false;
  const trialEnds = parseValidDate(user?.trialEndsAt);
  const licenseEnds = parseValidDate(user?.hubLicenseEndAt);
  const trialDaysLeft =
    trialEnds !== null ? Math.ceil((trialEnds - clockNow) / (1000 * 60 * 60 * 24)) : null;
  const firstAccessRewardSeenKey = user?.id ? `nosigilo:first-access-reward-seen:${user.id}` : null;
  const refreshUnread = useCallback(async () => {
    try {
      const [notifs, chatUnread] = await Promise.all([
        notificationsService.getNotifications(),
        chatService.getUnreadCount()
      ]);
      const unread = Array.isArray(notifs) ? notifs.filter((n: any) => !n?.isRead) : [];
      setUnreadCount(unread.length);
      setUnreadMessagesCount(chatUnread.messagesCount || 0);
      setUnreadConversationsCount(chatUnread.conversationsCount || 0);
      setHasUnreadMatch(unread.some((n: any) => n.type === 'profile.liked'));
    } catch {}
  }, []);

  const accessCountdown = useMemo(() => {
    if (!user) return null;
    if (!subscriptionsEnabled) return null;

    const hasAccess = hasPremiumAccess(user);

    if (hasAccess) {
      if (user.isPremium && licenseEnds !== null) {
        const diff = licenseEnds - clockNow;
        return {
          href: '/subscriptions',
          tone: diff <= 24 * 60 * 60 * 1000 ? 'danger' : 'premium',
          title: `Assinatura ativa: ${formatRemainingTime(licenseEnds, clockNow)}`,
          label: `Assinante: ${formatRemainingTime(licenseEnds, clockNow)}`,
        };
      }
      if (trialEnds !== null && trialEnds > clockNow) {
        const expiresSoon = trialEnds - clockNow <= 24 * 60 * 60 * 1000;
        return {
          href: '/subscriptions',
          tone: expiresSoon ? 'danger' : 'muted',
          title: `Acesso grátis: ${formatRemainingTime(trialEnds, clockNow)}`,
          label: formatRemainingTime(trialEnds, clockNow),
        };
      }
      return {
        href: '/subscriptions',
        tone: 'premium',
        title: 'Assinatura Premium ativa',
        label: 'Assinante Premium',
      };
    }

    if (user.isPremium && licenseEnds !== null && licenseEnds <= clockNow) {
      return {
        href: '/subscriptions',
        tone: 'danger',
        title: 'Sua licença premium expirou — renove agora',
        label: 'Licença expirada',
      };
    }

    if (trialEnds !== null) {
      return {
        href: '/subscriptions',
        tone: 'danger',
        title: trialEnds <= clockNow ? 'Seu acesso grátis expirou' : `Acesso grátis: ${formatRemainingTime(trialEnds, clockNow)}`,
        label: trialEnds <= clockNow ? 'Acesso expirado' : formatRemainingTime(trialEnds, clockNow),
      };
    }

    return {
      href: '/subscriptions',
      tone: 'danger',
      title: 'Seu acesso não está ativo',
      label: 'Acesso inativo',
    };
  }, [clockNow, licenseEnds, subscriptionsEnabled, trialEnds, user]);

  const accessBanner = useMemo(() => {
    // Banner de cobrança/upgrade do topo ocultado a pedido (a conversão fica por
    // conta dos paywalls contextuais). Para reativar, remova o return null abaixo.
    return null as null | { href: string; tone: 'trial' | 'inactive'; message: string; cta: string };
    if (!subscriptionsEnabled) return null;
    if (!user || hasPremiumAccess(user)) return null;

    if (trialEnds !== null && trialEnds > clockNow) {
      const detailed = formatDetailedRemainingTime(trialEnds, clockNow);
      const expiresSoon = trialEnds - clockNow <= 24 * 60 * 60 * 1000;
      return {
        href: '/subscriptions',
        tone: 'trial' as const,
        message: expiresSoon
          ? `⏰ Seu teste grátis acaba em ${detailed || 'menos de 1 dia'}! Continue Premium por apenas R$ 9,90/mês.`
          : detailed
            ? `Seu teste grátis acaba em ${detailed}. Garanta o Premium por apenas R$ 9,90/mês.`
            : 'Seu teste grátis está ativo. Premium por apenas R$ 9,90/mês.',
        cta: expiresSoon ? 'ASSINAR R$ 9,90' : 'ASSINE AGORA',
      };
    }

    const licenseExpired = user.isPremium && licenseEnds !== null && licenseEnds <= clockNow;
    return {
      href: '/subscriptions',
      tone: 'inactive' as const,
      message: licenseExpired
        ? 'Sua assinatura Premium venceu! Renove agora e continue aproveitando tudo.'
        : 'Desbloqueie radar, vídeos, eventos e muito mais. Premium por apenas R$ 9,90/mês.',
      cta: licenseExpired ? 'RENOVAR R$ 9,90' : 'ASSINAR R$ 9,90',
    };
  }, [clockNow, subscriptionsEnabled, trialEnds, licenseEnds, user]);

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
    saveLastAuthRoute(`${location.pathname}${location.search}${location.hash}`);
  }, [location.hash, location.pathname, location.search]);

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
    if (firstAccessRewardSeenKey && localStorage.getItem(firstAccessRewardSeenKey) === '1') {
      setShowFirstAccessReward(false);
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
      if (firstAccessRewardSeenKey && localStorage.getItem(firstAccessRewardSeenKey) !== '1') {
        // Marca como exibido para nunca mais reaparecer em novos acessos
        localStorage.setItem(firstAccessRewardSeenKey, '1');
        setShowFirstAccessReward(true);
      }
    } catch {
      localStorage.removeItem(key);
      setFirstAccessFlow(null);
    }
  }, [firstAccessFlowVersion, firstAccessRewardSeenKey, user?.avatar, user?.id]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const refreshUnreadSafe = async () => {
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
    void refreshUnreadSafe();
    const intervalId = window.setInterval(() => void refreshUnreadSafe(), 20000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const handleResume = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void refreshUnread();
    };
    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('pageshow', handleResume);
    return () => {
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('pageshow', handleResume);
    };
  }, [refreshUnread, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    void syncPushSubscription().catch(() => {});
  }, [user?.id]);

  const handleNotificationsBellClick = useCallback(() => {
    if (unreadCount <= 0) return;
    setUnreadCount(0);
    setHasUnreadMatch(false);
    void notificationsService.markAllAsRead().catch(() => {
      void refreshUnread();
    });
  }, [refreshUnread, unreadCount]);

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

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    const installedHandler = () => {
      setShowPwaInstallPrompt(false);
      setDeferredInstallPrompt(null);
    };
    window.addEventListener('appinstalled', installedHandler);
    return () => window.removeEventListener('appinstalled', installedHandler);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setShowPwaInstallPrompt(false);
      return;
    }
    if (typeof window === 'undefined') return;
    const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches || (window.navigator as any)?.standalone === true;
    if (standalone) {
      setShowPwaInstallPrompt(false);
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(PWA_INSTALL_DISMISS_KEY) === today) {
      setShowPwaInstallPrompt(false);
      return;
    }
    setShowPwaInstallPrompt(true);
  }, [isMobile, location.pathname]);

  const dismissPwaInstallPrompt = () => {
    localStorage.setItem(PWA_INSTALL_DISMISS_KEY, new Date().toISOString().slice(0, 10));
    setShowPwaInstallPrompt(false);
  };

  const dismissPromoterBanner = () => {
    try { localStorage.setItem('nosigilo:promoter-banner-dismissed', new Date().toISOString()); } catch {}
    setPromoterBannerDismissed(true);
  };

  const dismissInterestsNudge = () => {
    localStorage.setItem(INTERESTS_NUDGE_DISMISS_KEY, new Date().toISOString().slice(0, 10));
    setInterestsNudgeDismissed(true);
  };

  const hasEmptyInterests =
    !interestsNudgeDismissed &&
    !!user &&
    !user.lookingFor?.length &&
    !user.fetiches?.length &&
    !user.intentions?.length;

  const handlePwaInstall = async () => {
    if (deferredInstallPrompt) {
      try {
        await deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if (choice?.outcome === 'accepted') {
          setShowPwaInstallPrompt(false);
          setDeferredInstallPrompt(null);
          return;
        }
      } catch {}
      dismissPwaInstallPrompt();
      return;
    }

    toast({
      title: 'Instalar NoSigilo.net',
      description:
        'No iPhone: toque no botão Compartilhar do Safari e depois em "Adicionar à Tela de Início".',
    });
    dismissPwaInstallPrompt();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <WelcomeModal />
      <FirstAccessTutorial />
      {/* Header */}
      {!isMobileReelsMaximized && (
      <header className="sticky top-0 z-40 glass-strong border-b">
        <div className="container mx-auto flex h-14 items-center justify-between gap-2 px-3 sm:h-16 sm:gap-4 sm:px-4">
          <NavLink to="/feed" className="flex min-w-0 shrink-0 items-center gap-2">
            <BrandLogo
              size="sm"
              className="gap-2"
              markClassName="h-9 w-9 rounded-lg p-2 shadow-[0_12px_28px_rgba(169,59,255,0.34)] sm:h-10 sm:w-10 sm:rounded-xl"
              textClassName="hidden sm:block truncate text-xl"
            />
          </NavLink>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-1 sm:gap-2">
            <TokenBadge />
            <NavLink to="/notifications" onClick={handleNotificationsBellClick}>
              <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-full sm:h-10 sm:w-10">
                <Bell className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                {unreadCount > 0 ? (
                  <span className="absolute right-0.5 top-0.5 inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground sm:right-1 sm:top-1 sm:min-w-5 sm:h-5 sm:text-xs">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                ) : null}
              </Button>
            </NavLink>

            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full sm:h-10 sm:w-10"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
              title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
            >
              {theme === 'dark'
                ? <Sun className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-amber-400" />
                : <Moon className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
              }
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full sm:h-10 sm:w-10"
              onClick={() => setRadarSheetOpen(true)}
              aria-label="Divulgar: ativar radar ou criar evento"
              title="Divulgar (Radar / Evento)"
            >
              <Plus className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
            </Button>

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

            {/* Radar — mobile-only header icon */}
            <NavLink to="/radar" className="shrink-0 md:hidden" aria-label="Radar">
              <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-full">
                <Radio className="h-4.5 w-4.5" />
              </Button>
            </NavLink>

            {subscriptionsEnabled ? (
              <NavLink to="/subscriptions" className="shrink-0 sm:hidden">
                <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-full" aria-label="Ver planos">
                  <Crown className="h-4.5 w-4.5 text-gold" />
                  {!hasPremiumAccess(user) ? (
                    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-destructive" />
                  ) : null}
                </Button>
              </NavLink>
            ) : null}

            <NavLink to="/profile" className="shrink-0 flex items-center gap-2">
              <div
                className={cn(
                  'rounded-full transition-all',
                  hasPremiumAccess(user)
                    ? 'bg-gradient-to-br from-amber-200 via-yellow-400 to-amber-500 p-[3px] shadow-[0_0_0_1px_rgba(251,191,36,0.35),0_10px_24px_rgba(245,158,11,0.28)]'
                    : ''
                )}
              >
                <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-secondary sm:h-9 sm:w-9">
                  {user?.avatar ? (
                    <img src={resolveServerUrl(user.avatar)} alt={user.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <User className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                    </div>
                  )}
                </div>
              </div>
            </NavLink>

            {/* Logout — mobile only */}
            <button
              type="button"
              onClick={logout}
              className="md:hidden shrink-0 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              aria-label="Sair"
            >
              <LogOut className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>
      </header>
      )}

      <div className="flex flex-1 min-h-0">
        <aside className="hidden md:flex w-64 border-r glass flex-col p-4 sticky top-16 h-[calc(100dvh-4rem)] overflow-y-auto">
          <nav className="flex-1 space-y-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={(e) => {
                    if (location.pathname === item.path) {
                      e.preventDefault();
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }}
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

            {/* Suporte — mesmo estilo dos itens acima, mas abre o chat direto
                em vez de navegar (não tem rota própria). */}
            <button
              type="button"
              onClick={() => setSupportOpen(true)}
              className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-muted-foreground transition-all hover:bg-secondary hover:text-foreground"
            >
              <LifeBuoy className="h-5 w-5" />
              <span className="font-medium">Suporte</span>
            </button>
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

        <main
          className={cn(
            'flex-1 min-w-0 px-3 py-3 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:px-4 sm:py-6 md:pb-6',
            isMobileChatRoute && 'overflow-hidden px-0 py-0 pb-0 sm:px-0 sm:py-0',
            isMobileReelsRoute && 'overflow-hidden px-0 py-0 pb-0 sm:px-0 sm:py-0'
          )}
        >
          <div className={cn('mx-auto w-full max-w-6xl', (isMobileChatRoute || isMobileReelsRoute) && 'max-w-none h-full')}>
            {!isMobileChatRoute && accessBanner && !bannerDismissed ? (
              <div className="mb-4">
                <div
                  className={cn(
                    'relative flex w-full flex-col gap-3 rounded-2xl px-4 py-3 text-white shadow-[0_14px_40px_rgba(91,33,182,0.18)] sm:flex-row sm:items-center sm:justify-between',
                    accessBanner.tone === 'trial'
                      ? 'bg-[linear-gradient(90deg,hsl(273_51%_43%),hsl(267_48%_41%))]'
                      : 'bg-[linear-gradient(90deg,hsl(355_78%_56%),hsl(8_84%_58%))]'
                  )}
                >
                  <span className="min-w-0 text-sm sm:text-base">{accessBanner.message}</span>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowSubscribeModal(true)}
                      className="rounded-lg border border-white/40 bg-white/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-white/25"
                    >
                      {accessBanner.cta}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowInviteModal(true)}
                      className="flex items-center gap-1.5 rounded-lg border border-white/40 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90 transition hover:bg-white/20"
                    >
                      <Gift className="h-3.5 w-3.5" />
                      Convidar 3 amigos
                    </button>
                  </div>
                  <button
                    type="button"
                    aria-label="Fechar aviso"
                    onClick={() => {
                      setBannerDismissed(true);
                      sessionStorage.setItem('nosigilo:banner-dismissed', '1');
                    }}
                    className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-white/70 transition hover:bg-white/25 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : null}
            {!isMobileChatRoute && showPwaInstallPrompt ? (
              <div className="mb-4">
                <div className="rounded-2xl border border-primary/25 bg-primary/10 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-primary">Deseja instalar o app?</p>
                      <p className="text-sm text-muted-foreground">
                        Instale o NoSigilo.net no celular para abrir como aplicativo e acessar mais rápido.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={dismissPwaInstallPrompt}>
                        Agora não
                      </Button>
                      <Button type="button" size="sm" className="bg-gradient-primary hover:opacity-90" onClick={() => void handlePwaInstall()}>
                        Instalar app
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {!isMobileChatRoute && hasEmptyInterests ? (
              <div className="mb-4">
                <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-amber-500">✨ Complete seu perfil</p>
                      <p className="text-sm text-muted-foreground">
                        Preencha seus interesses e fetiches para aparecer nos resultados certos e encontrar perfis compatíveis.
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={dismissInterestsNudge}>
                        Agora não
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="bg-amber-500 text-white hover:bg-amber-600"
                        onClick={() => { navigate('/settings?tab=interesses'); dismissInterestsNudge(); }}
                      >
                        Preencher interesses
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            {!isMobileChatRoute && accessCountdown && !bannerDismissed && (
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
                ) : null}
              </div>
            )}
            {!isMobileChatRoute && !promoterBannerDismissed && location.pathname !== '/ganhe' && location.pathname !== '/promoter' && location.pathname !== '/match' && (
              <div className="mb-4">
                <div className="relative flex items-center justify-between gap-2 rounded-2xl px-4 py-3 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 text-white shadow-[0_8px_24px_rgba(16,185,129,0.25)]">
                  <button
                    type="button"
                    onClick={() => navigate(user?.isPromoter ? '/promoter' : '/ganhe')}
                    className="flex flex-1 items-center gap-2.5 min-w-0 text-left transition-opacity hover:opacity-95"
                  >
                    <span className="text-xl shrink-0">💰</span>
                    <p className="text-sm font-semibold leading-tight">
                      {user?.isPromoter
                        ? 'Acessar área do promotor'
                        : 'Ganhe até R$1.980/mês indicando a plataforma — 100% grátis'}
                    </p>
                    <span className="ml-1 shrink-0 text-xs font-bold text-yellow-300 whitespace-nowrap">
                      {user?.isPromoter ? 'Ver painel →' : 'Saiba como →'}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="Dispensar"
                    onClick={dismissPromoterBanner}
                    className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-black/20 text-white/80 transition hover:bg-black/40 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
            {!isMobileChatRoute && showFirstAccessReward ? (
              <div className="mb-4">
                <div className="relative overflow-hidden rounded-2xl border border-emerald-300/40 bg-gradient-to-r from-emerald-500/12 via-lime-400/10 to-amber-400/12 p-4 shadow-[0_18px_48px_rgba(16,185,129,0.12)]">
                  <button
                    type="button"
                    onClick={() => {
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
            {!isMobileChatRoute && user?.id && firstAccessFlow && (firstAccessFlow.needsPhoto || firstAccessFlow.needsPost) ? (
              <div className="mb-4">
                <div className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/12 via-rose-500/10 to-orange-400/10 p-4 shadow-[0_12px_40px_rgba(236,72,153,0.08)]">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-primary">Jornada premium de primeiro acesso</p>
                      <h2 className="text-lg font-bold sm:text-xl">
                        {firstAccessChecklist.progress}% pronto. Seu perfil está quase pronto para chamar mais atenção.
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
            <Suspense
              fallback={
                <div className="flex min-h-[50vh] w-full items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
                </div>
              }
            >
              <Outlet />
            </Suspense>
            <PhotoGateOverlay pathname={location.pathname} />
            <ScreenGuard />
            <RadarNightPrompt />
            <SubscribeModal open={showSubscribeModal} onClose={() => setShowSubscribeModal(false)} />
            <SupportChatDialog open={supportOpen} onClose={() => setSupportOpen(false)} />
            <InviteModal open={showInviteModal} onClose={() => setShowInviteModal(false)} />
          </div>
        </main>
      </div>

      <WeekendAdventureModal />
      <DailyAvailabilityModal />
      <OnboardingModal />
      <CityRequiredModal />
      <nav className={cn(
        "sticky bottom-0 z-40 border-t bg-background/96 backdrop-blur-md supports-[backdrop-filter]:bg-background/82 md:hidden pb-[env(safe-area-inset-bottom)]",
        shouldHideMobileNav && "hidden"
      )}>
        <div className="flex items-center justify-around h-14 px-1">
          {mobileNavItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Fragment key={item.path}>
                <NavLink
                  to={item.path}
                  onClick={(e) => {
                    if (location.pathname === item.path) {
                      e.preventDefault();
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }}
                  className={cn(
                    "relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <item.icon className={cn("h-4.5 w-4.5", isActive && "animate-scale-in")} />
                  <span className="max-w-full truncate text-[10px] leading-4">{item.label}</span>
                  {item.path === '/match' && hasUnreadMatch && (
                    <span className="absolute right-4 top-1.5 h-2 w-2 rounded-full bg-destructive animate-pulse" />
                  )}
                  {item.path === '/chat' && unreadMessagesCount > 0 && (
                    <span className="absolute right-2.5 top-0.5 flex h-4.5 min-w-[1.1rem] items-center justify-center rounded-full border-2 border-background bg-destructive px-1 text-[9px] font-bold text-white">
                      {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                    </span>
                  )}
                </NavLink>
              </Fragment>
            );
          })}
          <NavLink
            to="/videos"
            className={({ isActive }) => cn(
              "relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 transition-colors",
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Clapperboard className="h-4.5 w-4.5" />
            <span className="max-w-full truncate text-[10px] leading-4">Vídeos</span>
          </NavLink>
          {/* Atalho para promotor/convites — no desktop fica na sidebar; no mobile
              precisa de uma entrada fixa. Vai ao painel se já for promotor, senão
              à landing de ativação. */}
          <NavLink
            to={user?.isPromoter ? '/promoter' : '/ganhe'}
            className={cn(
              "relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 transition-colors",
              (location.pathname === '/promoter' || location.pathname === '/ganhe' || location.pathname === '/invites')
                ? "text-amber-500"
                : "text-amber-500/80 hover:text-amber-500"
            )}
          >
            <BadgeDollarSign className="h-4.5 w-4.5" />
            <span className="max-w-full truncate text-[10px] leading-4">Ganhe $</span>
          </NavLink>
        </div>
      </nav>

      {/* Folha de ação do botão central: Ativar Radar ou Criar Evento */}
      <Dialog open={radarSheetOpen} onOpenChange={setRadarSheetOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Atalhos rápidos</DialogTitle>
            <DialogDescription>
              Divulgue-se para perfis compatíveis, crie eventos ou veja seus amigos.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => { setRadarSheetOpen(false); navigate('/radar'); }}
              className="flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Radio className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-bold">Ativar Radar</span>
                <span className="block text-xs text-muted-foreground">Avise que você está disponível agora na sua região.</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => { setRadarSheetOpen(false); navigate('/friends'); }}
              className="flex items-start gap-3 rounded-xl border border-sky-400/25 bg-sky-400/5 p-4 text-left transition-colors hover:bg-sky-400/10"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-400/15 text-sky-400">
                <Users className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-bold">Amigos</span>
                <span className="block text-xs text-muted-foreground">Veja sua lista de amigos e os perfis que viraram match.</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => { setRadarSheetOpen(false); navigate('/events'); }}
              className="flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-400/5 p-4 text-left transition-colors hover:bg-amber-400/10"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-500">
                <Calendar className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-bold">Criar Evento</span>
                <span className="block text-xs text-muted-foreground">Divulgue um encontro, festa ou viagem para a comunidade.</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => { setRadarSheetOpen(false); window.dispatchEvent(new Event('nosigilo:open-welcome')); }}
              className="flex items-start gap-3 rounded-xl border border-rose-400/25 bg-rose-400/5 p-4 text-left transition-colors hover:bg-rose-400/10"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-400/15 text-rose-400">
                <Sparkles className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-bold">Conheça a plataforma</span>
                <span className="block text-xs text-muted-foreground">Veja de novo tudo o que você pode fazer no NoSigilo.</span>
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

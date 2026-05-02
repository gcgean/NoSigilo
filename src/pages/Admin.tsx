import { useEffect, useMemo, useState } from 'react';
import {
  Users, Image, DollarSign, FileText, Shield, Ban, Check, X,
  Eye, Search, Filter, TrendingUp, Flag, ExternalLink, Globe2, MapPin, MousePointerClick,
  Lightbulb, CheckCircle2, Clock, XCircle, MessageSquare, ChevronDown, ChevronUp, Monitor, Smartphone, Tablet
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthContext';
import { Link, Navigate } from 'react-router-dom';
import { adminService } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { resolveServerUrl } from '@/utils/serverUrl';

type AdminPhoto = {
  id: string;
  url: string;
  userId: string;
  userName: string;
  uploadedAt?: string;
  status?: string;
};

type AdminUser = {
  id: string;
  name: string;
  email?: string;
  avatar?: string | null;
  isPremium?: boolean;
  isAdmin?: boolean;
  createdAt?: string;
  lastSeenAt?: string | null;
  trialEndsAt?: string | null;
  hubLicenseEndAt?: string | null;
  hubAccessStatus?: string | null;
  isOnline?: boolean;
  status: 'active' | 'banned';
  isDeactivated?: boolean;
  deactivatedAt?: string | null;
  deactivatedByAdmin?: boolean;
  reports: number;
};

type FinanceSummary = {
  revenue: number;
  subscribers: number;
  newToday: number;
  churnRate: number;
};

type LogItem = {
  id?: string;
  action?: string;
  user?: string;
  details?: string;
  date?: string;
};

type AdminSettings = {
  subscriptionsEnabled: boolean;
};

type AdminResourcesStatus = {
  checkedAt: string;
  nodeVersion: string;
  platform: string;
  uptimeSec: number;
  cpu: {
    count: number;
    usagePercent: number;
    loadAvg1m: number;
    loadAvg5m: number;
    loadAvg15m: number;
  };
  memory: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
    externalMb: number;
    arrayBuffersMb: number;
    systemTotalMb: number;
    systemFreeMb: number;
    systemUsedMb: number;
    processUsagePercent: number;
    systemUsagePercent: number;
  };
};

type AdminReport = {
  id: string;
  reporterName: string;
  reporterEmail: string | null;
  targetType: string;
  targetId: string;
  targetName: string | null;
  reason: string;
  details: string | null;
  status: string;
  createdAt: string;
};

type VisitBreakdown = {
  label: string;
  count: number;
  percentage?: number;
};

type VisitHistoryItem = {
  id: string;
  createdAt: string;
  pagePath: string;
  pageTitle: string | null;
  originType: string;
  referrer: string | null;
  referrerDomain: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  country: string | null;
  region?: string | null;
  timezone: string | null;
  language: string | null;
  deviceType: string;
  userName: string | null;
  userEmail: string | null;
};

type TopAccessUser = {
  userId: string;
  name: string;
  email: string | null;
  accesses: number;
  activeDays: number;
  frequency: number;
  lastAccessAt: string | null;
};

type VisitAnalytics = {
  total: number;
  today: number;
  last7Days: number;
  uniqueToday: number;
  onlineNow: number;
  byDay: VisitBreakdown[];
  byRegion: VisitBreakdown[];
  byAccessCity: VisitBreakdown[];
  byUserCity: VisitBreakdown[];
  byDevice: VisitBreakdown[];
  cityUsersTotal: number;
  cityUsersPeriodDays: number | null;
  topUsers: TopAccessUser[];
  byOrigin: VisitBreakdown[];
  byCountry: VisitBreakdown[];
  byPage: VisitBreakdown[];
  history: VisitHistoryItem[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const DEFAULT_FINANCE: FinanceSummary = {
  revenue: 0,
  subscribers: 0,
  newToday: 0,
  churnRate: 0,
};

const DEFAULT_VISIT_ANALYTICS: VisitAnalytics = {
  total: 0,
  today: 0,
  last7Days: 0,
  uniqueToday: 0,
  onlineNow: 0,
  byDay: [],
  byRegion: [],
  byAccessCity: [],
  byUserCity: [],
  byDevice: [],
  cityUsersTotal: 0,
  cityUsersPeriodDays: null,
  topUsers: [],
  byOrigin: [],
  byCountry: [],
  byPage: [],
  history: [],
};

function parseDate(value?: string | null) {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(time) ? null : time;
}

function formatDateTime(value?: string | null) {
  const time = parseDate(value);
  if (time === null) return 'Nunca';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(time);
}

function formatAccessRemaining(entry: AdminUser) {
  const now = Date.now();
  const target = entry.isPremium ? parseDate(entry.hubLicenseEndAt) : parseDate(entry.trialEndsAt);
  if (target === null) return entry.isPremium ? 'Sem data da licença' : 'Sem trial ativo';
  const diff = target - now;
  if (diff <= 0) return entry.isPremium ? 'Licença expirada' : 'Trial expirado';

  const hours = Math.ceil(diff / (1000 * 60 * 60));
  if (hours <= 24) return `${hours}h restantes`;
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return `${days} dia(s) restantes`;
}

function getDeviceMeta(deviceType: string) {
  const normalized = String(deviceType || '').toLowerCase();
  if (normalized === 'mobile') {
    return { label: 'Celular', icon: Smartphone };
  }
  if (normalized === 'tablet') {
    return { label: 'Tablet', icon: Tablet };
  }
  return { label: 'Computador', icon: Monitor };
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}

function formatUptimeLabel(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.trunc(totalSeconds || 0));
  const days = Math.floor(safeSeconds / 86400);
  const hours = Math.floor((safeSeconds % 86400) / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function getUsageHealth(percent: number) {
  const safe = clampPercent(percent);
  if (safe >= 90) return { label: 'Muito alto', tone: 'text-destructive', bar: 'bg-destructive' };
  if (safe >= 75) return { label: 'Atenção', tone: 'text-amber-600', bar: 'bg-amber-500' };
  return { label: 'Saudável', tone: 'text-emerald-600', bar: 'bg-emerald-500' };
}

export default function Admin() {
  const USERS_PAGE_SIZE = 200;
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const [photos, setPhotos] = useState<AdminPhoto[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersOnlineNow, setUsersOnlineNow] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [hasMoreUsers, setHasMoreUsers] = useState(false);
  const [isLoadingMoreUsers, setIsLoadingMoreUsers] = useState(false);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [finance, setFinance] = useState<FinanceSummary>(DEFAULT_FINANCE);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [busyPhotoId, setBusyPhotoId] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AdminSettings>({ subscriptionsEnabled: true });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isLoadingResourcesStatus, setIsLoadingResourcesStatus] = useState(false);
  const [resourcesStatus, setResourcesStatus] = useState<AdminResourcesStatus | null>(null);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [busyReportId, setBusyReportId] = useState<string | null>(null);
  const [visitAnalytics, setVisitAnalytics] = useState<VisitAnalytics>(DEFAULT_VISIT_ANALYTICS);
  const [cityUsersPeriod, setCityUsersPeriod] = useState<'all' | '30' | '90' | '365'>('all');
  const cpuUsagePercent = resourcesStatus
    ? clampPercent(
        resourcesStatus.cpu.usagePercent || (
          resourcesStatus.cpu.count > 0
            ? (resourcesStatus.cpu.loadAvg1m / resourcesStatus.cpu.count) * 100
            : 0
        )
      )
    : 0;
  const memoryUsagePercent = resourcesStatus ? clampPercent(resourcesStatus.memory.systemUsagePercent) : 0;
  const cpuHealth = getUsageHealth(cpuUsagePercent);
  const memoryHealth = getUsageHealth(memoryUsagePercent);

  useEffect(() => {
    let cancelled = false;

    const normalizeUsers = (input: unknown) => {
      const usersArray = Array.isArray(input)
        ? input
        : isRecord(input) && Array.isArray((input as any).users)
          ? ((input as any).users as unknown[])
          : [];
      const total = isRecord(input) && typeof (input as any).total === 'number'
        ? Number((input as any).total)
        : usersArray.length;
      const page = isRecord(input) && typeof (input as any).page === 'number'
        ? Number((input as any).page)
        : 1;
      const hasMore = isRecord(input) && typeof (input as any).hasMore === 'boolean'
        ? Boolean((input as any).hasMore)
        : usersArray.length >= USERS_PAGE_SIZE;
      const onlineNow = isRecord(input) && typeof (input as any).onlineNow === 'number'
        ? Number((input as any).onlineNow)
        : 0;

      const mapped = usersArray.map((entry) => {
        const item = isRecord(entry) ? entry : {};
        return {
          id: String(item.id || ''),
          name: String(item.name || 'Usuário'),
          email: item.email ? String(item.email) : undefined,
          avatar: item.avatar ? resolveServerUrl(String(item.avatar)) : undefined,
          isPremium: !!item.isPremium,
          isAdmin: !!item.isAdmin,
          createdAt: item.createdAt ? String(item.createdAt) : undefined,
          lastSeenAt: item.lastSeenAt ? String(item.lastSeenAt) : null,
          trialEndsAt: item.trialEndsAt ? String(item.trialEndsAt) : null,
          hubLicenseEndAt: item.hubLicenseEndAt ? String(item.hubLicenseEndAt) : null,
          hubAccessStatus: item.hubAccessStatus ? String(item.hubAccessStatus) : null,
          isOnline: !!item.isOnline,
          status: item.isBanned ? 'banned' as const : 'active' as const,
          isDeactivated: !!item.isDeactivated,
          deactivatedAt: item.deactivatedAt ? String(item.deactivatedAt) : null,
          deactivatedByAdmin: !!item.deactivatedByAdmin,
          reports: 0,
        } satisfies AdminUser;
      });

      return { mapped, total, page, hasMore, onlineNow };
    };

    const load = async () => {
      setIsLoading(true);
      try {
        const [rawPhotos, rawUsersResult, rawLogs, rawFinance, rawSettings, rawReportsResult] = await Promise.all([
          adminService.getPendingPhotos().catch(() => []),
          adminService.getUsers({ page: 1, limit: USERS_PAGE_SIZE }).catch(() => []),
          adminService.getLogs().catch(() => []),
          adminService.getFinanceSummary().catch(() => null),
          adminService.getSettings().catch(() => null),
          adminService.getReports('pending').catch(() => []),
        ]);
        const rawReports = rawReportsResult;

        if (cancelled) return;

        setPhotos(
          Array.isArray(rawPhotos)
            ? rawPhotos.map((photo) => {
                const item = isRecord(photo) ? photo : {};
                return {
                  id: String(item.id || ''),
                  url: resolveServerUrl(String(item.url || '')),
                  userId: String(item.userId || ''),
                  userName: String(item.userName || 'Usuário'),
                  uploadedAt: item.uploadedAt ? String(item.uploadedAt) : undefined,
                  status: item.status ? String(item.status) : 'pending',
                };
              })
            : []
        );

        const normalizedUsers = normalizeUsers(rawUsersResult);
        const pendingReportCounts = new Map<string, number>();
        if (Array.isArray(rawReports)) {
          for (const entry of rawReports) {
            const item = isRecord(entry) ? entry : {};
            const targetType = String(item.targetType || '');
            const targetId = String(item.targetId || '');
            if (targetType !== 'user' || !targetId) continue;
            pendingReportCounts.set(targetId, (pendingReportCounts.get(targetId) || 0) + 1);
          }
        }
        setUsers(
          normalizedUsers.mapped.map((entry) => ({
            ...entry,
            reports: pendingReportCounts.get(entry.id) || 0,
          }))
        );
        setUsersTotal(normalizedUsers.total);
        setUsersPage(normalizedUsers.page);
        setHasMoreUsers(normalizedUsers.hasMore);
        setUsersOnlineNow(normalizedUsers.onlineNow);

        setLogs(
          Array.isArray(rawLogs)
            ? rawLogs.map((entry) => {
                const item = isRecord(entry) ? entry : {};
                return {
                  id: item.id ? String(item.id) : undefined,
                  action: item.action ? String(item.action) : undefined,
                  user: item.user ? String(item.user) : undefined,
                  details: item.details ? String(item.details) : undefined,
                  date: item.date ? String(item.date) : undefined,
                };
              })
            : []
        );
        setFinance(isRecord(rawFinance) ? { ...DEFAULT_FINANCE, ...rawFinance } as FinanceSummary : DEFAULT_FINANCE);
        setSettings({
          subscriptionsEnabled: rawSettings?.subscriptionsEnabled !== false,
        });
        setReports(
          Array.isArray(rawReports)
            ? rawReports.map((entry) => {
                const item = isRecord(entry) ? entry : {};
                return {
                  id: String(item.id || ''),
                  reporterName: String(item.reporterName || 'Usuário'),
                  reporterEmail: item.reporterEmail ? String(item.reporterEmail) : null,
                  targetType: String(item.targetType || 'user'),
                  targetId: String(item.targetId || ''),
                  targetName: item.targetName ? String(item.targetName) : null,
                  reason: String(item.reason || ''),
                  details: item.details ? String(item.details) : null,
                  status: String(item.status || 'pending'),
                  createdAt: String(item.createdAt || ''),
                };
              })
            : []
        );
      } catch {
        if (cancelled) return;
        toast({
          title: 'Falha ao carregar o painel',
          description: 'Não foi possível buscar os dados administrativos.',
          variant: 'destructive',
        });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    const periodDays = cityUsersPeriod === 'all' ? undefined : Number(cityUsersPeriod);
    adminService.getVisitAnalytics(120, periodDays)
      .then((rawVisitAnalytics) => {
        if (cancelled) return;
        setVisitAnalytics(isRecord(rawVisitAnalytics) ? { ...DEFAULT_VISIT_ANALYTICS, ...rawVisitAnalytics } as VisitAnalytics : DEFAULT_VISIT_ANALYTICS);
      })
      .catch(() => {
        if (cancelled) return;
        setVisitAnalytics(DEFAULT_VISIT_ANALYTICS);
      });
    return () => {
      cancelled = true;
    };
  }, [cityUsersPeriod]);

  const loadMoreUsers = async () => {
    if (isLoadingMoreUsers || !hasMoreUsers) return;
    const nextPage = usersPage + 1;
    setIsLoadingMoreUsers(true);
    try {
      const reportCountMap = new Map<string, number>();
      for (const report of reports) {
        if (report.targetType !== 'user' || !report.targetId) continue;
        reportCountMap.set(report.targetId, (reportCountMap.get(report.targetId) || 0) + 1);
      }
      const rawUsersResult = await adminService.getUsers({ page: nextPage, limit: USERS_PAGE_SIZE, search: searchQuery || undefined });
      const usersArray = Array.isArray(rawUsersResult)
        ? rawUsersResult
        : isRecord(rawUsersResult) && Array.isArray((rawUsersResult as any).users)
          ? ((rawUsersResult as any).users as unknown[])
          : [];
      const mapped = usersArray.map((entry) => {
        const item = isRecord(entry) ? entry : {};
        return {
          id: String(item.id || ''),
          name: String(item.name || 'Usuário'),
          email: item.email ? String(item.email) : undefined,
          avatar: item.avatar ? resolveServerUrl(String(item.avatar)) : undefined,
          isPremium: !!item.isPremium,
          isAdmin: !!item.isAdmin,
          createdAt: item.createdAt ? String(item.createdAt) : undefined,
          lastSeenAt: item.lastSeenAt ? String(item.lastSeenAt) : null,
          trialEndsAt: item.trialEndsAt ? String(item.trialEndsAt) : null,
          hubLicenseEndAt: item.hubLicenseEndAt ? String(item.hubLicenseEndAt) : null,
          hubAccessStatus: item.hubAccessStatus ? String(item.hubAccessStatus) : null,
          isOnline: !!item.isOnline,
          status: item.isBanned ? 'banned' as const : 'active' as const,
          isDeactivated: !!item.isDeactivated,
          deactivatedAt: item.deactivatedAt ? String(item.deactivatedAt) : null,
          deactivatedByAdmin: !!item.deactivatedByAdmin,
          reports: reportCountMap.get(String(item.id || '')) || 0,
        } satisfies AdminUser;
      });
      const nextHasMore = isRecord(rawUsersResult) && typeof (rawUsersResult as any).hasMore === 'boolean'
        ? Boolean((rawUsersResult as any).hasMore)
        : mapped.length >= USERS_PAGE_SIZE;
      const nextOnlineNow = isRecord(rawUsersResult) && typeof (rawUsersResult as any).onlineNow === 'number'
        ? Number((rawUsersResult as any).onlineNow)
        : usersOnlineNow;
      const nextTotal = isRecord(rawUsersResult) && typeof (rawUsersResult as any).total === 'number'
        ? Number((rawUsersResult as any).total)
        : usersTotal;

      setUsers((prev) => {
        const seen = new Set(prev.map((u) => u.id));
        const merged = [...prev];
        for (const item of mapped) {
          if (!item.id || seen.has(item.id)) continue;
          seen.add(item.id);
          merged.push(item);
        }
        return merged;
      });
      setUsersPage(nextPage);
      setHasMoreUsers(nextHasMore);
      setUsersOnlineNow(nextOnlineNow);
      setUsersTotal(nextTotal);
    } catch {
      toast({
        title: 'Falha ao carregar mais usuários',
        description: 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingMoreUsers(false);
    }
  };

  const filteredUsers = useMemo(
    () =>
      users.filter((u) =>
        [u.name, u.email || ''].some((value) => value.toLowerCase().includes(searchQuery.toLowerCase()))
      ),
    [users, searchQuery]
  );

  if (!user?.isAdmin) {
    return <Navigate to="/feed" replace />;
  }

  const handleToggleSubscriptions = async (enabled: boolean) => {
    setIsSavingSettings(true);
    try {
      const result = await adminService.setSubscriptionsEnabled(enabled);
      const nextEnabled = result?.subscriptionsEnabled !== false;
      setSettings({ subscriptionsEnabled: nextEnabled });
      updateUser({ subscriptionsEnabled: nextEnabled });
      toast({
        title: nextEnabled ? 'Assinaturas ativadas' : 'Assinaturas desativadas',
        description: nextEnabled
          ? 'A cobrança premium voltou a ficar disponível na rede.'
          : 'Os bloqueios de assinatura foram desativados para toda a rede.',
      });
    } catch {
      toast({
        title: 'Falha ao salvar configuração',
        description: 'Não foi possível atualizar o estado das assinaturas.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleApprovePhoto = async (photoId: string) => {
    setBusyPhotoId(photoId);
    try {
      await adminService.approvePhoto(photoId);
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      toast({ title: 'Foto aprovada' });
    } catch {
      toast({ title: 'Erro ao aprovar foto', variant: 'destructive' });
    } finally {
      setBusyPhotoId(null);
    }
  };

  const handleRejectPhoto = async (photoId: string) => {
    setBusyPhotoId(photoId);
    try {
      await adminService.rejectPhoto(photoId);
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      toast({ title: 'Foto rejeitada' });
    } catch {
      toast({ title: 'Erro ao rejeitar foto', variant: 'destructive' });
    } finally {
      setBusyPhotoId(null);
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!window.confirm('Remover esta foto da plataforma? Essa ação oculta a mídia para todos os usuários.')) return;
    setBusyPhotoId(photoId);
    try {
      await adminService.deletePhoto(photoId);
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      toast({ title: 'Foto removida da plataforma' });
    } catch {
      toast({ title: 'Erro ao remover foto', variant: 'destructive' });
    } finally {
      setBusyPhotoId(null);
    }
  };

  const handleBanUser = async (userId: string) => {
    setBusyUserId(userId);
    try {
      await adminService.banUser(userId);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, status: 'banned' } : u)));
      toast({ title: 'Usuário marcado como banido' });
    } catch {
      toast({ title: 'Erro ao banir usuário', variant: 'destructive' });
    } finally {
      setBusyUserId(null);
    }
  };

  const handleUnbanUser = async (userId: string) => {
    setBusyUserId(userId);
    try {
      await adminService.unbanUser(userId);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, status: 'active' } : u)));
      toast({ title: 'Usuário desbanido' });
    } catch {
      toast({ title: 'Erro ao desbanir usuário', variant: 'destructive' });
    } finally {
      setBusyUserId(null);
    }
  };

  const handleDeactivateUser = async (userId: string) => {
    if (!window.confirm('Desativar esta conta agora? A pessoa deixará de acessar e aparecer na plataforma até reativação.')) return;
    setBusyUserId(userId);
    try {
      await adminService.deactivateUser(userId);
      setUsers((prev) => prev.map((u) => (
        u.id === userId
          ? { ...u, isDeactivated: true, deactivatedAt: new Date().toISOString(), deactivatedByAdmin: true }
          : u
      )));
      toast({ title: 'Conta desativada pela administração' });
    } catch {
      toast({ title: 'Erro ao desativar conta', variant: 'destructive' });
    } finally {
      setBusyUserId(null);
    }
  };

  const handleReactivateUser = async (userId: string) => {
    setBusyUserId(userId);
    try {
      await adminService.reactivateUser(userId);
      setUsers((prev) => prev.map((u) => (
        u.id === userId
          ? { ...u, isDeactivated: false, deactivatedAt: null, deactivatedByAdmin: false }
          : u
      )));
      toast({ title: 'Conta reativada' });
    } catch {
      toast({ title: 'Erro ao reativar conta', variant: 'destructive' });
    } finally {
      setBusyUserId(null);
    }
  };

  const handleResolveReport = async (reportId: string) => {
    setBusyReportId(reportId);
    try {
      await adminService.resolveReport(reportId);
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      toast({ title: 'Denúncia arquivada' });
    } catch {
      toast({ title: 'Erro ao arquivar denúncia', variant: 'destructive' });
    } finally {
      setBusyReportId(null);
    }
  };

  const handleLoadResourcesStatus = async () => {
    setIsLoadingResourcesStatus(true);
    try {
      const data = await adminService.getResourcesStatus();
      if (!isRecord(data)) {
        throw new Error('invalid_payload');
      }
      setResourcesStatus({
        checkedAt: String(data.checkedAt || ''),
        nodeVersion: String(data.nodeVersion || ''),
        platform: String(data.platform || ''),
        uptimeSec: Number(data.uptimeSec || 0),
        cpu: {
          count: Number((data as any).cpu?.count || 0),
          usagePercent: Number((data as any).cpu?.usagePercent || 0),
          loadAvg1m: Number((data as any).cpu?.loadAvg1m || 0),
          loadAvg5m: Number((data as any).cpu?.loadAvg5m || 0),
          loadAvg15m: Number((data as any).cpu?.loadAvg15m || 0),
        },
        memory: {
          rssMb: Number((data as any).memory?.rssMb || 0),
          heapUsedMb: Number((data as any).memory?.heapUsedMb || 0),
          heapTotalMb: Number((data as any).memory?.heapTotalMb || 0),
          externalMb: Number((data as any).memory?.externalMb || 0),
          arrayBuffersMb: Number((data as any).memory?.arrayBuffersMb || 0),
          systemTotalMb: Number((data as any).memory?.systemTotalMb || 0),
          systemFreeMb: Number((data as any).memory?.systemFreeMb || 0),
          systemUsedMb: Number((data as any).memory?.systemUsedMb || 0),
          processUsagePercent: Number((data as any).memory?.processUsagePercent || 0),
          systemUsagePercent: Number((data as any).memory?.systemUsagePercent || 0),
        },
      });
      toast({ title: 'Status de recursos atualizado' });
    } catch {
      toast({
        title: 'Falha ao consultar recursos',
        description: 'Não foi possível buscar o uso de CPU e memória do servidor agora.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingResourcesStatus(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center">
          <Shield className="w-6 h-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Painel Admin</h1>
          <p className="text-muted-foreground">Gerencie usuários, fotos e dados do sistema</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="p-4 glass">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{usersTotal}</p>
              <p className="text-xs text-muted-foreground">Usuários</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 glass">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
              <Image className="w-5 h-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold">{photos.length}</p>
              <p className="text-xs text-muted-foreground">Fotos</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 glass">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">R$ {Number(finance.revenue || 0).toLocaleString('pt-BR')}</p>
              <p className="text-xs text-muted-foreground">Receita</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 glass">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gold/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-gold" />
            </div>
            <div>
              <p className="text-2xl font-bold">{Number(finance.subscribers || 0)}</p>
              <p className="text-xs text-muted-foreground">Assinantes</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 glass sm:col-span-2 xl:col-span-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Globe2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{Number(visitAnalytics.total || 0)}</p>
              <p className="text-xs text-muted-foreground">Visitas registradas</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mb-6 border-primary/20 bg-primary/5 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-primary">Assinaturas da rede</p>
            <h3 className="text-xl font-semibold">
              {settings.subscriptionsEnabled ? 'Cobrança premium ativa' : 'Cobrança premium desligada'}
            </h3>
            <p className="text-sm text-muted-foreground">
              Desligando esta opção, os bloqueios premium deixam de valer e a área de planos para de oferecer checkout.
            </p>
          </div>
          <div className="flex items-center gap-3 self-start rounded-2xl border bg-background px-4 py-3">
            <span className={settings.subscriptionsEnabled ? 'text-sm font-medium text-emerald-600' : 'text-sm font-medium text-muted-foreground'}>
              {settings.subscriptionsEnabled ? 'Ativadas' : 'Desativadas'}
            </span>
            <Switch
              checked={settings.subscriptionsEnabled}
              disabled={isSavingSettings}
              onCheckedChange={(checked) => void handleToggleSubscriptions(Boolean(checked))}
            />
          </div>
        </div>
      </Card>

      <Card className="mb-6 p-5 glass">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold">Recursos do servidor</p>
            <p className="text-sm text-muted-foreground">
              Veja em porcentagem quanto do servidor está sendo usado agora para decidir se já está na hora de fazer upgrade.
            </p>
          </div>
          <Button
            type="button"
            className="self-start gap-2"
            onClick={() => void handleLoadResourcesStatus()}
            disabled={isLoadingResourcesStatus}
          >
            <Eye className="w-4 h-4" />
            {isLoadingResourcesStatus ? 'Consultando...' : 'Ver uso do servidor'}
          </Button>
        </div>

        {resourcesStatus ? (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Uso de CPU</p>
                  <p className="text-3xl font-bold">{cpuUsagePercent.toLocaleString('pt-BR')}%</p>
                </div>
                <span className={`text-xs font-semibold ${cpuHealth.tone}`}>{cpuHealth.label}</span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${cpuHealth.bar}`} style={{ width: `${cpuUsagePercent}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Baseado na carga média do último minuto em {resourcesStatus.cpu.count} núcleo(s).
              </p>
            </div>

            <div className="rounded-xl border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Uso de memória</p>
                  <p className="text-3xl font-bold">{memoryUsagePercent.toLocaleString('pt-BR')}%</p>
                </div>
                <span className={`text-xs font-semibold ${memoryHealth.tone}`}>{memoryHealth.label}</span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${memoryHealth.bar}`} style={{ width: `${memoryUsagePercent}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {resourcesStatus.memory.systemUsedMb.toLocaleString('pt-BR')} MB / {resourcesStatus.memory.systemTotalMb.toLocaleString('pt-BR')} MB
              </p>
              <p className="text-xs text-muted-foreground">
                O site está usando {resourcesStatus.memory.processUsagePercent.toLocaleString('pt-BR')}% da memória total do servidor.
              </p>
            </div>

            <div className="rounded-xl border bg-background p-4">
              <p className="text-xs text-muted-foreground">Servidor ligado há</p>
              <p className="text-3xl font-bold">{formatUptimeLabel(resourcesStatus.uptimeSec)}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Última atualização: {formatDateTime(resourcesStatus.checkedAt)}
              </p>
              <p className="text-xs text-muted-foreground">
                Node {resourcesStatus.nodeVersion} · {resourcesStatus.platform}
              </p>
            </div>

            <div className="rounded-xl border bg-background p-4 md:col-span-3">
              <p className="text-xs text-muted-foreground">
                Leitura rápida: abaixo de 75% costuma estar confortável; entre 75% e 89% pede atenção; acima de 90% já é sinal forte para avaliar upgrade.
              </p>
            </div>
          </div>
        ) : null}
      </Card>

      <Tabs defaultValue="photos" className="space-y-6">
        <TabsList className="flex w-full max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="photos" className="gap-2">
            <Image className="w-4 h-4" />
            Moderação de Fotos
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Users className="w-4 h-4" />
            Usuários
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2 relative">
            <Flag className="w-4 h-4" />
            Denúncias
            {reports.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
                {reports.length > 9 ? '9+' : reports.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="finance" className="gap-2">
            <DollarSign className="w-4 h-4" />
            Finanças
          </TabsTrigger>
          <TabsTrigger value="visits" className="gap-2">
            <Globe2 className="w-4 h-4" />
            Visitas
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <FileText className="w-4 h-4" />
            Logs
          </TabsTrigger>
          <TabsTrigger value="suggestions" className="gap-2">
            <Lightbulb className="w-4 h-4" />
            Sugestões
          </TabsTrigger>
        </TabsList>

        <TabsContent value="photos">
          <div className="glass rounded-xl p-6">
            <h3 className="font-semibold mb-4">Fotos enviadas</h3>

            {isLoading ? (
              <div className="py-12 text-center text-muted-foreground">Carregando...</div>
            ) : photos.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Check className="w-12 h-12 mx-auto mb-4" />
                <p>Nenhuma foto disponível no momento.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {photos.map((photo) => (
                  <div key={photo.id} className="relative group">
                    <img src={photo.url} alt={photo.userName} className="w-full aspect-square object-cover rounded-lg" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex flex-col items-center justify-center gap-2 p-3">
                      <p className="text-white text-sm font-medium text-center">{photo.userName}</p>
                      <div className="flex flex-wrap justify-center gap-2">
                        <Button
                          size="sm"
                          className="bg-success hover:bg-success/90"
                          disabled={busyPhotoId === photo.id}
                          onClick={() => void handleApprovePhoto(photo.id)}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busyPhotoId === photo.id}
                          onClick={() => void handleRejectPhoto(photo.id)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busyPhotoId === photo.id}
                          onClick={() => void handleDeletePhoto(photo.id)}
                        >
                          Remover
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="users">
          <div className="glass rounded-xl p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar usuário..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button variant="outline" className="gap-2" disabled>
                <Filter className="w-4 h-4" />
                Filtros
              </Button>
            </div>

            <div className="space-y-3">
              {filteredUsers.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={entry.avatar || undefined} />
                      <AvatarFallback>{entry.name[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{entry.name}</p>
                        {entry.isPremium && <Badge className="bg-gold text-black text-xs">Premium</Badge>}
                        {entry.isAdmin && <Badge variant="secondary" className="text-xs">Admin</Badge>}
                        {entry.status === 'banned' && <Badge variant="destructive" className="text-xs">Banido</Badge>}
                        {entry.isDeactivated && <Badge variant="outline" className="text-xs">Conta desativada</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{entry.email || 'Sem e-mail público'}</p>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>Último acesso: {entry.isOnline ? 'Online agora' : formatDateTime(entry.lastSeenAt)}</span>
                        <span>
                          {entry.isPremium ? 'Assinatura' : 'Trial'}: <strong className="text-foreground">{formatAccessRemaining(entry)}</strong>
                        </span>
                        {entry.hubAccessStatus ? <span>Status Hub: {entry.hubAccessStatus}</span> : null}
                        {entry.isDeactivated ? <span>Desativada em: {formatDateTime(entry.deactivatedAt)}</span> : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Badge variant="outline" className="gap-1">
                      <Eye className="w-3 h-3" />
                      {entry.reports} denúncias
                    </Badge>
                    {entry.isDeactivated ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyUserId === entry.id}
                        onClick={() => void handleReactivateUser(entry.id)}
                      >
                        Reativar conta
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyUserId === entry.id || entry.isAdmin}
                        onClick={() => void handleDeactivateUser(entry.id)}
                      >
                        Desativar conta
                      </Button>
                    )}
                    {entry.status === 'banned' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyUserId === entry.id}
                        onClick={() => void handleUnbanUser(entry.id)}
                      >
                        Desbanir
                      </Button>
                    ) : (
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={busyUserId === entry.id || entry.isAdmin}
                        onClick={() => void handleBanUser(entry.id)}
                      >
                        <Ban className="w-4 h-4 mr-1" />
                        Banir
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {!isLoading && filteredUsers.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nenhum usuário encontrado.</div>
              ) : null}
              {!isLoading && hasMoreUsers && !searchQuery ? (
                <div className="pt-3">
                  <Button
                    variant="outline"
                    onClick={() => void loadMoreUsers()}
                    disabled={isLoadingMoreUsers}
                  >
                    {isLoadingMoreUsers ? 'Carregando...' : 'Carregar mais usuários'}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="reports">
          <div className="glass rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Denúncias pendentes</h3>
              <Badge variant="outline" className="gap-1">
                <Flag className="w-3 h-3" />
                {reports.length} pendente(s)
              </Badge>
            </div>

            {isLoading ? (
              <div className="py-12 text-center text-muted-foreground">Carregando...</div>
            ) : reports.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Check className="w-12 h-12 mx-auto mb-4" />
                <p>Nenhuma denúncia pendente.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {reports.map((report) => (
                  <div key={report.id} className="rounded-lg border bg-secondary/20 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="destructive" className="text-xs capitalize">
                            {report.targetType === 'user' ? 'Perfil' : report.targetType}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {report.reason === 'fake' ? 'Perfil falso' :
                             report.reason === 'spam' ? 'Spam' :
                             report.reason === 'harassment' ? 'Assédio' :
                             report.reason === 'inappropriate' ? 'Conteúdo inapropriado' :
                             report.reason === 'underage' ? 'Menor de idade' : 'Outro motivo'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{formatDateTime(report.createdAt)}</span>
                        </div>
                        <p className="font-medium">
                          Denunciado:{' '}
                          {report.targetType === 'user' && report.targetId ? (
                            <Link
                              to={`/profile/${report.targetId}`}
                              className="text-primary hover:underline inline-flex items-center gap-1"
                            >
                              {report.targetName || report.targetId}
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          ) : (
                            <span>{report.targetName || report.targetId}</span>
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Por: {report.reporterName}
                          {report.reporterEmail ? ` (${report.reporterEmail})` : ''}
                        </p>
                        {report.details && (
                          <p className="text-sm text-muted-foreground italic">"{report.details}"</p>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {report.targetType === 'user' && (
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={busyUserId === report.targetId}
                            onClick={() => void handleBanUser(report.targetId)}
                          >
                            <Ban className="w-4 h-4 mr-1" />
                            Banir
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyReportId === report.id}
                          onClick={() => void handleResolveReport(report.id)}
                        >
                          <Check className="w-4 h-4 mr-1" />
                          Arquivar
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="finance">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="p-6 glass">
              <h3 className="font-semibold mb-4">Resumo Financeiro</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Receita Total</span>
                  <span className="text-2xl font-bold text-success">
                    R$ {Number(finance.revenue || 0).toLocaleString('pt-BR')}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Assinantes Ativos</span>
                  <span className="font-semibold">{Number(finance.subscribers || 0)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Novos Hoje</span>
                  <span className="font-semibold text-primary">+{Number(finance.newToday || 0)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Taxa de Churn</span>
                  <span className="font-semibold">{Number(finance.churnRate || 0)}%</span>
                </div>
              </div>
            </Card>

            <Card className="p-6 glass">
              <h3 className="font-semibold mb-4">Leitura atual da API</h3>
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                  <span>Usuários carregados</span>
                  <span className="font-semibold text-foreground">{users.length} / {usersTotal}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                  <span>Online simultâneos</span>
                  <span className="font-semibold text-foreground">{usersOnlineNow}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                  <span>Fotos retornadas</span>
                  <span className="font-semibold text-foreground">{photos.length}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                  <span>Logs retornados</span>
                  <span className="font-semibold text-foreground">{logs.length}</span>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="logs">
          <div className="glass rounded-xl p-6">
            <h3 className="font-semibold mb-4">Logs do Sistema</h3>
            {logs.length === 0 ? (
              <div className="text-sm text-muted-foreground">A API atual não retornou logs.</div>
            ) : (
              <div className="space-y-2">
                {logs.map((log, index) => (
                  <div key={log.id || `${log.action || 'log'}-${index}`} className="flex items-center gap-4 p-3 rounded-lg bg-secondary/30 text-sm">
                    <span className="text-muted-foreground w-36">{log.date || '—'}</span>
                    <Badge variant="outline" className="font-mono">{log.action || 'log'}</Badge>
                    <span>{log.user || 'sistema'}</span>
                    {log.details ? <span className="text-muted-foreground">{log.details}</span> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="visits">
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Card className="p-5 glass">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Globe2 className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{visitAnalytics.total}</p>
                    <p className="text-xs text-muted-foreground">Total de visitas</p>
                  </div>
                </div>
              </Card>
              <Card className="p-5 glass">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
                    <MousePointerClick className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{visitAnalytics.today}</p>
                    <p className="text-xs text-muted-foreground">Últimas 24 horas</p>
                  </div>
                </div>
              </Card>
              <Card className="p-5 glass">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{visitAnalytics.last7Days}</p>
                    <p className="text-xs text-muted-foreground">Últimos 7 dias</p>
                  </div>
                </div>
              </Card>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Card className="p-5 glass">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                    <Users className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{visitAnalytics.onlineNow}</p>
                    <p className="text-xs text-muted-foreground">Online simultâneos (agora)</p>
                  </div>
                </div>
              </Card>
              <Card className="p-5 glass">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center">
                    <Globe2 className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{visitAnalytics.uniqueToday}</p>
                    <p className="text-xs text-muted-foreground">Visitantes únicos (24h)</p>
                  </div>
                </div>
              </Card>
              <Card className="p-5 glass">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{visitAnalytics.byDay.length}</p>
                    <p className="text-xs text-muted-foreground">Dias com dados (30d)</p>
                  </div>
                </div>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-4 xl:gap-6">
              <Card className="p-4 glass sm:p-6">
                <h3 className="mb-4 font-semibold">Origem das visitas</h3>
                <div className="space-y-3">
                  {visitAnalytics.byOrigin.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Ainda sem visitas registradas.</p>
                  ) : (
                    visitAnalytics.byOrigin.map((entry) => (
                      <div key={entry.label} className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-secondary/30 p-3 text-sm">
                        <span className="min-w-0 truncate capitalize">{entry.label}</span>
                        <Badge variant="outline" className="shrink-0">{entry.count}</Badge>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              <Card className="p-4 glass sm:p-6">
                <h3 className="mb-4 font-semibold">Local das visitas</h3>
                <div className="space-y-3">
                  {visitAnalytics.byCountry.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Ainda sem local identificado.</p>
                  ) : (
                    visitAnalytics.byCountry.map((entry) => (
                      <div key={entry.label} className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-secondary/30 p-3 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <MapPin className="h-4 w-4 shrink-0 text-primary" />
                          <span className="truncate">{entry.label}</span>
                        </span>
                        <Badge variant="outline" className="shrink-0">{entry.count}</Badge>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              <Card className="p-4 glass sm:p-6">
                <h3 className="mb-4 font-semibold">Páginas mais vistas</h3>
                <div className="space-y-3">
                  {visitAnalytics.byPage.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Ainda sem páginas registradas.</p>
                  ) : (
                    visitAnalytics.byPage.map((entry) => (
                      <div key={entry.label} className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-secondary/30 p-3 text-sm">
                        <span className="min-w-0 truncate">{entry.label}</span>
                        <Badge variant="outline" className="shrink-0">{entry.count}</Badge>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              <Card className="p-4 glass sm:p-6">
                <h3 className="mb-4 font-semibold">Acessos por dispositivo</h3>
                <div className="space-y-3">
                  {visitAnalytics.byDevice.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Ainda sem dados de dispositivo.</p>
                  ) : (
                    visitAnalytics.byDevice.map((entry) => {
                      const deviceMeta = getDeviceMeta(entry.label);
                      const DeviceIcon = deviceMeta.icon;
                      return (
                        <div key={entry.label} className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-secondary/30 p-3 text-sm">
                          <span className="flex min-w-0 items-center gap-2">
                            <DeviceIcon className="h-4 w-4 shrink-0 text-primary" />
                            <span className="truncate">{deviceMeta.label}</span>
                          </span>
                          <div className="flex shrink-0 items-center gap-2">
                            <Badge variant="outline">{entry.count}</Badge>
                            <Badge variant="secondary">{Number(entry.percentage || 0).toFixed(2)}%</Badge>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-3 xl:gap-6">
              <Card className="p-4 glass sm:p-6">
                <h3 className="mb-4 font-semibold">Acessos por dia (últimos 30)</h3>
                <div className="space-y-2">
                  {visitAnalytics.byDay.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem dados por dia ainda.</p>
                  ) : (
                    visitAnalytics.byDay.map((entry) => (
                      <div key={entry.label} className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-secondary/30 p-3 text-sm">
                        <span className="min-w-0 truncate">{entry.label}</span>
                        <Badge variant="outline" className="shrink-0">{entry.count}</Badge>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              <Card className="p-4 glass sm:p-6">
                <h3 className="mb-4 font-semibold">Acessos por região</h3>
                <div className="space-y-2">
                  {visitAnalytics.byRegion.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem dados por região ainda.</p>
                  ) : (
                    visitAnalytics.byRegion.map((entry) => (
                      <div key={entry.label} className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-secondary/30 p-3 text-sm">
                        <span className="min-w-0 truncate">{entry.label}</span>
                        <Badge variant="outline" className="shrink-0">{entry.count}</Badge>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              <Card className="p-4 glass sm:p-6">
                <h3 className="mb-4 font-semibold">Acessos por cidade (ranking)</h3>
                <div className="space-y-2">
                  {visitAnalytics.byAccessCity.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem dados por cidade ainda.</p>
                  ) : (
                    visitAnalytics.byAccessCity.map((entry, index) => (
                      <div key={`${entry.label}-${index}`} className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-secondary/30 p-3 text-sm">
                        <span className="min-w-0 truncate">
                          <span className="mr-2 shrink-0 text-xs text-muted-foreground">#{index + 1}</span>
                          {entry.label}
                        </span>
                        <Badge variant="outline" className="shrink-0">{entry.count}</Badge>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-2 xl:gap-6">
              <Card className="p-4 glass sm:p-6">
                <h3 className="mb-4 font-semibold">Usuários que mais acessam (frequência)</h3>
                <div className="space-y-2">
                  {visitAnalytics.topUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem usuários autenticados suficientes para gerar ranking.</p>
                  ) : (
                    visitAnalytics.topUsers.map((entry) => (
                      <div key={entry.userId} className="rounded-lg bg-secondary/30 p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-medium text-foreground">{entry.name}</p>
                            <p className="text-xs text-muted-foreground">{entry.email || 'Sem e-mail público'}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{entry.accesses} acessos</Badge>
                            <Badge variant="outline">{entry.activeDays} dia(s)</Badge>
                            <Badge variant="secondary">{entry.frequency} / dia</Badge>
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">Último acesso: {formatDateTime(entry.lastAccessAt)}</p>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              <Card className="p-4 glass sm:p-6">
                <h3 className="mb-4 font-semibold">Usuários cadastrados por cidade (ranking)</h3>
                <div className="mb-3 flex flex-wrap gap-2">
                  {[
                    { value: 'all' as const, label: 'Todos' },
                    { value: '30' as const, label: '30 dias' },
                    { value: '90' as const, label: '90 dias' },
                    { value: '365' as const, label: '365 dias' },
                  ].map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      size="sm"
                      variant={cityUsersPeriod === option.value ? 'default' : 'outline'}
                      className="h-8 px-3 text-xs"
                      onClick={() => setCityUsersPeriod(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  Base considerada: {visitAnalytics.cityUsersTotal.toLocaleString('pt-BR')} usuário(s).
                </p>
                <div className="space-y-2">
                  {visitAnalytics.byUserCity.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem dados de cidade para exibir.</p>
                  ) : (
                    visitAnalytics.byUserCity.map((entry, index) => (
                      <div key={`${entry.label}-${index}`} className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-secondary/30 p-3 text-sm">
                        <span className="min-w-0 truncate">
                          <span className="mr-2 text-xs text-muted-foreground">#{index + 1}</span>
                          {entry.label}
                        </span>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge variant="outline">{entry.count}</Badge>
                          <Badge variant="secondary">{Number(entry.percentage || 0).toFixed(2)}%</Badge>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>

            <div className="glass rounded-xl p-6">
              <div className="mb-4">
                <h3 className="font-semibold">Histórico detalhado</h3>
                <p className="text-sm text-muted-foreground">
                  Registro cronológico com origem, local e rota acessada.
                </p>
              </div>

              {visitAnalytics.history.length === 0 ? (
                <div className="py-10 text-sm text-muted-foreground">Nenhuma visita registrada até agora.</div>
              ) : (
                <div className="space-y-3">
                  {visitAnalytics.history.map((item) => (
                    <div key={item.id} className="rounded-xl border bg-secondary/20 p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="capitalize">{item.originType}</Badge>
                            <Badge variant="secondary">{item.deviceType}</Badge>
                            <span className="text-sm text-muted-foreground">{formatDateTime(item.createdAt)}</span>
                          </div>
                          <div>
                            <p className="font-medium">{item.pageTitle || item.pagePath}</p>
                            <p className="text-sm text-muted-foreground">{item.pagePath}</p>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            <span>Referrer: {item.referrerDomain || item.referrer || 'Direto'}</span>
                            <span>UTM: {item.utmSource || '—'}</span>
                            <span>Local: {item.region || item.country || 'Desconhecido'}</span>
                            <span>Fuso: {item.timezone || '—'}</span>
                            <span>Idioma: {item.language || '—'}</span>
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground lg:text-right">
                          <p className="font-medium text-foreground">{item.userName || 'Visitante anônimo'}</p>
                          <p>{item.userEmail || 'Sem login identificado'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="suggestions">
          <AdminSuggestionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const SUGGESTION_STATUS_OPTIONS = [
  { value: 'all',      label: 'Todas' },
  { value: 'new',      label: 'Novas' },
  { value: 'read',     label: 'Lidas' },
  { value: 'planned',  label: 'Planejadas' },
  { value: 'done',     label: 'Concluídas' },
  { value: 'rejected', label: 'Não aplicável' },
];

const SUGGESTION_STATUS_STYLES: Record<string, string> = {
  new:      'bg-blue-500/10 text-blue-600',
  read:     'bg-muted text-muted-foreground',
  planned:  'bg-purple-500/10 text-purple-600',
  done:     'bg-green-500/10 text-green-600',
  rejected: 'bg-red-500/10 text-red-500',
};

const SUGGESTION_CATEGORIES: Record<string, string> = {
  feature:     'Nova funcionalidade',
  improvement: 'Melhoria',
  bug:         'Bug / Problema',
  general:     'Geral',
};

function AdminSuggestionsTab() {
  const { toast } = useToast();
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [replyStatus, setReplyStatus] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState<Record<string, boolean>>({});

  const load = async (status: string) => {
    setIsLoading(true);
    try {
      const data = await adminService.getSuggestions(status);
      setSuggestions(Array.isArray(data) ? data : []);
    } catch {
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void load(filterStatus); }, [filterStatus]);

  const handleSaveReply = async (id: string) => {
    const reply = (replyDraft[id] || '').trim();
    const status = replyStatus[id];
    setIsSaving((p) => ({ ...p, [id]: true }));
    try {
      await adminService.replySuggestion(id, reply, status || undefined);
      toast({ title: 'Resposta salva' });
      await load(filterStatus);
      setExpandedId(null);
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    } finally {
      setIsSaving((p) => ({ ...p, [id]: false }));
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex flex-wrap gap-2">
        {SUGGESTION_STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setFilterStatus(opt.value)}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              filterStatus === opt.value
                ? 'border-primary bg-primary/10 text-primary font-medium'
                : 'border-border text-muted-foreground hover:border-primary/50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {!isLoading && suggestions.length === 0 && (
        <div className="glass rounded-xl p-8 text-center text-sm text-muted-foreground">
          Nenhuma sugestão encontrada.
        </div>
      )}

      {!isLoading && suggestions.map((s) => {
        const isExpanded = expandedId === s.id;
        const statusStyle = SUGGESTION_STATUS_STYLES[s.status] ?? SUGGESTION_STATUS_STYLES.new;
        const catLabel = SUGGESTION_CATEGORIES[s.category] ?? s.category;
        return (
          <Card key={s.id} className="p-4 space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Avatar className="w-8 h-8 shrink-0">
                  <AvatarImage src={s.user.avatar ? resolveServerUrl(s.user.avatar) : undefined} />
                  <AvatarFallback>{String(s.user.name || 'U')[0]}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{s.user.name}</p>
                  <p className="text-xs text-muted-foreground">{catLabel} · {new Date(s.createdAt).toLocaleDateString('pt-BR')}</p>
                </div>
              </div>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium shrink-0 ${statusStyle}`}>
                {s.status === 'new' && <Clock className="w-3.5 h-3.5" />}
                {s.status === 'done' && <CheckCircle2 className="w-3.5 h-3.5" />}
                {s.status === 'rejected' && <XCircle className="w-3.5 h-3.5" />}
                {SUGGESTION_STATUS_OPTIONS.find((o) => o.value === s.status)?.label ?? s.status}
              </span>
            </div>

            {/* Content */}
            <p className="text-sm whitespace-pre-wrap">{s.content}</p>

            {/* Admin reply preview */}
            {s.adminReply && !isExpanded && (
              <div className="rounded-lg bg-primary/5 border border-primary/15 px-3 py-2">
                <p className="text-xs font-semibold text-primary mb-1">Sua resposta</p>
                <p className="text-sm text-muted-foreground line-clamp-2">{s.adminReply}</p>
              </div>
            )}

            {/* Toggle reply panel */}
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
              onClick={() => {
                setExpandedId(isExpanded ? null : s.id);
                if (!replyDraft[s.id]) setReplyDraft((p) => ({ ...p, [s.id]: s.adminReply ?? '' }));
                if (!replyStatus[s.id]) setReplyStatus((p) => ({ ...p, [s.id]: s.status }));
              }}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {isExpanded ? 'Fechar' : 'Responder / alterar status'}
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {isExpanded && (
              <div className="space-y-3 border-t pt-3">
                <div className="flex flex-wrap gap-2">
                  {SUGGESTION_STATUS_OPTIONS.filter((o) => o.value !== 'all').map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setReplyStatus((p) => ({ ...p, [s.id]: opt.value }))}
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        (replyStatus[s.id] ?? s.status) === opt.value
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : 'border-border text-muted-foreground'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <textarea
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                  rows={3}
                  placeholder="Escreva uma resposta para o usuário (opcional)..."
                  value={replyDraft[s.id] ?? ''}
                  onChange={(e) => setReplyDraft((p) => ({ ...p, [s.id]: e.target.value }))}
                />
                <div className="flex justify-end">
                  <Button size="sm" className="bg-gradient-primary hover:opacity-90" disabled={isSaving[s.id]} onClick={() => void handleSaveReply(s.id)}>
                    {isSaving[s.id] ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Users, Image, DollarSign, FileText, Shield, Ban, Check, X,
  Eye, Search, Filter, TrendingUp, Flag, ExternalLink, Globe2, MapPin, MousePointerClick,
  Lightbulb, CheckCircle2, Clock, XCircle, MessageSquare, ChevronDown, ChevronUp, Monitor, Smartphone, Tablet,
  Gift, Award, Trophy, UserCheck, Mail, Send, RefreshCw, CheckSquare, Square, AlertCircle,
  BadgeDollarSign, MessageCircle, Wallet, ArrowLeft, Calendar, Loader2, AlertTriangle, Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { Link, Navigate } from 'react-router-dom';
import { adminService, adminPromoterService, type SupportMessage, type SubscriptionAnalytics, type MissingStateUser, type PixAbandoner, type ConversionFunnel } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { resolveServerUrl } from '@/utils/serverUrl';
import { cn } from '@/lib/utils';
import AdminMetrics from '@/components/AdminMetrics';

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
  gender?: string | null;
  city?: string | null;
  state?: string | null;
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
  fromPromoter?: boolean;
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
  disk: {
    totalGb: number;
    freeGb: number;
    usedGb: number;
    usagePercent: number;
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

type GrowingCity = { label: string; novos: number; total: number; growth: number };

type VisitAnalytics = {
  total: number;
  today: number;
  last7Days: number;
  uniqueToday: number;
  uniqueLastHour: number;
  onlineNow: number;
  byDay: VisitBreakdown[];
  byWeekday: Array<{ weekday: number; label: string; count: number }>;
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
  byHour: Array<{ hour: number; count: number }>;
  uniqueUsersByDay: VisitBreakdown[];
  newUsersByDay: VisitBreakdown[];
  growingCities: GrowingCity[];
  growthPeriodDays: number;
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
  uniqueLastHour: 0,
  onlineNow: 0,
  byDay: [],
  byWeekday: [],
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
  byHour: [],
  uniqueUsersByDay: [],
  newUsersByDay: [],
  growingCities: [],
  growthPeriodDays: 30,
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
  const [pixAbandon, setPixAbandon] = useState<Awaited<ReturnType<typeof adminService.getPixAbandonment>> | null>(null);
  const [pixAbandoners, setPixAbandoners] = useState<PixAbandoner[] | null>(null);
  const [pixAbandonersLoading, setPixAbandonersLoading] = useState(false);
  const [funnel, setFunnel] = useState<ConversionFunnel | null>(null);
  const [funnelLoading, setFunnelLoading] = useState(true);
  const [funnelPeriod, setFunnelPeriod] = useState<'all' | '7' | '30' | '90'>('all');
  const [showcaseProfiles, setShowcaseProfiles] = useState<Awaited<ReturnType<typeof adminService.getShowcaseProfiles>>['profiles']>([]);
  const [showOnlyShowcase, setShowOnlyShowcase] = useState(false);
  const [nameRequests, setNameRequests] = useState<Awaited<ReturnType<typeof adminService.getNameChangeRequests>>['requests']>([]);
  const loadNameRequests = async () => {
    try { const d = await adminService.getNameChangeRequests(); setNameRequests(d.requests); } catch { /* ignora */ }
  };
  const handleApproveNameChange = async (id: string) => {
    try { await adminService.approveNameChange(id); await loadNameRequests(); toast({ title: 'Nome aprovado e alterado' }); }
    catch { toast({ title: 'Erro ao aprovar (nome pode estar em uso)', variant: 'destructive' }); }
  };
  const handleRejectNameChange = async (id: string) => {
    try { await adminService.rejectNameChange(id); await loadNameRequests(); toast({ title: 'Solicitação rejeitada' }); }
    catch { toast({ title: 'Erro ao rejeitar', variant: 'destructive' }); }
  };
  const loadShowcase = async () => {
    try { const d = await adminService.getShowcaseProfiles(); setShowcaseProfiles(d.profiles); } catch { /* ignora */ }
  };
  const [revenueReport, setRevenueReport] = useState<Awaited<ReturnType<typeof adminService.getRevenueReport>> | null>(null);
  const [missingState, setMissingState] = useState<MissingStateUser[]>([]);
  const [missingStateMeta, setMissingStateMeta] = useState({ total: 0, withSuggestion: 0, ambiguous: 0 });
  const [missingStateLoading, setMissingStateLoading] = useState(false);
  const [statesBusy, setStatesBusy] = useState(false);
  const statesFileRef = useRef<HTMLInputElement>(null);
  const [subAnalytics, setSubAnalytics] = useState<SubscriptionAnalytics | null>(null);
  const [subAnalyticsLoading, setSubAnalyticsLoading] = useState(true);
  const [subAnalyticsError, setSubAnalyticsError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // Filtros da lista de usuários — todos aplicados no servidor (combinados com AND),
  // para valer sobre a base inteira, não só sobre o que já foi carregado.
  const [filterCity, setFilterCity] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterCreatedFrom, setFilterCreatedFrom] = useState('');
  const [filterCreatedTo, setFilterCreatedTo] = useState('');
  const usersFilterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usersFilterMountedRef = useRef(false);
  const usersSentinelRef = useRef<HTMLDivElement | null>(null);
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
  const [menConv, setMenConv] = useState<Awaited<ReturnType<typeof adminService.getMenConversion>> | null>(null);
  const [menConvPeriod, setMenConvPeriod] = useState<1 | 7 | 30>(7);
  const [cityUsersPeriod, setCityUsersPeriod] = useState<'all' | '30' | '90' | '365'>('all');
  const [accessPeriod, setAccessPeriod] = useState<'all' | '7' | '30' | '90'>('all');
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
  const diskUsagePercent = resourcesStatus ? clampPercent(resourcesStatus.disk.usagePercent) : 0;
  const cpuHealth = getUsageHealth(cpuUsagePercent);
  const memoryHealth = getUsageHealth(memoryUsagePercent);
  const diskHealth = getUsageHealth(diskUsagePercent);

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
          gender: item.gender ? String(item.gender) : null,
          city: item.city ? String(item.city) : null,
          state: item.state ? String(item.state) : null,
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
        const [rawPhotos, rawUsersResult, rawLogs, rawFinance, rawSettings, rawReportsResult, rawRevenue, rawPixAbandon] = await Promise.all([
          adminService.getPendingPhotos().catch(() => []),
          adminService.getUsers({ page: 1, limit: USERS_PAGE_SIZE }).catch(() => []),
          adminService.getLogs().catch(() => []),
          adminService.getFinanceSummary().catch(() => null),
          adminService.getSettings().catch(() => null),
          adminService.getReports('pending').catch(() => []),
          adminService.getRevenueReport().catch(() => null),
          adminService.getPixAbandonment().catch(() => null),
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
        setRevenueReport(rawRevenue ?? null);
        setPixAbandon(rawPixAbandon ?? null);
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

  // ── Quem gerou PIX e não pagou (lista para recuperação) ─────────────────────
  const loadPixAbandoners = async () => {
    setPixAbandonersLoading(true);
    try {
      const data = await adminService.getPixAbandoners();
      setPixAbandoners(data.users ?? []);
    } catch {
      toast({ title: 'Erro ao carregar a lista', variant: 'destructive' });
    } finally {
      setPixAbandonersLoading(false);
    }
  };

  const handleExportAbandonersCsv = () => {
    if (!pixAbandoners || pixAbandoners.length === 0) return;
    const cell = (v: string) => { const s = String(v ?? ''); return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const header = ['nome', 'email', 'cidade', 'uf', 'tentativas', 'ultima_geracao'];
    const lines = pixAbandoners.map((u) => [
      u.name, u.email, u.city, u.state, String(u.attempts),
      u.lastGeneratedAt ? new Date(u.lastGeneratedAt).toLocaleString('pt-BR') : '',
    ].map(cell).join(';'));
    const csv = '﻿' + [header.join(';'), ...lines].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gerou-pix-nao-pagou-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Cidades sem UF: carga, preenchimento automático, export/import CSV ──────
  const loadMissingStates = async () => {
    setMissingStateLoading(true);
    try {
      const data = await adminService.getUsersMissingState();
      setMissingState(data.users ?? []);
      setMissingStateMeta({
        total: Number(data.total || 0),
        withSuggestion: Number(data.withSuggestion || 0),
        ambiguous: Number(data.ambiguous || 0),
      });
    } catch {
      toast({ title: 'Erro ao carregar cidades sem UF', variant: 'destructive' });
    } finally {
      setMissingStateLoading(false);
    }
  };

  const handleAutofillStates = async () => {
    setStatesBusy(true);
    try {
      const r = await adminService.autofillUserStates();
      toast({ title: `${r.updated} usuário(s) corrigido(s)`, description: `${r.remaining} ainda precisam de correção manual.` });
      await loadMissingStates();
    } catch {
      toast({ title: 'Erro ao preencher automaticamente', variant: 'destructive' });
    } finally {
      setStatesBusy(false);
    }
  };

  const csvCell = (v: string) => {
    const s = String(v ?? '');
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const handleExportStatesCsv = () => {
    const header = ['id', 'nome', 'email', 'cidade', 'uf_sugerida', 'uf'];
    const lines = missingState.map((u) =>
      [u.id, u.name, u.email, u.city, u.suggestedState ?? '', u.suggestedState ?? ''].map(csvCell).join(';')
    );
    // BOM + ';' para o Excel pt-BR abrir com acentuação e colunas corretas.
    const csv = '﻿' + [header.join(';'), ...lines].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cidades-sem-uf-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportStatesCsv = async (file: File) => {
    setStatesBusy(true);
    try {
      const text = (await file.text()).replace(/^﻿/, '');
      const rows = text.split(/\r?\n/).filter((l) => l.trim());
      if (rows.length < 2) throw new Error('Planilha vazia');
      const delim = (rows[0].match(/;/g)?.length ?? 0) >= (rows[0].match(/,/g)?.length ?? 0) ? ';' : ',';
      const splitRow = (line: string) => {
        const out: string[] = [];
        let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
          const c = line[i];
          if (c === '"') {
            if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ;
          } else if (c === delim && !inQ) { out.push(cur); cur = ''; } else cur += c;
        }
        out.push(cur);
        return out.map((s) => s.trim());
      };
      const header = splitRow(rows[0]).map((h) => h.toLowerCase());
      const idIdx = header.indexOf('id');
      const ufIdx = header.lastIndexOf('uf');
      if (idIdx < 0 || ufIdx < 0) throw new Error('A planilha precisa ter as colunas "id" e "uf"');

      const updates: Array<{ userId: string; state: string }> = [];
      for (let i = 1; i < rows.length; i++) {
        const cols = splitRow(rows[i]);
        const userId = cols[idIdx];
        const uf = String(cols[ufIdx] || '').toUpperCase();
        if (userId && /^[A-Z]{2}$/.test(uf)) updates.push({ userId, state: uf });
      }
      if (updates.length === 0) throw new Error('Nenhuma linha com UF válida (2 letras) encontrada');

      const r = await adminService.applyUserStates(updates);
      toast({ title: `${r.updated} usuário(s) atualizado(s)`, description: r.skipped ? `${r.skipped} linha(s) ignorada(s).` : undefined });
      await loadMissingStates();
    } catch (e) {
      toast({ title: 'Erro ao importar', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setStatesBusy(false);
    }
  };

  // Perfis de vitrine + solicitações de nome — carrega uma vez.
  useEffect(() => { void loadShowcase(); void loadNameRequests(); }, []);

  // Funil de conversão (cadastro → uso → paywall → PIX → assinatura).
  useEffect(() => {
    let cancelled = false;
    setFunnelLoading(true);
    const days = funnelPeriod === 'all' ? undefined : Number(funnelPeriod);
    adminService.getConversionFunnel(days)
      .then((data) => { if (!cancelled) setFunnel(data); })
      .catch(() => { if (!cancelled) setFunnel(null); })
      .finally(() => { if (!cancelled) setFunnelLoading(false); });
    return () => { cancelled = true; };
  }, [funnelPeriod]);

  // Analytics de assinaturas (dados reais do Hub) — carrega em separado para não
  // travar o load principal do admin (a chamada ao Hub pode levar alguns segundos).
  useEffect(() => {
    let cancelled = false;
    setSubAnalyticsLoading(true);
    setSubAnalyticsError(false);
    adminService.getSubscriptionAnalytics()
      .then((data) => { if (!cancelled) setSubAnalytics(data); })
      .catch(() => { if (!cancelled) { setSubAnalytics(null); setSubAnalyticsError(true); } })
      .finally(() => { if (!cancelled) setSubAnalyticsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const periodDays = cityUsersPeriod === 'all' ? undefined : Number(cityUsersPeriod);
    const accessDays = accessPeriod === 'all' ? undefined : Number(accessPeriod);
    adminService.getVisitAnalytics(120, periodDays, accessDays)
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
  }, [cityUsersPeriod, accessPeriod]);

  useEffect(() => {
    let cancelled = false;
    adminService.getMenConversion(menConvPeriod)
      .then((d) => { if (!cancelled) setMenConv(d); })
      .catch(() => { if (!cancelled) setMenConv(null); });
    return () => { cancelled = true; };
  }, [menConvPeriod]);

  // Busca uma página de usuários já aplicando os filtros ativos (busca, cidade,
  // estado, data de cadastro — todos combinados no servidor). `mode: 'replace'`
  // é usado ao trocar filtros (volta pra página 1); `'append'` é a rolagem infinita.
  const fetchUsersPage = async (page: number, mode: 'append' | 'replace') => {
    const reportCountMap = new Map<string, number>();
    for (const report of reports) {
      if (report.targetType !== 'user' || !report.targetId) continue;
      reportCountMap.set(report.targetId, (reportCountMap.get(report.targetId) || 0) + 1);
    }
    const rawUsersResult = await adminService.getUsers({
      page,
      limit: USERS_PAGE_SIZE,
      search: searchQuery || undefined,
      city: filterCity || undefined,
      state: filterState || undefined,
      createdFrom: filterCreatedFrom || undefined,
      createdTo: filterCreatedTo || undefined,
    });
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
        gender: item.gender ? String(item.gender) : null,
        city: item.city ? String(item.city) : null,
        state: item.state ? String(item.state) : null,
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

    if (mode === 'replace') {
      setUsers(mapped);
    } else {
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
    }
    setUsersPage(page);
    setHasMoreUsers(nextHasMore);
    setUsersOnlineNow(nextOnlineNow);
    setUsersTotal(nextTotal);
  };

  const loadMoreUsers = async () => {
    if (isLoadingMoreUsers || !hasMoreUsers) return;
    setIsLoadingMoreUsers(true);
    try {
      await fetchUsersPage(usersPage + 1, 'append');
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

  // Dispara ao mudar qualquer filtro (busca, cidade, estado, data): sempre volta
  // para a página 1, filtrando na base inteira (não só no que já foi carregado).
  useEffect(() => {
    if (!usersFilterMountedRef.current) {
      usersFilterMountedRef.current = true;
      return; // 1ª renderização: o load() inicial já buscou a página 1
    }
    if (usersFilterDebounceRef.current) clearTimeout(usersFilterDebounceRef.current);
    usersFilterDebounceRef.current = setTimeout(() => {
      setIsLoadingMoreUsers(true);
      fetchUsersPage(1, 'replace')
        .catch(() => {
          toast({ title: 'Falha ao filtrar usuários', description: 'Tente novamente em instantes.', variant: 'destructive' });
        })
        .finally(() => setIsLoadingMoreUsers(false));
    }, 400);
    return () => { if (usersFilterDebounceRef.current) clearTimeout(usersFilterDebounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, filterCity, filterState, filterCreatedFrom, filterCreatedTo]);

  // Rolagem infinita: observa o sentinel no fim da lista e carrega a próxima
  // página quando ele entra na viewport.
  useEffect(() => {
    if (!hasMoreUsers) return;
    const sentinel = usersSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) void loadMoreUsers(); },
      { root: null, rootMargin: '400px', threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMoreUsers, isLoadingMoreUsers]);

  const showcaseIds = useMemo(() => new Set(showcaseProfiles.map((p) => p.id)), [showcaseProfiles]);
  // Busca, cidade, estado e data de cadastro já vêm filtrados do servidor
  // (fetchUsersPage). "Só vitrine" continua client-side — depende só da lista
  // de vitrine já carregada, não precisa ir ao servidor.
  const filteredUsers = useMemo(
    () => users.filter((u) => !showOnlyShowcase || showcaseIds.has(u.id)),
    [users, showOnlyShowcase, showcaseIds]
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
    if (!window.confirm('Remover esta foto permanentemente de toda a plataforma? A imagem sai do feed, stories e perfil, e o arquivo é apagado. Esta ação não pode ser desfeita.')) return;
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

  const handleMarkShowcase = async (userId: string) => {
    setBusyUserId(userId);
    try {
      await adminService.setShowcase(userId, true);
      await loadShowcase();
      toast({ title: 'Perfil marcado como vitrine', description: 'Ele some do Match/Radar/Busca e entra no revezamento do feed/stories.' });
    } catch {
      toast({ title: 'Erro ao marcar vitrine', variant: 'destructive' });
    } finally {
      setBusyUserId(null);
    }
  };

  const [runningRotation, setRunningRotation] = useState(false);
  const handleRunRotation = async () => {
    setRunningRotation(true);
    try {
      const r = await adminService.runShowcaseRotation();
      await loadShowcase();
      toast({
        title: 'Revezamento executado ✅',
        description: `${r.profiles} perfil(is) · +${r.storiesCreated} stories · ${r.postsBumped} post(s) resurgido(s).`,
      });
    } catch {
      toast({ title: 'Erro ao rodar o revezamento', variant: 'destructive' });
    } finally {
      setRunningRotation(false);
    }
  };

  const handleRemoveShowcase = async (userId: string) => {
    setBusyUserId(userId);
    try {
      await adminService.setShowcase(userId, false);
      await loadShowcase();
      toast({ title: 'Perfil removido da vitrine' });
    } catch {
      toast({ title: 'Erro ao remover da vitrine', variant: 'destructive' });
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

  const handleResolveReport = async (reportId: string, action: 'ban' | 'warn' | 'remove_content' | 'dismiss' = 'dismiss') => {
    setBusyReportId(reportId);
    try {
      await adminService.resolveReport(reportId, action);
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      const msg =
        action === 'ban' ? 'Usuário banido e denúncia resolvida'
        : action === 'warn' ? 'Advertência enviada e denúncia resolvida'
        : action === 'remove_content' ? 'Conteúdo removido e denúncia resolvida'
        : 'Denúncia descartada';
      toast({ title: msg });
    } catch {
      toast({ title: 'Erro ao resolver denúncia', variant: 'destructive' });
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
        disk: {
          totalGb: Number((data as any).disk?.totalGb || 0),
          freeGb: Number((data as any).disk?.freeGb || 0),
          usedGb: Number((data as any).disk?.usedGb || 0),
          usagePercent: Number((data as any).disk?.usagePercent || 0),
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
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Uso de armazenamento</p>
                  <p className="text-3xl font-bold">{diskUsagePercent.toLocaleString('pt-BR')}%</p>
                </div>
                <span className={`text-xs font-semibold ${diskHealth.tone}`}>{diskHealth.label}</span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${diskHealth.bar}`} style={{ width: `${diskUsagePercent}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {resourcesStatus.disk.usedGb.toLocaleString('pt-BR')} GB / {resourcesStatus.disk.totalGb.toLocaleString('pt-BR')} GB
              </p>
              <p className="text-xs text-muted-foreground">
                Espaço livre: {resourcesStatus.disk.freeGb.toLocaleString('pt-BR')} GB
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

      <Tabs defaultValue="metrics" className="space-y-6">
        <TabsList className="flex w-full max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="metrics" className="gap-2">
            <TrendingUp className="w-4 h-4" />
            Métricas
          </TabsTrigger>
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
          <TabsTrigger value="states" className="gap-2">
            <MapPin className="w-4 h-4" />
            Cidades sem UF
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
          <TabsTrigger value="referrals" className="gap-2">
            <Gift className="w-4 h-4" />
            Indicações
          </TabsTrigger>
          <TabsTrigger value="reengagement" className="gap-2">
            <Mail className="w-4 h-4" />
            Reengajamento
          </TabsTrigger>
          <TabsTrigger value="promoters" className="gap-2">
            <BadgeDollarSign className="w-4 h-4" />
            Promotores
          </TabsTrigger>
        </TabsList>

        <TabsContent value="metrics">
          <div className="glass rounded-xl p-6">
            <h3 className="font-semibold mb-6">Dashboard de Métricas</h3>
            <AdminMetrics />
          </div>
        </TabsContent>

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
          {/* ── Solicitações de mudança de nome ── */}
          {nameRequests.length > 0 && (
            <div className="glass rounded-xl p-6 mb-4">
              <h3 className="mb-1 font-semibold">Solicitações de mudança de nome ({nameRequests.length})</h3>
              <p className="mb-4 text-xs text-muted-foreground">Aprove ou rejeite os pedidos de troca de nome de perfil.</p>
              <div className="space-y-2">
                {nameRequests.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-secondary">
                      {r.avatar ? (
                        <img src={resolveServerUrl(r.avatar)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm font-bold text-muted-foreground">{(r.currentName || r.requestedName || '?')[0]}</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="text-muted-foreground line-through">{r.currentName || '—'}</span>
                        <span className="mx-2">→</span>
                        <span className="font-semibold text-foreground">{r.requestedName}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{r.email || 'sem e-mail'} · {formatDateTime(r.createdAt)}</p>
                      {r.reason ? <p className="text-xs text-muted-foreground">Motivo: {r.reason}</p> : null}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => void handleApproveNameChange(r.id)}>Aprovar</Button>
                      <Button size="sm" variant="outline" onClick={() => void handleRejectNameChange(r.id)}>Rejeitar</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Perfis de vitrine (seed/manada) ── */}
          <div className="glass rounded-xl p-6 mb-4">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-amber-500">★</span>
                <h3 className="font-semibold">Perfis de vitrine ({showcaseProfiles.length})</h3>
              </div>
              <Button
                size="sm"
                className="gap-2 bg-amber-500 hover:bg-amber-600 text-white"
                disabled={runningRotation || showcaseProfiles.length === 0}
                onClick={() => void handleRunRotation()}
              >
                {runningRotation ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>▶</span>}
                {runningRotation ? 'Rodando...' : 'Ativar revezamento agora'}
              </Button>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              Conteúdo curado que mantém o feed/stories vivos (efeito manada). Não aparecem no Match/Radar/Busca e respondem DM com um aviso honesto.
              O sistema <strong>reveza automaticamente</strong> os stories (mantém 3 ativos por perfil) e resurge 1 post por perfil em horários de pico (09/13/17/20/23h).
              Marque um perfil pela lista de usuários abaixo (botão <strong>☆ Vitrine</strong>) — suba fotos/vídeos e posts nesse perfil normalmente.
            </p>
            {showcaseProfiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum perfil de vitrine ainda. Crie perfis normais e marque-os como vitrine na lista abaixo.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {showcaseProfiles.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-xl border border-amber-400/25 bg-amber-400/5 p-3">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-secondary">
                      {p.avatar ? (
                        <img src={resolveServerUrl(p.avatar)} alt={p.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm font-bold text-muted-foreground">{(p.name || '?')[0]}</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.mediaCount} mídia(s) · {p.postsCount} post(s) · {p.storiesActive} story ativo(s)
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-xs text-muted-foreground hover:text-destructive"
                      disabled={busyUserId === p.id}
                      onClick={() => void handleRemoveShowcase(p.id)}
                    >
                      Remover
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

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
              <Button
                variant={showOnlyShowcase ? 'default' : 'outline'}
                className={cn('gap-2', showOnlyShowcase && 'bg-amber-500 hover:bg-amber-600 text-white')}
                onClick={() => setShowOnlyShowcase((v) => !v)}
              >
                <span>★</span>
                Só vitrine
              </Button>
            </div>

            {/* Filtros: data de cadastro, cidade, estado — combinados com a busca acima */}
            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Cadastro de</label>
                <Input
                  type="date"
                  value={filterCreatedFrom}
                  onChange={(e) => setFilterCreatedFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Cadastro até</label>
                <Input
                  type="date"
                  value={filterCreatedTo}
                  onChange={(e) => setFilterCreatedTo(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Cidade</label>
                <Input
                  placeholder="Ex.: Fortaleza"
                  value={filterCity}
                  onChange={(e) => setFilterCity(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Estado (UF)</label>
                <Input
                  placeholder="Ex.: CE"
                  maxLength={2}
                  value={filterState}
                  onChange={(e) => setFilterState(e.target.value.toUpperCase())}
                />
              </div>
            </div>

            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {isLoadingMoreUsers && users.length === 0
                  ? 'Buscando…'
                  : <>
                      <strong className="text-foreground">{usersTotal}</strong> usuário(s) encontrado(s)
                      {showOnlyShowcase ? <> · {filteredUsers.length} na vitrine</> : null}
                    </>}
              </p>
              {(filterCity || filterState || filterCreatedFrom || filterCreatedTo || searchQuery) && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                  onClick={() => {
                    setSearchQuery('');
                    setFilterCity('');
                    setFilterState('');
                    setFilterCreatedFrom('');
                    setFilterCreatedTo('');
                  }}
                >
                  Limpar filtros
                </button>
              )}
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
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{entry.name}</p>
                        {entry.gender && (
                          <Badge variant="outline" className="text-xs">
                            {(() => {
                              const g = entry.gender.toLowerCase();
                              if (g.startsWith('casal')) return '👫 Casal';
                              if (g === 'homem' || g.startsWith('homem')) return '👨 Homem';
                              if (g === 'mulher' || g.startsWith('mulher')) return '👩 Mulher';
                              return `⚧ ${entry.gender}`;
                            })()}
                          </Badge>
                        )}
                        {entry.fromPromoter
                          ? <Badge className="bg-violet-500/15 text-violet-500 border border-violet-500/30 text-xs">📣 Promotor</Badge>
                          : <Badge variant="outline" className="text-xs text-muted-foreground">Cadastro direto</Badge>}
                        {entry.isPremium && <Badge className="bg-gold text-black text-xs">Premium</Badge>}
                        {entry.isAdmin && <Badge variant="secondary" className="text-xs">Admin</Badge>}
                        {entry.status === 'banned' && <Badge variant="destructive" className="text-xs">Banido</Badge>}
                        {entry.isDeactivated && <Badge variant="outline" className="text-xs">Conta desativada</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{entry.email || 'Sem e-mail público'}</p>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {entry.city || entry.state ? (
                          <span>Local: {[entry.city, entry.state].filter(Boolean).join('/')}</span>
                        ) : null}
                        {entry.createdAt ? <span>Cadastro: {formatDateTime(entry.createdAt)}</span> : null}
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
                    {showcaseProfiles.some((p) => p.id === entry.id) ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-amber-400/50 text-amber-600 hover:bg-amber-400/10"
                        disabled={busyUserId === entry.id}
                        onClick={() => void handleRemoveShowcase(entry.id)}
                      >
                        ★ Remover vitrine
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyUserId === entry.id || entry.isAdmin}
                        onClick={() => void handleMarkShowcase(entry.id)}
                      >
                        ☆ Vitrine
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
              {/* Rolagem infinita: sentinel observado carrega a próxima página sozinho */}
              {!isLoading && hasMoreUsers && (
                <div ref={usersSentinelRef} className="flex items-center justify-center py-4">
                  {isLoadingMoreUsers && (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
                  )}
                </div>
              )}
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
                      <div className="flex flex-wrap gap-2 shrink-0 justify-end">
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={busyReportId === report.id}
                          onClick={() => void handleResolveReport(report.id, 'ban')}
                        >
                          <Ban className="w-4 h-4 mr-1" />
                          {report.targetType === 'user' ? 'Banir' : 'Banir autor'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
                          disabled={busyReportId === report.id}
                          onClick={() => void handleResolveReport(report.id, 'warn')}
                        >
                          <AlertTriangle className="w-4 h-4 mr-1" />
                          Advertir
                        </Button>
                        {report.targetType !== 'user' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-destructive/50 text-destructive hover:bg-destructive/10"
                            disabled={busyReportId === report.id}
                            onClick={() => void handleResolveReport(report.id, 'remove_content')}
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Remover conteúdo
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busyReportId === report.id}
                          onClick={() => void handleResolveReport(report.id, 'dismiss')}
                        >
                          <Check className="w-4 h-4 mr-1" />
                          Descartar
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
          {/* Painel de Assinaturas — dados reais de billing (Hub) */}
          <Card className="p-6 glass mb-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <h3 className="font-semibold text-lg">Painel de Assinaturas</h3>
              {subAnalytics && (
                <span className="text-xs text-muted-foreground">
                  {subAnalytics.product?.name ?? 'NoSigilo'} · atualizado {new Date(subAnalytics.generatedAt).toLocaleString('pt-BR')}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-4">Faturamento, churn, retenção e projeção — com valores reais de pagamentos.</p>

            {subAnalyticsLoading ? (
              <div className="flex justify-center py-10">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
              </div>
            ) : (subAnalyticsError || !subAnalytics) ? (
              <p className="py-6 text-sm text-muted-foreground">
                Não foi possível carregar os dados de billing do Hub agora. Tente recarregar em instantes.
              </p>
            ) : (() => {
              const a = subAnalytics;
              const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
              const maxRev = Math.max(1, ...a.monthly.map((m) => m.revenueCents));
              const maxProj = Math.max(1, ...a.projection.map((m) => m.projectedRevenueCents));
              const fmtMonth = (m: string) => { const [y, mo] = m.split('-'); return `${mo}/${y.slice(2)}`; };
              const kpis = [
                { label: 'Assinantes ativos', value: String(a.summary.activeSubscribers), tone: 'text-foreground' },
                { label: 'MRR (receita mensal)', value: brl(a.summary.mrrCents), tone: 'text-success' },
                { label: 'Faturamento 12 meses', value: brl(a.summary.revenueLast12moCents), tone: 'text-success' },
                { label: 'Projeção próximos 12m', value: brl(a.summary.projectedNext12moCents), tone: 'text-primary' },
                { label: 'Novos (12m)', value: `+${a.summary.newLast12mo}`, tone: 'text-primary' },
                { label: 'Não renovaram (12m)', value: String(a.summary.churnedLast12mo), tone: 'text-destructive' },
                { label: 'Churn / Retenção', value: `${a.summary.churnRatePct}% / ${a.summary.retentionRatePct}%`, tone: 'text-foreground' },
                { label: 'Ticket médio (ARPU)', value: brl(a.summary.arpuCents), tone: 'text-foreground' },
              ];
              return (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {kpis.map((k) => (
                      <div key={k.label} className="rounded-xl bg-secondary/30 p-4">
                        <p className={`text-xl font-bold ${k.tone}`}>{k.value}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{k.label}</p>
                      </div>
                    ))}
                  </div>

                  <div>
                    <h4 className="mb-2 text-sm font-semibold">Faturamento — últimos 12 meses</h4>
                    <div className="flex h-40 items-end gap-1.5">
                      {a.monthly.map((m) => (
                        <div key={m.month} className="flex flex-1 flex-col items-center gap-1" title={`${fmtMonth(m.month)}: ${brl(m.revenueCents)}`}>
                          <div className="w-full rounded-t bg-gradient-to-t from-emerald-600 to-emerald-400" style={{ height: `${Math.max(2, (m.revenueCents / maxRev) * 100)}%` }} />
                          <span className="text-[9px] text-muted-foreground">{fmtMonth(m.month)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                          <th className="py-2 pr-3">Mês</th>
                          <th className="px-3 py-2 text-right">Faturamento</th>
                          <th className="px-3 py-2 text-right">Novos</th>
                          <th className="px-3 py-2 text-right">Renovações</th>
                          <th className="px-3 py-2 text-right">Não renovaram</th>
                        </tr>
                      </thead>
                      <tbody>
                        {a.monthly.map((m) => (
                          <tr key={m.month} className="border-b border-border/30">
                            <td className="py-1.5 pr-3">{fmtMonth(m.month)}</td>
                            <td className="px-3 py-1.5 text-right font-medium text-success">{brl(m.revenueCents)}</td>
                            <td className="px-3 py-1.5 text-right text-primary">+{m.newCustomers}</td>
                            <td className="px-3 py-1.5 text-right">{m.renewals}</td>
                            <td className="px-3 py-1.5 text-right text-destructive">{m.churned}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <h4 className="mb-1 text-sm font-semibold">Projeção — próximos 12 meses</h4>
                    <p className="mb-2 text-xs text-muted-foreground">
                      Estimativa a partir do MRR atual e do crescimento líquido recente ({a.summary.netMonthlyGrowthPct}%/mês). É projeção, não garantia.
                    </p>
                    <div className="flex h-32 items-end gap-1.5">
                      {a.projection.map((m) => (
                        <div key={m.month} className="flex flex-1 flex-col items-center gap-1" title={`${fmtMonth(m.month)}: ${brl(m.projectedRevenueCents)}`}>
                          <div className="w-full rounded-t bg-gradient-to-t from-primary/70 to-primary/30" style={{ height: `${Math.max(2, (m.projectedRevenueCents / maxProj) * 100)}%` }} />
                          <span className="text-[9px] text-muted-foreground">{fmtMonth(m.month)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </Card>

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

          {/* Funil de conversão: cadastro → uso → paywall → PIX → assinatura */}
          <Card className="p-6 glass mt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="font-semibold">Funil de conversão</h3>
                <p className="text-xs text-muted-foreground">
                  Onde os usuários caem fora entre cadastrar e assinar — para saber onde investir para aumentar a conversão.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {[
                  { value: 'all' as const, label: 'Todos' },
                  { value: '7' as const, label: '7 dias' },
                  { value: '30' as const, label: '30 dias' },
                  { value: '90' as const, label: '90 dias' },
                ].map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={funnelPeriod === option.value ? 'default' : 'outline'}
                    className="h-8 px-3 text-xs"
                    onClick={() => setFunnelPeriod(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
            {funnelPeriod !== 'all' && (
              <p className="mt-1 text-xs text-primary">
                Mostrando apenas quem se cadastrou nos últimos {funnelPeriod} dias (coorte).
              </p>
            )}

            {funnelLoading ? (
              <div className="flex justify-center py-10">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
              </div>
            ) : !funnel ? (
              <p className="mt-4 text-sm text-muted-foreground">Não foi possível carregar o funil agora.</p>
            ) : (() => {
              const f = funnel;
              const max = Math.max(1, ...f.funnel.map((s) => s.count));
              const nc = f.nonConverters;
              return (
                <div className="mt-4 space-y-6">
                  {/* Funil visual */}
                  <div className="space-y-2">
                    {f.funnel.map((s, i) => {
                      const pctOfMax = Math.max(4, Math.round((s.count / max) * 100));
                      const dropFromPrev = i > 0 ? f.funnel[i - 1].count - s.count : 0;
                      return (
                        <div key={s.stage}>
                          <div className="flex items-center justify-between text-xs mb-0.5">
                            <span className="text-muted-foreground">{s.stage}</span>
                            <span className="font-semibold">{s.count}</span>
                          </div>
                          <div className="h-6 w-full rounded-md bg-secondary/30 overflow-hidden">
                            <div
                              className="h-full rounded-md bg-gradient-to-r from-primary/60 to-primary"
                              style={{ width: `${pctOfMax}%` }}
                            />
                          </div>
                          {i > 0 && dropFromPrev > 0 && (
                            <p className="mt-0.5 text-[10px] text-destructive">−{dropFromPrev} não avançaram desta etapa</p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-secondary/30 p-4">
                      <p className="text-2xl font-bold text-primary">{f.overallConversionPct}%</p>
                      <p className="text-xs text-muted-foreground">Conversão geral (cadastro → assinante)</p>
                    </div>
                    <div className="rounded-xl bg-secondary/30 p-4">
                      <p className="text-2xl font-bold text-foreground">{f.conversionByEngagement.engaged.ratePct}% <span className="text-sm text-muted-foreground font-normal">vs</span> {f.conversionByEngagement.notEngaged.ratePct}%</p>
                      <p className="text-xs text-muted-foreground">Converte quem usa o app (postou/curtiu/mandou msg) vs quem não usa</p>
                    </div>
                  </div>

                  {/* Comportamento de quem viu o paywall e não assinou */}
                  <div>
                    <h4 className="mb-2 text-sm font-semibold">
                      Viram que precisam pagar e não assinaram: <span className="text-destructive">{nc.total}</span> usuário(s)
                    </h4>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg bg-secondary/30 p-3">
                        <p className="text-xl font-bold text-destructive">{nc.neverEngaged}</p>
                        <p className="text-xs text-muted-foreground">Nunca usaram o app de verdade — cadastraram e sumiram</p>
                      </div>
                      <div className="rounded-lg bg-secondary/30 p-3">
                        <p className="text-xl font-bold text-amber-500">{nc.engagedNoPix}</p>
                        <p className="text-xs text-muted-foreground">Usaram o app, viram o paywall, mas nem tentaram pagar</p>
                      </div>
                      <div className="rounded-lg bg-secondary/30 p-3">
                        <p className="text-xl font-bold text-orange-500">{nc.generatedPixNoPay}</p>
                        <p className="text-xs text-muted-foreground">Chegaram a gerar o PIX, mas não pagaram</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Leitura: se <strong>"nunca usaram"</strong> for o maior grupo, o problema é o produto não engajar antes do trial acabar
                      (onboarding/primeira experiência). Se for <strong>"usaram e não tentaram pagar"</strong>, o preço/oferta não convenceu
                      quem já viu valor — teste preço, trial mais longo ou oferta de desconto na hora do paywall. Se for
                      <strong> "gerou PIX e não pagou"</strong>, é fricção no checkout — use a lista de "Quem gerou o PIX e não pagou" abaixo
                      para recuperar diretamente.
                    </p>
                  </div>
                </div>
              );
            })()}
          </Card>

          {/* Abandono de PIX — gerou o código mas não pagou (carência de 24h) */}
          <Card className="p-6 glass mt-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">Abandono de PIX</h3>
                <p className="text-xs text-muted-foreground">
                  Usuários que geraram o PIX há mais de {pixAbandon?.graceHours ?? 24}h e ainda não assinaram.
                </p>
              </div>
            </div>
            {pixAbandon && pixAbandon.eligibleUsers > 0 ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg bg-secondary/30 p-4">
                  <p className="text-3xl font-bold text-destructive">{pixAbandon.abandonmentRate}%</p>
                  <p className="text-xs text-muted-foreground">Taxa de abandono</p>
                </div>
                <div className="rounded-lg bg-secondary/30 p-4">
                  <p className="text-3xl font-bold text-foreground">{pixAbandon.abandonedUsers}</p>
                  <p className="text-xs text-muted-foreground">Desistiram (de {pixAbandon.eligibleUsers} que geraram)</p>
                </div>
                <div className="rounded-lg bg-secondary/30 p-4">
                  <p className="text-3xl font-bold text-success">{pixAbandon.convertedUsers}</p>
                  <p className="text-xs text-muted-foreground">Geraram e assinaram</p>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Ainda sem dados elegíveis. A métrica passa a contar as gerações de PIX a partir de agora
                (gerações com menos de 24h ficam em carência).
              </p>
            )}

            {/* Lista: quem gerou o PIX e não pagou (recuperação) */}
            <div className="mt-5 border-t border-border/40 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Quem gerou o PIX e não pagou</p>
                  <p className="text-xs text-muted-foreground">Lista de usuários para recuperar (não são premium/licenciados hoje).</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => void loadPixAbandoners()} disabled={pixAbandonersLoading}>
                    <RefreshCw className={`w-4 h-4 ${pixAbandonersLoading ? 'animate-spin' : ''}`} /> Ver lista
                  </Button>
                  {pixAbandoners && pixAbandoners.length > 0 && (
                    <Button variant="outline" size="sm" onClick={handleExportAbandonersCsv}>
                      <ExternalLink className="w-4 h-4" /> Exportar
                    </Button>
                  )}
                </div>
              </div>

              {pixAbandonersLoading ? (
                <div className="flex justify-center py-6">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
                </div>
              ) : pixAbandoners === null ? null : pixAbandoners.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Ninguém pendente — todos que geraram PIX (há +24h) já pagaram. 🎉</p>
              ) : (
                <>
                  <p className="mt-3 text-sm">
                    <strong className="text-destructive">{pixAbandoners.length}</strong> usuário(s) geraram o PIX e não pagaram.
                  </p>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                          <th className="py-2 pr-3">Usuário</th>
                          <th className="px-3 py-2">Cidade</th>
                          <th className="px-3 py-2 text-right">Tentativas</th>
                          <th className="px-3 py-2 text-right">Última geração</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pixAbandoners.slice(0, 200).map((u) => (
                          <tr key={u.id} className="border-b border-border/30">
                            <td className="py-1.5 pr-3">
                              <span className="font-medium">{u.name || '—'}</span>
                              <span className="block text-xs text-muted-foreground">{u.email}</span>
                            </td>
                            <td className="px-3 py-1.5">{[u.city, u.state].filter(Boolean).join(', ') || '—'}</td>
                            <td className="px-3 py-1.5 text-right">{u.attempts}</td>
                            <td className="px-3 py-1.5 text-right text-xs text-muted-foreground">
                              {u.lastGeneratedAt ? new Date(u.lastGeneratedAt).toLocaleString('pt-BR') : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {pixAbandoners.length > 200 && (
                    <p className="mt-2 text-xs text-muted-foreground">Mostrando 200 de {pixAbandoners.length}. O "Exportar" traz todos.</p>
                  )}
                </>
              )}
            </div>
          </Card>

          {/* Relatório de MRR — histórico + projeção 12 meses */}
          {revenueReport && (() => {
            const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
            const lbl = (m: string) => { const [y, mm] = m.split('-'); return `${mm}/${y.slice(2)}`; };
            const hist = revenueReport.history.map((h) => ({ month: lbl(h.month), historico: Math.round(h.mrrCents / 100), projecao: null as number | null }));
            if (hist.length > 0) hist[hist.length - 1].projecao = hist[hist.length - 1].historico;
            const proj = revenueReport.projection.map((p) => ({ month: lbl(p.month), historico: null as number | null, projecao: Math.round(p.mrrCents / 100) }));
            const data = [...hist, ...proj];
            const growthPct = (revenueReport.growthRate * 100).toFixed(1);
            return (
              <Card className="mt-6 p-6 glass">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h3 className="font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Receita recorrente (MRR) — histórico e projeção</h3>
                </div>

                <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border bg-secondary/30 p-3">
                    <p className="text-xs text-muted-foreground">MRR atual</p>
                    <p className="text-xl font-bold text-success">{brl(revenueReport.currentMrrCents)}</p>
                    <p className="text-[11px] text-muted-foreground">{revenueReport.payingUsers} assinantes</p>
                  </div>
                  <div className="rounded-xl border bg-secondary/30 p-3">
                    <p className="text-xs text-muted-foreground">ARR (anual)</p>
                    <p className="text-xl font-bold">{brl(revenueReport.arrCents)}</p>
                  </div>
                  <div className="rounded-xl border bg-secondary/30 p-3">
                    <p className="text-xs text-muted-foreground">Crescimento mensal</p>
                    <p className={cn('text-xl font-bold', revenueReport.growthRate >= 0 ? 'text-emerald-500' : 'text-destructive')}>
                      {revenueReport.growthRate >= 0 ? '+' : ''}{growthPct}%
                    </p>
                  </div>
                  <div className="rounded-xl border bg-secondary/30 p-3">
                    <p className="text-xs text-muted-foreground">Projeção em 12 meses</p>
                    <p className="text-xl font-bold text-primary">{brl(revenueReport.projected12mCents)}</p>
                  </div>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 5, right: 8, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                      <Tooltip
                        formatter={(v: any, name: string) => [Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }), name === 'historico' ? 'Histórico' : 'Projeção']}
                        contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                      />
                      <Line type="monotone" dataKey="historico" stroke="#10b981" strokeWidth={2} dot={false} connectNulls name="historico" />
                      <Line type="monotone" dataKey="projecao" stroke="#eb4778" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls name="projecao" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <p className="mt-3 text-[11px] text-muted-foreground">
                  Linha verde = histórico · linha rosa tracejada = projeção (crescimento médio de {growthPct}%/mês).
                  {revenueReport.historyIsEstimated && ' Como não há registro de pagamentos no banco, os meses anteriores são uma estimativa pela data de cadastro dos assinantes atuais; a partir de agora o MRR real é registrado mês a mês.'}
                </p>
              </Card>
            );
          })()}
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

        <TabsContent value="states">
          <Card className="p-6 glass">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">Cidades sem estado (UF)</h3>
                <p className="text-xs text-muted-foreground">
                  Usuários com cidade preenchida mas sem UF. A maioria é resolvida automaticamente pela base de cidades;
                  o resto você corrige na planilha e importa de volta.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => void loadMissingStates()} disabled={missingStateLoading || statesBusy}>
                  <RefreshCw className={`w-4 h-4 ${missingStateLoading ? 'animate-spin' : ''}`} /> Carregar
                </Button>
                <Button size="sm" onClick={() => void handleAutofillStates()} disabled={statesBusy || missingStateMeta.withSuggestion === 0}>
                  <CheckSquare className="w-4 h-4" /> Preencher automático ({missingStateMeta.withSuggestion})
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportStatesCsv} disabled={missingState.length === 0}>
                  <ExternalLink className="w-4 h-4" /> Exportar planilha
                </Button>
                <Button variant="outline" size="sm" onClick={() => statesFileRef.current?.click()} disabled={statesBusy}>
                  <FileText className="w-4 h-4" /> Importar planilha
                </Button>
                <input
                  ref={statesFileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImportStatesCsv(f); e.target.value = ''; }}
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-secondary/30 p-3">
                <p className="text-2xl font-bold">{missingStateMeta.total}</p>
                <p className="text-xs text-muted-foreground">Sem UF</p>
              </div>
              <div className="rounded-lg bg-secondary/30 p-3">
                <p className="text-2xl font-bold text-success">{missingStateMeta.withSuggestion}</p>
                <p className="text-xs text-muted-foreground">Resolvem automático</p>
              </div>
              <div className="rounded-lg bg-secondary/30 p-3">
                <p className="text-2xl font-bold text-destructive">{missingStateMeta.ambiguous}</p>
                <p className="text-xs text-muted-foreground">Ambíguas (mesma cidade em UFs diferentes)</p>
              </div>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              Na planilha, preencha a coluna <strong>uf</strong> (2 letras, ex: CE) e importe de volta. As colunas
              <strong> id</strong> e <strong>uf</strong> são as únicas usadas — não apague o <strong>id</strong>.
            </p>

            <div className="mt-4 overflow-x-auto">
              {missingStateLoading ? (
                <div className="flex justify-center py-10">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
                </div>
              ) : missingState.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {missingStateMeta.total === 0 ? 'Clique em "Carregar" para buscar os usuários sem UF.' : 'Nenhum usuário sem UF. 🎉'}
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3">Usuário</th>
                      <th className="px-3 py-2">Cidade</th>
                      <th className="px-3 py-2">UF sugerida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missingState.slice(0, 300).map((u) => (
                      <tr key={u.id} className="border-b border-border/30">
                        <td className="py-1.5 pr-3">
                          <span className="font-medium">{u.name || '—'}</span>
                          <span className="block text-xs text-muted-foreground">{u.email}</span>
                        </td>
                        <td className="px-3 py-1.5">{u.city}</td>
                        <td className="px-3 py-1.5">
                          {u.suggestedState ? (
                            <span className="rounded bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">{u.suggestedState}</span>
                          ) : u.ambiguous ? (
                            <span className="text-xs text-destructive">ambígua — preencha manualmente</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">não encontrada</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {missingState.length > 300 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Mostrando 300 de {missingState.length}. A planilha exporta todos.
                </p>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="visits">
          <div className="space-y-6">
            {/* ── KPI row ── */}
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-7">
              {[
                { icon: Globe2,           color: 'text-primary',        bg: 'bg-primary/10',       value: visitAnalytics.total.toLocaleString('pt-BR'),       label: 'Total de visitas' },
                { icon: MousePointerClick,color: 'text-amber-500',      bg: 'bg-amber-500/10',     value: visitAnalytics.today.toLocaleString('pt-BR'),       label: 'Últimas 24h' },
                { icon: TrendingUp,       color: 'text-emerald-600',    bg: 'bg-emerald-500/10',   value: visitAnalytics.last7Days.toLocaleString('pt-BR'),   label: 'Últimos 7 dias' },
                { icon: Users,            color: 'text-blue-600',       bg: 'bg-blue-500/10',      value: visitAnalytics.uniqueToday.toLocaleString('pt-BR'), label: 'Únicos (24h)' },
                { icon: Users,            color: 'text-sky-600',        bg: 'bg-sky-500/10',       value: visitAnalytics.uniqueLastHour.toLocaleString('pt-BR'), label: 'Únicos (última hora)' },
                { icon: Users,            color: 'text-emerald-600',    bg: 'bg-emerald-500/15',   value: visitAnalytics.onlineNow.toString(),                label: 'Online agora' },
                { icon: TrendingUp,       color: 'text-purple-600',     bg: 'bg-purple-500/10',    value: visitAnalytics.byDay.length.toString(),             label: 'Dias c/ dados (30d)' },
              ].map(({ icon: Icon, color, bg, value, label }) => (
                <Card key={label} className="p-4 glass">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                      <Icon className={`w-4 h-4 ${color}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xl font-bold leading-tight">{value}</p>
                      <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {/* ── Conversão de Homens (funil, retorno, sinal, ação) ── */}
            <Card className="p-5 glass">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold">Conversão de Homens</h3>
                  <p className="text-xs text-muted-foreground">
                    Homens cadastrados no período · por que não assinam e se a isca (sinal da vitrine) está convertendo
                  </p>
                </div>
                <div className="flex gap-1">
                  {([[1, 'Hoje'], [7, '7 dias'], [30, '30 dias']] as Array<[1 | 7 | 30, string]>).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setMenConvPeriod(v)}
                      className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${menConvPeriod === v ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {!menConv ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : menConv.funnel.homens === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum homem cadastrado no período.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {/* Funil */}
                  <div className="rounded-xl border border-border/50 bg-secondary/20 p-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">Funil</p>
                    <p className="text-3xl font-bold leading-none">{menConv.funnel.conversaoPct ?? 0}%</p>
                    <p className="mb-3 text-xs text-muted-foreground">{menConv.funnel.assinaram} de {menConv.funnel.homens} assinaram</p>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      <li className="flex justify-between"><span>Não assinaram</span><span className="font-semibold text-foreground">{menConv.funnel.naoAssinaram}</span></li>
                      <li className="flex justify-between"><span>Abriram checkout</span><span className="font-semibold text-foreground">{menConv.funnel.abriramCheckout}</span></li>
                      <li className="flex justify-between"><span>Gerou Pix, não pagou</span><span className="font-semibold text-foreground">{menConv.funnel.gerouPixNaoPagou}</span></li>
                      <li className="flex justify-between"><span>Nunca abriu checkout</span><span className="font-semibold text-amber-500">{menConv.funnel.nuncaAbriuCheckout}</span></li>
                    </ul>
                  </div>
                  {/* Sinal */}
                  <div className="rounded-xl border border-border/50 bg-secondary/20 p-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-500">Sinal recebido</p>
                    <p className="text-3xl font-bold leading-none">{menConv.sinal.comSinal}</p>
                    <p className="mb-3 text-xs text-muted-foreground">com sinal · {menConv.sinal.semSinal} sem sinal</p>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      <li className="flex justify-between"><span>Conv. c/ sinal</span><span className="font-semibold text-emerald-600">{menConv.sinal.convPctComSinal ?? 0}%</span></li>
                      <li className="flex justify-between"><span>Conv. s/ sinal</span><span className="font-semibold text-foreground">{menConv.sinal.convPctSemSinal ?? 0}%</span></li>
                    </ul>
                  </div>
                  {/* Retorno */}
                  <div className="rounded-xl border border-border/50 bg-secondary/20 p-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-500">Retorno</p>
                    <p className="text-3xl font-bold leading-none">{menConv.retorno.churnPct ?? 0}%</p>
                    <p className="mb-3 text-xs text-muted-foreground">sumiram na 1ª sessão</p>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      <li className="flex justify-between"><span>Não assinantes</span><span className="font-semibold text-foreground">{menConv.retorno.naoAssinantes}</span></li>
                      <li className="flex justify-between"><span>Sumiram 1ª sessão</span><span className="font-semibold text-amber-500">{menConv.retorno.sumiram1aSessao}</span></li>
                      <li className="flex justify-between"><span>Voltaram</span><span className="font-semibold text-emerald-600">{menConv.retorno.voltaram}</span></li>
                    </ul>
                  </div>
                  {/* Ação */}
                  <div className="rounded-xl border border-border/50 bg-secondary/20 p-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-500">Engajamento (não assinantes)</p>
                    <p className="text-3xl font-bold leading-none">{menConv.acao.engajouNaoPagou}</p>
                    <p className="mb-3 text-xs text-muted-foreground">engajaram mas não pagaram</p>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      <li className="flex justify-between"><span>Não fez nada</span><span className="font-semibold text-foreground">{menConv.acao.naoFezNada}</span></li>
                      <li className="flex justify-between"><span>Explorou pouco (1–5)</span><span className="font-semibold text-foreground">{menConv.acao.explorouPouco}</span></li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Jornada: até onde os que NÃO assinaram chegam antes de sair */}
              {menConv && menConv.jornada && menConv.jornada.base > 0 && (
                <div className="mt-4 rounded-xl border border-border/50 bg-secondary/20 p-4">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-sky-500">Até onde vão (não assinantes)</p>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Dos {menConv.jornada.base} homens que não assinaram, quantos alcançaram cada tela antes de sair
                  </p>
                  <div className="space-y-1.5">
                    {menConv.jornada.etapas.map((e) => {
                      const p = menConv.jornada.base > 0 ? Math.round((1000 * e.men) / menConv.jornada.base) / 10 : 0;
                      return (
                        <div key={e.key} className="flex items-center gap-3 text-xs">
                          <span className="w-28 shrink-0 truncate text-muted-foreground">{e.label}</span>
                          <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-background/50">
                            <div className="h-full rounded-full bg-sky-500/70" style={{ width: `${Math.min(100, p)}%` }} />
                          </div>
                          <span className="w-20 shrink-0 text-right font-semibold text-foreground">{e.men} · {p}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Página de origem: de onde vieram os cliques em "assinar" */}
              {menConv && menConv.porPagina.length > 0 && (
                <div className="mt-4 rounded-xl border border-border/50 bg-secondary/20 p-4">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Página de origem</p>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Onde o usuário estava ao gerar o PIX · mostra pra onde vale mais mandar tráfego masculino
                  </p>
                  <div className="space-y-1.5">
                    {menConv.porPagina.map((p) => (
                      <div key={p.pagePath ?? '(sem-registro)'} className="flex items-center justify-between gap-3 rounded-lg bg-background/40 px-3 py-2 text-xs">
                        <span className="font-mono text-foreground">{p.pagePath ?? '(antes do rastreamento)'}</span>
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <span>{p.geracoes} geraç{p.geracoes === 1 ? 'ão' : 'ões'}</span>
                          <span>{p.convertidos}/{p.usuarios} converteram</span>
                          <span className="w-12 text-right font-semibold text-emerald-600">{p.conversaoPct ?? 0}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* ── Acessos por dia + Novos usuários por dia (bar charts) ── */}
            <div className="grid gap-4 xl:grid-cols-2">
              {/* Visits by day */}
              {(() => {
                const items = [...visitAnalytics.byDay].reverse();
                const max = Math.max(1, ...items.map(d => d.count));
                return (
                  <Card className="p-5 glass">
                    <h3 className="font-semibold mb-1">Acessos por dia</h3>
                    <p className="text-xs text-muted-foreground mb-4">Últimos 30 dias</p>
                    {items.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sem dados por dia ainda.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {items.map((d) => (
                          <div key={d.label} className="flex items-center gap-2 text-xs">
                            <span className="w-20 shrink-0 text-muted-foreground tabular-nums">{d.label.slice(5)}</span>
                            <div className="flex-1 h-5 bg-secondary/40 rounded overflow-hidden">
                              <div
                                className="h-full bg-primary/70 rounded transition-all"
                                style={{ width: `${(d.count / max) * 100}%` }}
                              />
                            </div>
                            <span className="w-8 text-right shrink-0 font-medium tabular-nums">{d.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })()}

              {/* New users by day */}
              {(() => {
                const items = visitAnalytics.newUsersByDay;
                const max = Math.max(1, ...items.map(d => d.count));
                return (
                  <Card className="p-5 glass">
                    <h3 className="font-semibold mb-1">Novos cadastros por dia</h3>
                    <p className="text-xs text-muted-foreground mb-4">Últimos 30 dias</p>
                    {items.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sem dados de cadastro ainda.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {items.map((d) => (
                          <div key={d.label} className="flex items-center gap-2 text-xs">
                            <span className="w-20 shrink-0 text-muted-foreground tabular-nums">{d.label.slice(5)}</span>
                            <div className="flex-1 h-5 bg-secondary/40 rounded overflow-hidden">
                              <div
                                className="h-full bg-emerald-500/70 rounded transition-all"
                                style={{ width: `${(d.count / max) * 100}%` }}
                              />
                            </div>
                            <span className="w-8 text-right shrink-0 font-medium tabular-nums">{d.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })()}
            </div>

            {/* ── Acessos por dia da semana ── */}
            {(() => {
              // Reordena Segunda→Domingo (mais natural para leitura); dado vem 0=Domingo..6=Sábado
              const order = [1, 2, 3, 4, 5, 6, 0];
              const items = order
                .map((w) => visitAnalytics.byWeekday.find((d) => d.weekday === w))
                .filter((d): d is { weekday: number; label: string; count: number } => !!d);
              const max = Math.max(1, ...items.map((d) => d.count));
              const todayWeekday = new Date().getDay();
              return (
                <Card className="p-5 glass">
                  <h3 className="font-semibold mb-1">Acessos por dia da semana</h3>
                  <p className="text-xs text-muted-foreground mb-4">Soma dos últimos 30 dias, por dia da semana</p>
                  {items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {items.map((d) => (
                        <div key={d.weekday} className="flex items-center gap-2 text-xs">
                          <span className={cn('w-20 shrink-0 tabular-nums', d.weekday === todayWeekday ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                            {d.label}
                          </span>
                          <div className="flex-1 h-5 bg-secondary/40 rounded overflow-hidden">
                            <div
                              className={cn('h-full rounded transition-all', d.weekday === todayWeekday ? 'bg-amber-500/80' : 'bg-primary/70')}
                              style={{ width: `${(d.count / max) * 100}%` }}
                            />
                          </div>
                          <span className="w-12 text-right shrink-0 font-medium tabular-nums">{d.count.toLocaleString('pt-BR')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })()}

            {/* ── Usuários únicos online por hora (média, horário de pico) ── */}
            {visitAnalytics.byHour.some((h) => h.count > 0) && (
              <Card className="p-5 glass">
                <h3 className="font-semibold mb-1">Usuários únicos online por hora (média)</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Média de usuários únicos a cada hora do dia (horário de Brasília), considerando os últimos 30 dias — mostra o horário de pico de gente online.
                </p>
                {(() => {
                  const max = Math.max(1, ...visitAnalytics.byHour.map(h => h.count));
                  const peakHour = visitAnalytics.byHour.reduce((a, b) => (b.count > a.count ? b : a), visitAnalytics.byHour[0]);
                  return (
                    <>
                      <p className="mb-3 text-sm">
                        <span className="text-muted-foreground">Horário de pico: </span>
                        <span className="font-semibold text-foreground">{peakHour.hour}h</span>
                        <span className="text-muted-foreground"> · ~{peakHour.count} únicos/hora em média</span>
                      </p>
                      <div className="flex items-end gap-0.5 h-24">
                        {visitAnalytics.byHour.map((h) => {
                          const pct = (h.count / max) * 100;
                          const isPeak = h.count === max;
                          return (
                            <div key={h.hour} className="group relative flex h-full flex-1 items-end">
                              <div className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 hidden group-hover:block bg-popover border rounded px-1.5 py-0.5 text-[10px] whitespace-nowrap z-10 shadow-sm">
                                {h.hour}h: {h.count} únicos/h
                              </div>
                              <div
                                className={`w-full rounded-sm transition-all ${isPeak ? 'bg-primary' : 'bg-primary/40'}`}
                                style={{ height: `${Math.max(2, pct)}%` }}
                              />
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-1 flex gap-0.5">
                        {visitAnalytics.byHour.map((h) => (
                          <span key={h.hour} className="flex-1 text-center text-[9px] text-muted-foreground tabular-nums">
                            {h.hour % 6 === 0 ? `${h.hour}h` : ''}
                          </span>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </Card>
            )}

            {/* ── Usuários únicos por dia (últimos 30 dias) ── */}
            {visitAnalytics.uniqueUsersByDay.length > 0 && (
              <Card className="p-5 glass">
                <h3 className="font-semibold mb-1">Usuários únicos por dia (últimos 30 dias)</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Quantos usuários únicos acessaram a plataforma em cada dia (horário de Brasília).
                </p>
                {(() => {
                  const items = visitAnalytics.uniqueUsersByDay;
                  const max = Math.max(1, ...items.map((d) => d.count));
                  const avg = Math.round(items.reduce((s, d) => s + d.count, 0) / Math.max(1, items.length));
                  return (
                    <>
                      <p className="mb-3 text-sm">
                        <span className="text-muted-foreground">Média diária: </span>
                        <span className="font-semibold text-foreground">{avg.toLocaleString('pt-BR')}</span>
                        <span className="text-muted-foreground"> usuários únicos/dia</span>
                      </p>
                      <div className="flex items-end gap-0.5 h-28">
                        {items.map((d) => {
                          const pct = (d.count / max) * 100;
                          const isPeak = d.count === max;
                          return (
                            <div key={d.label} className="group relative flex h-full flex-1 items-end">
                              <div className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 hidden group-hover:block bg-popover border rounded px-1.5 py-0.5 text-[10px] whitespace-nowrap z-10 shadow-sm">
                                {d.label.split('-').reverse().join('/')}: {d.count.toLocaleString('pt-BR')} únicos
                              </div>
                              <div
                                className={`w-full rounded-sm transition-all ${isPeak ? 'bg-emerald-500' : 'bg-emerald-500/40'}`}
                                style={{ height: `${Math.max(2, pct)}%` }}
                              />
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-1 flex gap-0.5">
                        {items.map((d) => (
                          <span key={d.label} className="flex-1 text-center text-[9px] text-muted-foreground tabular-nums">
                            {d.label.slice(8, 10)}
                          </span>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </Card>
            )}

            {/* ── Cidades em crescimento ── */}
            <Card className="p-5 glass">
              <div className="flex items-start justify-between gap-4 mb-1">
                <div>
                  <h3 className="font-semibold">Cidades em crescimento 🔥</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ordenado pelo nº de novos usuários nos últimos {visitAnalytics.growthPeriodDays} dias (mín. 5 usuários na cidade). A % mostra quanto isso representa do total da cidade.
                  </p>
                </div>
              </div>
              {visitAnalytics.growingCities.length === 0 ? (
                <p className="text-sm text-muted-foreground mt-4">Nenhuma cidade com 5+ usuários e cadastros no período ainda.</p>
              ) : (
                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {visitAnalytics.growingCities.slice(0, 15).map((city, i) => {
                    const isHot    = city.growth >= 50;
                    const isUp     = city.growth > 0;
                    const isStable = city.growth === 0;
                    const isDown   = city.growth < 0;
                    const bgClass  = isHot ? 'bg-orange-500/10 border-orange-400/30' : isUp ? 'bg-emerald-500/10 border-emerald-400/30' : isDown ? 'bg-red-500/10 border-red-400/20' : 'bg-secondary/40 border-transparent';
                    const textClass= isHot ? 'text-orange-600' : isUp ? 'text-emerald-600' : isDown ? 'text-red-500' : 'text-muted-foreground';
                    const arrow    = isHot ? '🔥' : isUp ? '↑' : isDown ? '↓' : '→';
                    return (
                      <div key={city.label} className={`rounded-xl border p-3 ${bgClass}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground mb-0.5">#{i + 1}</p>
                            <p className="font-medium text-sm truncate">{city.label}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              <span className="font-medium">{city.novos}</span> novos &nbsp;·&nbsp; de {city.total} no total
                            </p>
                          </div>
                          <div className={`text-right shrink-0 ${textClass}`}>
                            <p className="text-lg font-bold leading-none">{arrow} {city.novos}</p>
                            <p className="text-[10px] mt-1 text-muted-foreground">novos · {Math.abs(city.growth)}% da cidade</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* ── Origem / País / Páginas / Dispositivo ── */}
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

            {/* ── Região / Cidade de acesso / Ranking cadastros ── */}
            {/* Seletor de período para os acessos por região e cidade */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Período dos acessos:</span>
              {[
                { value: 'all' as const, label: 'Todos' },
                { value: '7' as const, label: '7 dias' },
                { value: '30' as const, label: '30 dias' },
                { value: '90' as const, label: '90 dias' },
              ].map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={accessPeriod === option.value ? 'default' : 'outline'}
                  className="h-8 px-3 text-xs"
                  onClick={() => setAccessPeriod(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <div className="grid gap-4 xl:grid-cols-3 xl:gap-6">
              <Card className="p-4 glass sm:p-6">
                <h3 className="mb-4 font-semibold">
                  Acessos por região
                  {accessPeriod !== 'all' && <span className="ml-1 text-xs font-normal text-muted-foreground">· últimos {accessPeriod} dias</span>}
                </h3>
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
                <h3 className="mb-4 font-semibold">
                  Acessos por cidade (ranking)
                  {accessPeriod !== 'all' && <span className="ml-1 text-xs font-normal text-muted-foreground">· últimos {accessPeriod} dias</span>}
                </h3>
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

        <TabsContent value="referrals">
          <AdminReferralsTab />
        </TabsContent>

        <TabsContent value="reengagement">
          <AdminReengagementTab />
        </TabsContent>

        <TabsContent value="promoters">
          <AdminPromotersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Referrals Tab ─────────────────────────────────────────────────────────

type ReferralStats = {
  statusCounts: Record<string, number>;
  tierStats: Array<{ rewardType: string; count: number; totalDays: number }>;
  topInviters: Array<{ userId: string; name: string; avatar: string | null; validatedCount: number }>;
  recentRewards: Array<{ id: string; inviterUserId: string; inviterName: string; inviterAvatar: string | null; rewardType: string; validInvitesCount: number; premiumDaysGranted: number; grantedAt: string }>;
  badgeCounts: Record<string, number>;
};

const TIER_META: Record<string, { label: string; icon: typeof Award; color: string }> = {
  ambassador: { label: 'Embaixador (3 indicações)', icon: Award, color: 'text-amber-600' },
  ambassador_gold: { label: 'Embaixador Gold (10 indicações)', icon: Trophy, color: 'text-yellow-500' },
  ambassador_elite: { label: 'Embaixador Elite (30 indicações)', icon: Gift, color: 'text-purple-500' },
};

function formatDateShort(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

function AdminReferralsTab() {
  const { toast } = useToast();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    setIsLoading(true);
    try {
      const data = await adminService.getReferralStats();
      setStats(data as ReferralStats);
    } catch {
      toast({ title: 'Erro ao carregar stats de indicações', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (isLoading) {
    return <div className="py-16 text-center text-muted-foreground">Carregando estatísticas de indicações...</div>;
  }

  if (!stats) {
    return <div className="py-16 text-center text-muted-foreground">Não foi possível carregar os dados.</div>;
  }

  const { statusCounts, tierStats, topInviters, recentRewards, badgeCounts } = stats;

  return (
    <div className="space-y-6">
      {/* Status Counts */}
      <div className="glass rounded-xl p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-primary" />
          Status das indicações
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { key: 'total', label: 'Total', value: Object.values(statusCounts).reduce((a, b) => a + b, 0), color: 'text-foreground', bg: 'bg-secondary/50' },
            { key: 'pending', label: 'Pendentes', value: statusCounts['pending'] ?? 0, color: 'text-amber-600', bg: 'bg-amber-500/10' },
            { key: 'validated', label: 'Validadas', value: statusCounts['validated'] ?? 0, color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
            { key: 'failed', label: 'Falhas', value: statusCounts['failed'] ?? 0, color: 'text-destructive', bg: 'bg-destructive/10' },
            { key: 'expired', label: 'Expiradas', value: statusCounts['expired'] ?? 0, color: 'text-muted-foreground', bg: 'bg-muted/50' },
          ].map((item) => (
            <div key={item.key} className={`rounded-xl p-4 ${item.bg} flex flex-col gap-1`}>
              <span className="text-xs text-muted-foreground">{item.label}</span>
              <span className={`text-2xl font-bold ${item.color}`}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Ambassador Badge Counts */}
      <div className="glass rounded-xl p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Award className="w-4 h-4 text-amber-500" />
          Badges concedidos
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-amber-500/10 p-4 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Embaixador</span>
            <span className="text-2xl font-bold text-amber-600">{badgeCounts['ambassador'] ?? 0}</span>
          </div>
          <div className="rounded-xl bg-yellow-500/10 p-4 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Gold</span>
            <span className="text-2xl font-bold text-yellow-500">{badgeCounts['ambassador_gold'] ?? 0}</span>
          </div>
          <div className="rounded-xl bg-purple-500/10 p-4 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Elite</span>
            <span className="text-2xl font-bold text-purple-500">{badgeCounts['ambassador_elite'] ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Tier Stats */}
      <div className="glass rounded-xl p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-yellow-500" />
          Recompensas por tier
        </h3>
        {tierStats.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma recompensa concedida ainda.</p>
        ) : (
          <div className="space-y-3">
            {tierStats.map((tier) => {
              const meta = TIER_META[tier.rewardType] ?? { label: tier.rewardType, icon: Gift, color: 'text-primary' };
              const MetaIcon = meta.icon;
              return (
                <div key={tier.rewardType} className="flex items-center justify-between gap-4 rounded-xl bg-secondary/30 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <MetaIcon className={`w-5 h-5 ${meta.color}`} />
                    <div>
                      <p className="text-sm font-medium">{meta.label}</p>
                      <p className="text-xs text-muted-foreground">+{tier.totalDays} dias distribuídos</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold">{tier.count}</p>
                    <p className="text-xs text-muted-foreground">recompensas</p>
                  </div>
                </div>
              );
            })}
            <div className="mt-2 flex items-center justify-between rounded-xl border border-dashed border-primary/30 bg-primary/5 px-4 py-3">
              <span className="text-sm font-medium text-primary">Total de dias premium distribuídos</span>
              <span className="text-lg font-bold text-primary">
                {tierStats.reduce((acc, t) => acc + t.totalDays, 0)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Top Inviters Leaderboard */}
      <div className="glass rounded-xl p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Top indicadores (top 20)
        </h3>
        {topInviters.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum indicador registrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pb-2 text-left font-medium">#</th>
                  <th className="pb-2 text-left font-medium">Nome</th>
                  <th className="pb-2 text-right font-medium">Validadas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {topInviters.map((inviter, index) => (
                  <tr key={inviter.userId} className="hover:bg-secondary/30 transition-colors">
                    <td className="py-2.5 pr-3 font-bold text-muted-foreground">{index + 1}</td>
                    <td className="py-2.5 font-medium">{inviter.name}</td>
                    <td className="py-2.5 text-right">
                      <span className="inline-flex items-center justify-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-600">
                        {inviter.validatedCount}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Rewards */}
      <div className="glass rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Gift className="w-4 h-4 text-emerald-500" />
            Recompensas recentes (últimas 30)
          </h3>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Atualizar
          </Button>
        </div>
        {recentRewards.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma recompensa concedida ainda.</p>
        ) : (
          <div className="space-y-2">
            {recentRewards.map((reward) => (
              <div key={reward.id} className="flex items-center justify-between gap-4 rounded-xl bg-secondary/30 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{reward.inviterName}</p>
                  <p className="text-xs text-muted-foreground">{formatDateShort(reward.grantedAt)}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
                    <Gift className="w-3 h-3" />
                    +{reward.premiumDaysGranted}d
                  </span>
                  <p className="mt-0.5 text-xs text-muted-foreground">{TIER_META[reward.rewardType]?.label ?? reward.rewardType}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Reengagement Tab ─────────────────────────────────────────────────────────

type ReengagementUser = {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  createdAt: string | null;
  lastSeenAt: string | null;
  lastEmailSentAt: string | null;
  lastEmailStatus: string | null;
  emailSendCount: number;
  stats: { visits: number; likes: number; messages: number; matches: number };
};

type ReengagementMetrics = {
  totalEmailed: number;
  totalSends: number;
  successfulSends: number;
  failedSends: number;
  returnedCount: number;
  returnRate: number;
  recentBatches: Array<{ batchAt: string; total: number; sent: number; errors: number }>;
  byPeriod?: {
    last7d:  { sent: number; errors: number };
    last30d: { sent: number; errors: number };
    last90d: { sent: number; errors: number };
  };
  byDay?: Array<{ date: string; sent: number; errors: number }>;
};

function formatLastSeen(iso: string | null) {
  if (!iso) return 'Nunca acessou';
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 30) return `${diffDays} dias atrás`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} ${Math.floor(diffDays / 30) === 1 ? 'mês' : 'meses'} atrás`;
  return `${Math.floor(diffDays / 365)} ${Math.floor(diffDays / 365) === 1 ? 'ano' : 'anos'} atrás`;
}

function AdminReengagementTab() {
  const { toast } = useToast();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [withPhoto, setWithPhoto] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; pages: number; users: ReengagementUser[] } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSending, setIsSending] = useState(false);
  const [isSendingAll, setIsSendingAll] = useState(false);
  const [isSendingCampaign, setIsSendingCampaign] = useState(false);
  const [isSendingCampaignSelected, setIsSendingCampaignSelected] = useState(false);
  const [campaignResult, setCampaignResult] = useState<{ sent: number; errors: number; skipped: number; total: number } | null>(null);
  const [sendResult, setSendResult] = useState<{ sent: number; errors: number; skipped: number } | null>(null);

  // Win-back campaign
  const [winbackInactiveDays, setWinbackInactiveDays] = useState(0);
  const [winbackLimit, setWinbackLimit] = useState(200);
  const [winbackResend, setWinbackResend] = useState(false);
  const [winbackDryRun, setWinbackDryRun] = useState(true);
  const [winbackNonSubscribersOnly, setWinbackNonSubscribersOnly] = useState(true);
  const [isSendingWinback, setIsSendingWinback] = useState(false);
  const [winbackResult, setWinbackResult] = useState<{ sent: number; errors: number; skipped: number; total: number; dryRun?: boolean } | null>(null);
  const [metrics, setMetrics] = useState<ReengagementMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState(false);

  const loadMetrics = async () => {
    setMetricsLoading(true);
    setMetricsError(false);
    try {
      const m = await adminService.getReengagementMetrics();
      setMetrics(m);
    } catch {
      setMetricsError(true);
    } finally {
      setMetricsLoading(false);
    }
  };

  // Load metrics on mount
  useEffect(() => { loadMetrics(); }, []);

  const load = async (p = page) => {
    setIsLoading(true);
    setSelectedIds(new Set());
    setSendResult(null);
    try {
      const res = await adminService.getReengagementUsers({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        search: search || undefined,
        withPhoto: withPhoto || undefined,
        emailSent: emailSent || undefined,
        page: p,
      });
      setData(res);
      setPage(p);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.response?.data?.error || err?.message || '';
      toast({ title: 'Erro ao carregar usuários', description: detail || undefined, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAll = () => {
    if (!data) return;
    if (selectedIds.size === data.users.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.users.map((u) => u.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSend = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Enviar e-mail de reengajamento para ${selectedIds.size} usuário(s)?`)) return;
    setIsSending(true);
    setSendResult(null);
    try {
      const result = await adminService.sendReengagementEmails([...selectedIds]);
      setSendResult({ sent: result.sent, errors: result.errors, skipped: result.skipped });
      toast({
        title: `${result.sent} e-mail(s) enviado(s)`,
        description: result.errors > 0 ? `${result.errors} erro(s) encontrado(s).` : 'Envio concluído com sucesso.',
        variant: result.errors > 0 ? 'destructive' : 'default',
      });
      setSelectedIds(new Set());
      loadMetrics(); // refresh return-rate metrics after send
    } catch {
      toast({ title: 'Erro ao enviar e-mails', variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  const handleSendAll = async () => {
    const total = data?.total ?? 0;
    if (!confirm(`Enviar e-mail de reengajamento para TODOS os ${total} usuários do filtro atual?\n\nO envio roda em segundo plano e pode levar vários minutos. Acompanhe pelas Métricas.`)) return;
    setIsSendingAll(true);
    setSendResult(null);
    try {
      const result = await adminService.sendReengagementEmailsAll({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        search: search || undefined,
        withPhoto: withPhoto || undefined,
        emailSent: emailSent || undefined,
      });
      toast({
        title: `📨 Envio iniciado para ${result.total} usuário(s)`,
        description: 'O disparo roda em segundo plano. Acompanhe o progresso nas Métricas (atualize em alguns minutos).',
      });
      // Atualiza as métricas algumas vezes para mostrar o progresso do background
      loadMetrics();
      [30, 60, 120].forEach((s) => window.setTimeout(() => loadMetrics(), s * 1000));
    } catch {
      toast({ title: 'Erro ao iniciar o envio', variant: 'destructive' });
    } finally {
      setIsSendingAll(false);
    }
  };

  const handleSendPromoterCampaignAll = async () => {
    const total = data?.total ?? 0;
    if (!confirm(`Enviar e-mail da campanha de promotores para TODOS os ${total} usuários do filtro atual?\n\nO envio roda em segundo plano e pode levar vários minutos. Acompanhe pelas Métricas.`)) return;
    setIsSendingCampaign(true);
    setCampaignResult(null);
    try {
      const result = await adminService.sendPromoterCampaign({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        search: search || undefined,
        withPhoto: withPhoto || undefined,
        emailSent: emailSent || undefined,
      });
      toast({
        title: `💰 Campanha iniciada para ${result.total} usuário(s)`,
        description: 'O disparo roda em segundo plano. Acompanhe o progresso nas Métricas (atualize em alguns minutos).',
      });
      loadMetrics();
      [30, 60, 120].forEach((s) => window.setTimeout(() => loadMetrics(), s * 1000));
    } catch {
      toast({ title: 'Erro ao iniciar a campanha', variant: 'destructive' });
    } finally {
      setIsSendingCampaign(false);
    }
  };

  const handleSendWinback = async () => {
    const audienceDesc = winbackNonSubscribersOnly ? 'não-assinantes' : 'todos os usuários';
    const inactivityDesc = winbackInactiveDays > 0 ? ` inativos há ≥ ${winbackInactiveDays} dias` : '';
    if (winbackDryRun) {
      if (!confirm(`Pré-visualizar quantos ${audienceDesc}${inactivityDesc} receberiam o e-mail win-back (limite ${winbackLimit})?\n\nNenhum e-mail será enviado.`)) return;
    } else {
      if (!confirm(`Enviar e-mail win-back "30 dias grátis" para ${audienceDesc}${inactivityDesc} (limite: ${winbackLimit})?\n\nIsso irá disparar e-mails reais!`)) return;
    }
    setIsSendingWinback(true);
    setWinbackResult(null);
    try {
      const result = await adminService.sendWinbackCampaign({
        inactiveDays: winbackInactiveDays,
        limit: winbackLimit,
        resend: winbackResend,
        dryRun: winbackDryRun,
        nonSubscribersOnly: winbackNonSubscribersOnly,
      });
      setWinbackResult(result);
      toast({
        title: winbackDryRun
          ? `Pré-visualização: ${result.total} usuário(s) seriam contactados`
          : `🎁 Win-back: ${result.sent} e-mail(s) enviado(s)`,
        description: winbackDryRun
          ? 'Desmarque "Simulação" e clique novamente para enviar de verdade.'
          : result.errors > 0 ? `${result.errors} erro(s).` : 'Campanha enviada com sucesso!',
        variant: !winbackDryRun && result.errors > 0 ? 'destructive' : 'default',
      });
    } catch {
      toast({ title: 'Erro ao enviar campanha win-back', variant: 'destructive' });
    } finally {
      setIsSendingWinback(false);
    }
  };

  const handleSendPromoterCampaignSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Enviar e-mail da campanha de promotores para ${selectedIds.size} usuário(s) selecionado(s)?`)) return;
    setIsSendingCampaignSelected(true);
    setCampaignResult(null);
    try {
      const result = await adminService.sendPromoterCampaign({ userIds: Array.from(selectedIds) });
      const sent = result.sent ?? 0;
      const errors = result.errors ?? 0;
      setCampaignResult({ sent, errors, skipped: result.skipped ?? 0, total: result.total });
      toast({
        title: `💰 ${sent} e-mail(s) da campanha enviado(s)`,
        description: errors > 0 ? `${errors} erro(s).` : 'Campanha enviada com sucesso!',
        variant: errors > 0 ? 'destructive' : 'default',
      });
    } catch {
      toast({ title: 'Erro ao enviar campanha', variant: 'destructive' });
    } finally {
      setIsSendingCampaignSelected(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Info header */}
      <div className="glass rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Mail className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-base mb-1">E-mail de reengajamento</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Filtre usuários pelo último acesso, selecione os que deseja reconquistar e envie um e-mail persuasivo com as notificações pendentes deles. O e-mail inclui link direto para <strong>nosigilo.net</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Metrics panel */}
      <div className="glass rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Métricas de envio</h4>
          <button onClick={loadMetrics} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className={cn("w-3.5 h-3.5", metricsLoading && "animate-spin")} /> Atualizar
          </button>
        </div>
          {metricsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><RefreshCw className="w-4 h-4 animate-spin" /> Carregando métricas...</div>
          ) : metricsError ? (
            <div className="text-sm text-destructive">Erro ao carregar métricas. <button onClick={loadMetrics} className="underline">Tentar novamente</button></div>
          ) : metrics && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <div className="bg-secondary/40 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{metrics.totalEmailed}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Usuários contatados</p>
                </div>
                <div className="bg-secondary/40 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-600">{metrics.returnedCount}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Voltaram ao site</p>
                </div>
                <div className={cn("rounded-lg p-3 text-center", metrics.returnRate >= 30 ? "bg-emerald-500/15" : metrics.returnRate >= 10 ? "bg-amber-500/15" : "bg-secondary/40")}>
                  <p className={cn("text-2xl font-bold", metrics.returnRate >= 30 ? "text-emerald-600" : metrics.returnRate >= 10 ? "text-amber-600" : "text-muted-foreground")}>
                    {metrics.returnRate}%
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Taxa de retorno</p>
                </div>
                <div className="bg-secondary/40 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{metrics.successfulSends}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">E-mails enviados</p>
                  {metrics.failedSends > 0 && <p className="text-[11px] text-destructive mt-0.5">{metrics.failedSends} erro(s)</p>}
                </div>
              </div>
              {/* By period */}
              {metrics.byPeriod && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Envios por período</p>
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      { label: 'Últimos 7 dias',  key: 'last7d'  },
                      { label: 'Últimos 30 dias', key: 'last30d' },
                      { label: 'Últimos 90 dias', key: 'last90d' },
                    ] as const).map(({ label, key }) => {
                      const p = metrics.byPeriod![key];
                      return (
                        <div key={key} className="bg-secondary/40 rounded-lg p-3 text-center">
                          <p className="text-xl font-bold text-emerald-600 tabular-nums">{p.sent}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                          {p.errors > 0 && <p className="text-[11px] text-destructive mt-0.5">{p.errors} erro(s)</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Daily bar chart — last 30 days */}
              {metrics.byDay && metrics.byDay.length > 0 && (() => {
                const maxVal = Math.max(1, ...metrics.byDay!.map(d => d.sent + d.errors));
                return (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Histórico diário (últimos 30 dias)</p>
                    <div className="flex items-end gap-1 h-20">
                      {metrics.byDay!.map((d) => {
                        const totalH = Math.round(((d.sent + d.errors) / maxVal) * 100);
                        const errH   = Math.round((d.errors / Math.max(1, d.sent + d.errors)) * totalH);
                        const sentH  = totalH - errH;
                        return (
                          <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5 group relative" title={`${d.date}: ${d.sent} enviados${d.errors ? `, ${d.errors} erros` : ''}`}>
                            <div className="w-full flex flex-col-reverse" style={{ height: 72 }}>
                              {sentH > 0 && <div className="w-full rounded-sm bg-emerald-500/70" style={{ height: sentH }} />}
                              {errH  > 0 && <div className="w-full rounded-sm bg-destructive/60" style={{ height: errH }} />}
                            </div>
                            <span className="text-[9px] text-muted-foreground hidden group-hover:block absolute -bottom-4 whitespace-nowrap">
                              {new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/70 inline-block" />Enviados</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-destructive/60 inline-block" />Erros</span>
                    </div>
                  </div>
                );
              })()}

              {metrics.recentBatches.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Últimos lotes enviados</p>
                  <div className="space-y-1">
                    {metrics.recentBatches.map((b) => (
                      <div key={b.batchAt} className="flex items-center justify-between text-xs px-3 py-1.5 rounded-md bg-secondary/30">
                        <span className="text-muted-foreground">{new Date(b.batchAt).toLocaleString('pt-BR')}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-emerald-600 font-medium">{b.sent} enviado(s)</span>
                          {b.errors > 0 && <span className="text-destructive font-medium">{b.errors} erro(s)</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {metrics.totalEmailed === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum e-mail enviado ainda. Envie o primeiro lote e volte aqui para ver a taxa de retorno.</p>
              )}
            </>
          )}
      </div>

      {/* Promoter Campaign Email */}
      <div className="glass rounded-xl overflow-hidden border border-emerald-500/30">
        <div className="bg-gradient-to-r from-emerald-600/10 to-teal-600/10 px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">💰</span>
              <h4 className="font-semibold text-base">Ganhe até R$1.980/mês indicando a plataforma — 100% grátis</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              Convida usuários a se tornarem promotores e receberem R$1,98 por cada assinatura confirmada via Pix todo mês. Use os botões <strong>💰 Campanha</strong> na lista abaixo para enviar com os filtros ativos.
            </p>
            {campaignResult && (
              <p className={`mt-2 text-sm font-medium ${campaignResult.errors > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                ✓ {campaignResult.sent} enviado(s) de {campaignResult.total} usuários
                {campaignResult.errors > 0 && ` · ${campaignResult.errors} erro(s)`}
                {campaignResult.skipped > 0 && ` · ${campaignResult.skipped} sem e-mail configurado`}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Win-back Campaign */}
      <div className="glass rounded-xl overflow-hidden border border-pink-500/30">
        <div className="bg-gradient-to-r from-pink-600/10 to-rose-600/10 px-6 py-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🎁</span>
            <h4 className="font-semibold text-base">Campanha Win-back — 30 dias grátis</h4>
          </div>
          <p className="text-sm text-muted-foreground mb-5">
            Envia um e-mail promocional para usuários que entraram uma vez e nunca mais voltaram, oferecendo 30 dias de acesso Premium gratuito via link assinado. Após os 30 dias, o plano custa apenas <strong>R$ 9,90/mês</strong>.
          </p>

          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground font-medium">
                Inativos há (dias) <span className="text-xs opacity-60">— 0 = todos</span>
              </label>
              <input
                type="number"
                min={0}
                max={365}
                value={winbackInactiveDays}
                onChange={(e) => setWinbackInactiveDays(Math.max(0, Number(e.target.value)))}
                className="h-9 w-28 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground font-medium">Limite de envios</label>
              <input
                type="number"
                min={1}
                max={1000}
                value={winbackLimit}
                onChange={(e) => setWinbackLimit(Math.max(1, Number(e.target.value)))}
                className="h-9 w-28 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer h-9 px-1 select-none">
              <input
                type="checkbox"
                checked={winbackNonSubscribersOnly}
                onChange={(e) => setWinbackNonSubscribersOnly(e.target.checked)}
                className="w-4 h-4 accent-primary rounded"
              />
              <span className="text-sm text-muted-foreground whitespace-nowrap">Apenas não-assinantes</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer h-9 px-1 select-none">
              <input
                type="checkbox"
                checked={winbackResend}
                onChange={(e) => setWinbackResend(e.target.checked)}
                className="w-4 h-4 accent-primary rounded"
              />
              <span className="text-sm text-muted-foreground whitespace-nowrap">Reenviar para quem já recebeu</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer h-9 px-1 select-none">
              <input
                type="checkbox"
                checked={winbackDryRun}
                onChange={(e) => setWinbackDryRun(e.target.checked)}
                className="w-4 h-4 accent-amber-500 rounded"
              />
              <span className="text-sm text-amber-600 dark:text-amber-400 font-medium whitespace-nowrap">Simulação (não envia)</span>
            </label>
            <Button
              onClick={handleSendWinback}
              disabled={isSendingWinback}
              className={cn(
                'gap-2 h-9',
                winbackDryRun
                  ? 'bg-amber-500 hover:bg-amber-600 text-white'
                  : 'bg-pink-600 hover:bg-pink-700 text-white'
              )}
            >
              {isSendingWinback
                ? <RefreshCw className="w-4 h-4 animate-spin" />
                : winbackDryRun ? <Search className="w-4 h-4" /> : <Send className="w-4 h-4" />
              }
              {isSendingWinback
                ? (winbackDryRun ? 'Calculando...' : 'Enviando...')
                : (winbackDryRun ? 'Simular' : 'Enviar Win-back')
              }
            </Button>
          </div>

          {winbackResult && (
            <div className={cn(
              'mt-4 flex flex-wrap items-center gap-4 rounded-lg px-4 py-3 text-sm',
              winbackResult.dryRun
                ? 'bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400'
                : winbackResult.errors > 0
                  ? 'bg-destructive/10 border border-destructive/30 text-destructive'
                  : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
            )}>
              {winbackResult.dryRun ? (
                <>
                  <span className="font-semibold">{winbackResult.total}</span> usuário(s) seriam contactados
                  {winbackResult.skipped > 0 && <>, <span className="font-semibold">{winbackResult.skipped}</span> já receberam (seriam pulados)</>}
                  <span className="text-xs opacity-70">— Desmarque "Simulação" e clique "Enviar Win-back" para disparar de verdade.</span>
                </>
              ) : (
                <>
                  <span>🎁 <strong>{winbackResult.sent}</strong> e-mail(s) enviado(s)</span>
                  {winbackResult.errors > 0 && <span><strong>{winbackResult.errors}</strong> erro(s)</span>}
                  {winbackResult.skipped > 0 && <span><strong>{winbackResult.skipped}</strong> pulado(s)</span>}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="glass rounded-xl p-6">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Filtros</h4>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
            <label className="text-xs text-muted-foreground font-medium">E-mail ou nome</label>
            <input
              type="text"
              placeholder="Buscar por e-mail ou nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load(1)}
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground font-medium">Último acesso de</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground font-medium">Até</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer h-9 px-1 select-none">
            <input
              type="checkbox"
              checked={withPhoto}
              onChange={(e) => setWithPhoto(e.target.checked)}
              className="w-4 h-4 accent-primary rounded"
            />
            <span className="text-sm text-muted-foreground whitespace-nowrap">Somente com foto</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer h-9 px-1 select-none">
            <input
              type="checkbox"
              checked={emailSent}
              onChange={(e) => setEmailSent(e.target.checked)}
              className="w-4 h-4 accent-primary rounded"
            />
            <span className="text-sm text-muted-foreground whitespace-nowrap">Já recebeu e-mail</span>
          </label>
          <Button onClick={() => load(1)} disabled={isLoading} className="h-9">
            {isLoading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
            Buscar
          </Button>
          {(dateFrom || dateTo || search || withPhoto || emailSent) && (
            <Button variant="ghost" className="h-9 text-muted-foreground" onClick={() => { setDateFrom(''); setDateTo(''); setSearch(''); setWithPhoto(false); setEmailSent(false); }}>
              Limpar filtros
            </Button>
          )}
        </div>
      </div>

      {/* Result */}
      {data && (
        <div className="glass rounded-xl overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-border/50">
            <div className="flex items-center gap-3">
              <button onClick={toggleAll} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                {selectedIds.size === data.users.length && data.users.length > 0
                  ? <CheckSquare className="w-4 h-4 text-primary" />
                  : <Square className="w-4 h-4" />
                }
                {selectedIds.size > 0 ? `${selectedIds.size} selecionado(s)` : 'Selecionar todos'}
              </button>
              <span className="text-xs text-muted-foreground">| {data.total} usuário(s) encontrado(s)</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <Button
                onClick={handleSend}
                disabled={selectedIds.size === 0 || isSending || isSendingAll || isSendingCampaign || isSendingCampaignSelected}
                size="sm"
                variant="outline"
                className="gap-2"
              >
                {isSending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {isSending ? 'Enviando...' : `Enviar selecionados (${selectedIds.size})`}
              </Button>
              <Button
                onClick={handleSendAll}
                disabled={!data || data.total === 0 || isSending || isSendingAll || isSendingCampaign || isSendingCampaignSelected}
                size="sm"
                className="gap-2 bg-primary"
              >
                {isSendingAll ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {isSendingAll ? 'Enviando para todos...' : `Enviar para todos (${data?.total ?? 0})`}
              </Button>
              <Button
                onClick={handleSendPromoterCampaignSelected}
                disabled={selectedIds.size === 0 || isSending || isSendingAll || isSendingCampaign || isSendingCampaignSelected}
                size="sm"
                variant="outline"
                className="gap-2 border-emerald-500/50 text-emerald-600 hover:bg-emerald-500/10"
              >
                {isSendingCampaignSelected ? <RefreshCw className="w-4 h-4 animate-spin" /> : <span>💰</span>}
                {isSendingCampaignSelected ? 'Enviando...' : `Campanha selecionados (${selectedIds.size})`}
              </Button>
              <Button
                onClick={handleSendPromoterCampaignAll}
                disabled={!data || data.total === 0 || isSending || isSendingAll || isSendingCampaign || isSendingCampaignSelected}
                size="sm"
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isSendingCampaign ? <RefreshCw className="w-4 h-4 animate-spin" /> : <span>💰</span>}
                {isSendingCampaign ? 'Enviando campanha...' : `Campanha todos (${data?.total ?? 0})`}
              </Button>
            </div>
          </div>

          {/* Send result banner */}
          {sendResult && (
            <div className={`flex items-center gap-3 px-6 py-3 text-sm border-b ${sendResult.errors > 0 ? 'bg-destructive/10 border-destructive/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
              {sendResult.errors > 0
                ? <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                : <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              }
              <span>
                <strong>{sendResult.sent}</strong> enviado(s)
                {sendResult.errors > 0 && <>, <strong>{sendResult.errors}</strong> erro(s)</>}
                {sendResult.skipped > 0 && <>, <strong>{sendResult.skipped}</strong> pulado(s) (sem config. de e-mail)</>}
              </span>
            </div>
          )}

          {/* User list */}
          {isLoading ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-3" />
              Carregando...
            </div>
          ) : data.users.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
              Nenhum usuário encontrado com esses filtros.
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {data.users.map((user) => (
                <div
                  key={user.id}
                  onClick={() => toggleOne(user.id)}
                  className={cn(
                    'flex items-center gap-4 px-6 py-3.5 cursor-pointer hover:bg-secondary/30 transition-colors',
                    selectedIds.has(user.id) && 'bg-primary/5'
                  )}
                >
                  {/* Checkbox */}
                  <div className="shrink-0">
                    {selectedIds.has(user.id)
                      ? <CheckSquare className="w-5 h-5 text-primary" />
                      : <Square className="w-5 h-5 text-muted-foreground" />
                    }
                  </div>

                  {/* Avatar */}
                  <Avatar className="w-9 h-9 shrink-0">
                    <AvatarImage src={user.avatar ?? undefined} />
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {user.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{user.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>

                  {/* Last seen */}
                  <div className="text-right shrink-0 hidden sm:block">
                    <p className="text-xs font-medium">{formatLastSeen(user.lastSeenAt)}</p>
                    <p className="text-[11px] text-muted-foreground">último acesso</p>
                  </div>

                  {/* Email status */}
                  {user.lastEmailSentAt ? (
                    <div className="text-right shrink-0 hidden md:block">
                      <span className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                        user.lastEmailStatus === 'sent'
                          ? 'bg-emerald-500/10 text-emerald-700'
                          : 'bg-destructive/10 text-destructive'
                      )}>
                        {user.lastEmailStatus === 'sent' ? '✓' : '✕'} {user.lastEmailStatus === 'sent' ? 'Enviado' : 'Falhou'}
                      </span>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {formatLastSeen(user.lastEmailSentAt)}
                        {user.emailSendCount > 1 && ` · ${user.emailSendCount}x`}
                      </p>
                    </div>
                  ) : (
                    <div className="shrink-0 hidden md:block w-16" />
                  )}

                  {/* Notification stats */}
                  <div className="flex items-center gap-2 shrink-0">
                    {user.stats.visits > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-600">
                        👁 {user.stats.visits}
                      </span>
                    )}
                    {user.stats.likes > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-pink-500/10 px-2 py-0.5 text-[11px] font-medium text-pink-600">
                        💜 {user.stats.likes}
                      </span>
                    )}
                    {user.stats.messages > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                        💬 {user.stats.messages}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {data.pages > 1 && (
            <div className="flex items-center justify-center gap-2 px-6 py-4 border-t border-border/50">
              <Button variant="outline" size="sm" disabled={page <= 1 || isLoading} onClick={() => load(page - 1)}>
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {page} de {data.pages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= data.pages || isLoading} onClick={() => load(page + 1)}>
                Próxima
              </Button>
            </div>
          )}
        </div>
      )}

      {!data && !isLoading && (
        <div className="glass rounded-xl p-12 text-center text-muted-foreground text-sm">
          <Mail className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p>Use os filtros acima e clique em <strong>Buscar</strong> para listar usuários inativos.</p>
        </div>
      )}
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

// ─── Promotores Tab ────────────────────────────────────────────────────────

type PromoterRow = {
  userId: string; fullName: string; pixKey: string; whatsapp: string | null; contactEmail: string | null; status: string;
  activatedAt: string; userName: string; userEmail: string; userAvatar: string | null;
  totalSubscriptions: number; pendingCents: number; approvedCents: number; paidCents: number;
};

type CommissionRow = {
  id: string; promoterUserId: string; promoterName: string; promoterPix: string;
  subscriberUserId: string; subscriptionAmount: number; commissionAmount: number;
  status: string; period: string | null; paidAt: string | null; createdAt: string;
};

const COMM_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:   { label: 'Pendente',   color: 'bg-yellow-500/10 text-yellow-600 border-yellow-400/30' },
  approved:  { label: 'Aprovada',   color: 'bg-blue-500/10 text-blue-600 border-blue-400/30' },
  paid:      { label: 'Paga ✓',     color: 'bg-emerald-500/10 text-emerald-600 border-emerald-400/30' },
  cancelled: { label: 'Cancelada',  color: 'bg-red-500/10 text-red-500 border-red-400/30' },
};

function formatBRLAdmin(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateAdmin(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Calculate the due date for a period (e.g. '2025-06' → 10th of July 2025) */
function calcDueDate(period: string | null): string {
  if (!period) return '—';
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return '—';
  const due = new Date(y, m, 10); // month is 0-indexed in JS, so m = next month's 1st = index m
  return due.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function AdminPromotersTab() {
  const { toast } = useToast();
  const [promoters, setPromoters] = useState<PromoterRow[]>([]);
  const [commissions, setCommissions] = useState<CommissionRow[]>([]);
  const [commFilter, setCommFilter] = useState<string>('pending');
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  // Monthly summary email
  const currentPeriod = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
  const [summaryPeriod, setSummaryPeriod] = useState(currentPeriod);
  const [isSendingSummary, setIsSendingSummary] = useState(false);
  const [summaryResult, setSummaryResult] = useState<{ sent: number; errors: number; skipped: number; total: number; dueDate: string } | null>(null);

  // Incentive email (para promotores já ativos, reforça o engajamento)
  const [isSendingIncentive, setIsSendingIncentive] = useState(false);
  const [incentiveResult, setIncentiveResult] = useState<{ sent: number; errors: number; skipped: number; total: number } | null>(null);

  // Support chat state
  // Alvo mínimo do chat — atende tanto PromoterRow quanto um usuário comum de suporte.
  type ChatTarget = { userId: string; fullName: string; pixKey: string; userEmail: string };
  const [selectedChat, setSelectedChat] = useState<ChatTarget | null>(null);
  const [chatMessages, setChatMessages] = useState<SupportMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [supportChats, setSupportChats] = useState<Awaited<ReturnType<typeof adminPromoterService.listSupportChats>>['chats']>([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const loadAll = async () => {
    setIsLoading(true);
    try {
      const [pRes, cRes, chatRes] = await Promise.all([
        adminPromoterService.listPromoters(),
        adminPromoterService.listCommissions(commFilter !== 'all' ? commFilter : undefined),
        adminPromoterService.listSupportChats().catch(() => ({ chats: [] })),
      ]);
      setPromoters(pRes.promoters ?? []);
      setCommissions(cRes.commissions ?? []);
      const map: Record<string, number> = {};
      for (const c of (chatRes.chats ?? [])) map[c.userId] = c.unreadCount;
      setUnreadMap(map);
      setSupportChats(chatRes.chats ?? []);
    } catch { /* silent */ }
    finally { setIsLoading(false); }
  };

  useEffect(() => { void loadAll(); }, [commFilter]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const openChat = async (target: ChatTarget) => {
    setSelectedChat(target);
    setChatMessages([]);
    try {
      const data = await adminPromoterService.getSupportMessages(target.userId);
      setChatMessages(data.messages);
      setUnreadMap((prev) => ({ ...prev, [target.userId]: 0 }));
    } catch {}
  };

  const handleSendChat = async () => {
    if (!selectedChat || !chatInput.trim()) return;
    setIsSendingChat(true);
    try {
      await adminPromoterService.sendSupportMessage(selectedChat.userId, chatInput.trim());
      setChatInput('');
      const data = await adminPromoterService.getSupportMessages(selectedChat.userId);
      setChatMessages(data.messages);
    } catch {
      toast({ title: 'Erro ao enviar', description: 'Tente novamente.', variant: 'destructive' });
    } finally { setIsSendingChat(false); }
  };

  const handleCommStatus = async (id: string, status: 'pending' | 'approved' | 'paid' | 'cancelled') => {
    try {
      await adminPromoterService.updateCommissionStatus(id, status);
      toast({ title: 'Status atualizado' });
      void loadAll();
    } catch { toast({ title: 'Erro', variant: 'destructive' }); }
  };

  const handleBatchApprove = async (period: string) => {
    setIsBusy(true);
    try {
      await adminPromoterService.batchApprove(period);
      toast({ title: `Comissões de ${period} aprovadas` });
      void loadAll();
    } catch { toast({ title: 'Erro', variant: 'destructive' }); }
    finally { setIsBusy(false); }
  };

  const handleBatchPay = async (period?: string, promoterUserId?: string) => {
    setIsBusy(true);
    try {
      const r = await adminPromoterService.batchPay({ period, promoterUserId });
      toast({
        title: `${r.paid} comissão(ões) marcada(s) como paga(s)`,
        description: r.receiptsSent > 0 ? `🧾 ${r.receiptsSent} recibo(s) enviado(s) por e-mail.` : 'Nenhum recibo enviado (promotor sem e-mail).',
      });
      void loadAll();
    } catch { toast({ title: 'Erro', variant: 'destructive' }); }
    finally { setIsBusy(false); }
  };

  // Paga TODAS as comissões aprovadas de um promotor num período (com recibo por e-mail).
  const handlePayPromoter = async (period: string, promoterUserId: string, promoterName: string, totalLabel: string) => {
    if (!confirm(`Confirmar pagamento de ${totalLabel} para ${promoterName} (${period})?\n\nTodas as parcelas aprovadas ficarão como pagas e um recibo será enviado por e-mail ao promotor.`)) return;
    await handleBatchPay(period, promoterUserId);
  };

  const handleSendMonthlySummary = async () => {
    if (!summaryPeriod.match(/^\d{4}-\d{2}$/)) { toast({ title: 'Período inválido (use AAAA-MM)', variant: 'destructive' }); return; }
    if (!confirm(`Enviar resumo mensal de comissões de ${summaryPeriod} para todos os promotores ativos?`)) return;
    setIsSendingSummary(true);
    setSummaryResult(null);
    try {
      const result = await adminPromoterService.sendMonthlySummary(summaryPeriod);
      setSummaryResult(result);
      toast({ title: `📧 ${result.sent} e-mail(s) enviado(s) para promotores`, description: result.errors > 0 ? `${result.errors} erro(s).` : 'Resumo enviado com sucesso!' });
    } catch { toast({ title: 'Erro ao enviar resumo', variant: 'destructive' }); }
    finally { setIsSendingSummary(false); }
  };

  const handleSendIncentive = async () => {
    if (!confirm('Enviar e-mail de incentivo (indicar a plataforma) para todos os promotores ativos?')) return;
    setIsSendingIncentive(true);
    setIncentiveResult(null);
    try {
      const result = await adminPromoterService.sendIncentive();
      setIncentiveResult(result);
      toast({ title: `📧 ${result.sent} e-mail(s) de incentivo enviado(s)`, description: result.errors > 0 ? `${result.errors} erro(s).` : 'Incentivo enviado com sucesso!' });
    } catch { toast({ title: 'Erro ao enviar incentivo', variant: 'destructive' }); }
    finally { setIsSendingIncentive(false); }
  };

  // Group commissions by period
  const byPeriod = useMemo(() => {
    const map = new Map<string, CommissionRow[]>();
    for (const c of commissions) {
      const key = c.period ?? 'sem-período';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [commissions]);

  const totalPending = promoters.reduce((s, p) => s + p.pendingCents, 0);
  const totalApproved = promoters.reduce((s, p) => s + p.approvedCents, 0);
  const totalPaid = promoters.reduce((s, p) => s + p.paidCents, 0);

  if (isLoading) return <div className="py-20 text-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;

  // ── Support chat view ──────────────────────────────────────────────────────
  if (selectedChat) {
    return (
      <div className="glass rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedChat(null)} className="rounded-full p-1.5 hover:bg-secondary">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <p className="font-semibold">{selectedChat.fullName}</p>
            <p className="text-xs text-muted-foreground">
              {selectedChat.userEmail}{selectedChat.pixKey ? ` · Pix: ${selectedChat.pixKey}` : ''}
            </p>
          </div>
        </div>

        {/* Messages */}
        <div className="space-y-2 h-96 overflow-y-auto border rounded-xl p-3 bg-secondary/20 pr-2">
          {chatMessages.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Nenhuma mensagem ainda.</p>}
          {chatMessages.map((m) => (
            <div key={m.id} className={`flex ${m.senderType === 'admin' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${m.senderType === 'admin' ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-card border rounded-bl-sm'}`}>
                {m.senderType === 'promoter' && <p className="text-[10px] font-semibold mb-0.5 text-muted-foreground">{selectedChat.fullName}</p>}
                <p>{m.message}</p>
                <p className={`text-[10px] mt-0.5 ${m.senderType === 'admin' ? 'text-primary-foreground/70 text-right' : 'text-muted-foreground'}`}>{formatDateAdmin(m.createdAt)}</p>
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            placeholder="Responder..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSendChat(); }}}
          />
          <button
            onClick={handleSendChat}
            disabled={!chatInput.trim() || isSendingChat}
            className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
          >
            {isSendingChat ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Enviar
          </button>
        </div>
      </div>
    );
  }

  // ── Main view ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Promotores ativos', value: promoters.length, color: 'text-blue-500', icon: BadgeDollarSign },
          { label: 'Pendente de pagto', value: formatBRLAdmin(totalPending), color: 'text-yellow-600', icon: Clock },
          { label: 'Aprovado', value: formatBRLAdmin(totalApproved), color: 'text-blue-600', icon: CheckCircle2 },
          { label: 'Total já pago', value: formatBRLAdmin(totalPaid), color: 'text-emerald-600', icon: Wallet },
        ].map((item) => (
          <Card key={item.label} className="p-4 glass space-y-1">
            <item.icon className={`w-4 h-4 ${item.color}`} />
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="text-lg font-bold">{item.value}</p>
          </Card>
        ))}
      </div>

      {/* Monthly Summary Email */}
      <div className="glass rounded-xl overflow-hidden border border-blue-500/30">
        <div className="bg-gradient-to-r from-blue-600/10 to-indigo-600/10 px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-blue-500" />
              <h4 className="font-semibold">Resumo mensal de comissões</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              Envia para cada promotor ativo um e-mail com o total de assinaturas, valor de comissão e data de pagamento prevista para o período selecionado.
            </p>
            {summaryResult && (
              <p className={`text-sm font-medium ${summaryResult.errors > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                ✓ {summaryResult.sent} enviado(s) · vencimento {summaryResult.dueDate}
                {summaryResult.errors > 0 && ` · ${summaryResult.errors} erro(s)`}
                {summaryResult.skipped > 0 && ` · ${summaryResult.skipped} sem e-mail`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input
              type="month"
              value={summaryPeriod}
              onChange={(e) => setSummaryPeriod(e.target.value)}
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <Button
              onClick={handleSendMonthlySummary}
              disabled={isSendingSummary || promoters.length === 0}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
              size="sm"
            >
              {isSendingSummary ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {isSendingSummary ? 'Enviando...' : `Enviar para ${promoters.length} promotor(es)`}
            </Button>
          </div>
        </div>
      </div>

      {/* Incentive Email */}
      <div className="glass rounded-xl overflow-hidden border border-emerald-500/30">
        <div className="bg-gradient-to-r from-emerald-600/10 to-green-600/10 px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <BadgeDollarSign className="w-4 h-4 text-emerald-500" />
              <h4 className="font-semibold">Incentivo para indicar a plataforma</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              Envia um e-mail motivacional para todos os promotores ativos, com as indicações e o valor já ganho por cada um, incentivando a continuar divulgando o link.
            </p>
            {incentiveResult && (
              <p className={`text-sm font-medium ${incentiveResult.errors > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                ✓ {incentiveResult.sent} enviado(s)
                {incentiveResult.errors > 0 && ` · ${incentiveResult.errors} erro(s)`}
                {incentiveResult.skipped > 0 && ` · ${incentiveResult.skipped} sem e-mail`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={handleSendIncentive}
              disabled={isSendingIncentive || promoters.length === 0}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              size="sm"
            >
              {isSendingIncentive ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {isSendingIncentive ? 'Enviando...' : `Enviar para ${promoters.length} promotor(es)`}
            </Button>
          </div>
        </div>
      </div>

      {/* Suporte — conversas de usuários comuns (não-promotores). Promotores já
          têm acesso ao chat pela própria lista abaixo. */}
      {(() => {
        const userChats = supportChats.filter((c) => !c.isPromoter);
        if (userChats.length === 0) return null;
        return (
          <div className="glass rounded-xl p-5 space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Suporte — Usuários ({userChats.length})
            </h3>
            <div className="space-y-2">
              {userChats.map((c) => (
                <button
                  key={c.userId}
                  onClick={() => void openChat({ userId: c.userId, fullName: c.fullName, pixKey: c.pixKey, userEmail: c.userEmail })}
                  className="w-full flex items-center justify-between gap-3 rounded-xl border bg-secondary/20 p-3 text-left hover:bg-secondary/40 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{c.fullName}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.userEmail}</p>
                    {c.lastMessage && <p className="text-xs text-muted-foreground truncate">{c.lastMessage}</p>}
                  </div>
                  {(unreadMap[c.userId] ?? c.unreadCount) > 0 && (
                    <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                      {unreadMap[c.userId] ?? c.unreadCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Promoters list */}
      <div className="glass rounded-xl p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          Promotores ({promoters.length})
        </h3>
        {promoters.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhum promotor ainda.</p>}
        <div className="space-y-3">
          {promoters.map((p) => (
            <div key={p.userId} className="rounded-xl border bg-secondary/20 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold truncate">{p.fullName}</p>
                  <span className={`text-xs rounded-full px-2 py-0.5 border ${p.status === 'active' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-400/30' : 'bg-red-500/10 text-red-500 border-red-400/30'}`}>
                    {p.status === 'active' ? 'Ativo' : 'Suspenso'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{p.userEmail}</p>
                <p className="text-xs text-muted-foreground">Pix: <strong>{p.pixKey}</strong></p>
                {p.whatsapp && <p className="text-xs text-muted-foreground">WhatsApp: <strong>{p.whatsapp}</strong></p>}
                <p className="text-xs text-muted-foreground">
                  📧 {p.contactEmail ?? p.userEmail}
                  {p.contactEmail && p.contactEmail !== p.userEmail && <span className="ml-1 text-[10px] text-muted-foreground/70">(notif.)</span>}
                </p>
                <p className="text-xs text-muted-foreground">Ativo desde {formatDateAdmin(p.activatedAt)}</p>
              </div>
              <div className="flex gap-4 text-center">
                <div>
                  <p className="text-sm font-bold">{p.totalSubscriptions}</p>
                  <p className="text-[10px] text-muted-foreground">assinaturas</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-yellow-600">{formatBRLAdmin(p.pendingCents)}</p>
                  <p className="text-[10px] text-muted-foreground">pendente</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-emerald-600">{formatBRLAdmin(p.paidCents)}</p>
                  <p className="text-[10px] text-muted-foreground">pago</p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                {p.pendingCents > 0 && (
                  <button
                    onClick={() => handleBatchPay(undefined, p.userId)}
                    disabled={isBusy}
                    className="text-xs rounded-lg bg-emerald-500 text-white px-3 py-1.5 hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-1"
                  >
                    <Check className="w-3 h-3" /> Pagar tudo
                  </button>
                )}
                <button
                  onClick={() => openChat(p)}
                  className="relative text-xs rounded-lg border px-3 py-1.5 hover:bg-secondary flex items-center gap-1"
                >
                  <MessageCircle className="w-3 h-3" /> Chat
                  {(unreadMap[p.userId] ?? 0) > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                      {unreadMap[p.userId]}
                    </span>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Commissions by period */}
      <div className="glass rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="font-semibold flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-500" />
            Comissões por período
          </h3>
          <div className="flex gap-2 flex-wrap">
            {['pending', 'approved', 'paid', 'cancelled', 'all'].map((s) => (
              <button
                key={s}
                onClick={() => setCommFilter(s)}
                className={`text-xs rounded-full px-3 py-1 border font-medium transition-colors ${commFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-secondary'}`}
              >
                {{ pending: 'Pendentes', approved: 'Aprovadas', paid: 'Pagas', cancelled: 'Canceladas', all: 'Todas' }[s]}
              </button>
            ))}
          </div>
        </div>

        {byPeriod.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhuma comissão neste filtro.</p>}

        {byPeriod.map(([period, items]) => {
          const totalCents = items.reduce((s, c) => s + c.commissionAmount, 0);
          const pendingItems = items.filter((c) => c.status === 'pending');
          const approvedItems = items.filter((c) => c.status === 'approved');
          return (
            <div key={period} className="rounded-xl border bg-card">
              {/* Period header */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b bg-secondary/30 rounded-t-xl">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    <Calendar className="w-4 h-4 text-primary" />
                    {period}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Vencimento: <strong>{calcDueDate(period)}</strong>
                  </span>
                  <span className="text-xs font-semibold text-emerald-600">{formatBRLAdmin(totalCents)} total</span>
                </div>
                <div className="flex gap-2">
                  {pendingItems.length > 0 && (
                    <button
                      onClick={() => handleBatchApprove(period)}
                      disabled={isBusy}
                      className="text-xs rounded-lg bg-blue-500 text-white px-3 py-1.5 hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3 h-3" /> Aprovar todas ({pendingItems.length})
                    </button>
                  )}
                  {approvedItems.length > 0 && (
                    <button
                      onClick={() => handleBatchPay(period)}
                      disabled={isBusy}
                      className="text-xs rounded-lg bg-emerald-500 text-white px-3 py-1.5 hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-1"
                    >
                      <Check className="w-3 h-3" /> Pagar aprovadas ({approvedItems.length})
                    </button>
                  )}
                </div>
              </div>

              {/* Agrupado por promotor: Pix + total + pagar tudo dele (com recibo) */}
              <div className="divide-y">
                {(() => {
                  const byPromoter = new Map<string, CommissionRow[]>();
                  for (const c of items) {
                    if (!byPromoter.has(c.promoterUserId)) byPromoter.set(c.promoterUserId, []);
                    byPromoter.get(c.promoterUserId)!.push(c);
                  }
                  const groups = Array.from(byPromoter.entries())
                    .map(([uid, list]) => {
                      const approved = list.filter((c) => c.status === 'approved');
                      const approvedCents = approved.reduce((s, c) => s + c.commissionAmount, 0);
                      const totalCents = list.reduce((s, c) => s + c.commissionAmount, 0);
                      const paidCount = list.filter((c) => c.status === 'paid').length;
                      const pendingCount = list.filter((c) => c.status === 'pending').length;
                      return { uid, name: list[0].promoterName, pix: list[0].promoterPix, list, approved, approvedCents, totalCents, paidCount, pendingCount };
                    })
                    .sort((a, b) => b.approvedCents - a.approvedCents || b.totalCents - a.totalCents);

                  return groups.map((g) => (
                    <div key={g.uid}>
                      {/* Cabeçalho do promotor */}
                      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-secondary/20">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{g.name}</p>
                          <p className="text-xs text-muted-foreground">Pix: {g.pix}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {g.list.length} parcela(s) · {g.approved.length} aprovada(s) · {g.paidCount} paga(s) · {g.pendingCount} pendente(s)
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-[11px] text-muted-foreground leading-tight">Aprovado a pagar</p>
                            <p className="font-bold text-emerald-600 leading-tight">{formatBRLAdmin(g.approvedCents)}</p>
                            <p className="text-[11px] text-muted-foreground leading-tight">Total período: {formatBRLAdmin(g.totalCents)}</p>
                          </div>
                          {g.approvedCents > 0 && (
                            <button
                              onClick={() => handlePayPromoter(period, g.uid, g.name, formatBRLAdmin(g.approvedCents))}
                              disabled={isBusy}
                              className="text-xs rounded-lg bg-emerald-500 text-white px-3 py-2 hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-1 shrink-0 font-medium"
                            >
                              <Check className="w-3.5 h-3.5" /> Pagar {formatBRLAdmin(g.approvedCents)} ({g.approved.length})
                            </button>
                          )}
                        </div>
                      </div>
                      {/* Parcelas individuais do promotor */}
                      <div className="divide-y bg-background/40">
                        {g.list.map((c) => {
                          const statusMeta = COMM_STATUS_LABELS[c.status] ?? COMM_STATUS_LABELS.pending;
                          return (
                            <div key={c.id} className="flex flex-wrap items-center gap-3 px-6 py-2 text-sm">
                              <div className="text-right">
                                <p className="font-semibold text-emerald-600">{formatBRLAdmin(c.commissionAmount)}</p>
                                <p className="text-[11px] text-muted-foreground">{formatBRLAdmin(c.subscriptionAmount)} assinatura</p>
                              </div>
                              <span className={`text-xs rounded-full px-2.5 py-0.5 border font-medium ${statusMeta.color}`}>
                                {statusMeta.label}
                              </span>
                              {c.paidAt && <span className="text-xs text-muted-foreground">Pago em {formatDateAdmin(c.paidAt)}</span>}
                              <div className="ml-auto flex gap-1">
                                {c.status === 'pending' && (
                                  <>
                                    <button onClick={() => handleCommStatus(c.id, 'approved')} className="text-[11px] rounded-lg bg-blue-500/10 text-blue-600 border border-blue-400/30 px-2 py-1 hover:bg-blue-500/20">Aprovar</button>
                                    <button onClick={() => handleCommStatus(c.id, 'cancelled')} className="text-[11px] rounded-lg bg-red-500/10 text-red-500 border border-red-400/30 px-2 py-1 hover:bg-red-500/20">Cancelar</button>
                                  </>
                                )}
                                {c.status === 'approved' && (
                                  <button onClick={() => handleCommStatus(c.id, 'paid')} className="text-[11px] rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-400/30 px-2 py-1 hover:bg-emerald-500/20">
                                    Marcar paga
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

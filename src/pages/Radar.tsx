import React, { useEffect, useMemo, useState } from 'react';
import {
  MapPin,
  Send,
  Users,
  Sparkles,
  Navigation,
  Check,
  Radio,
  Crown,
  MessageCircle,
  Eye,
  Clock3,
  Flame,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { getUserProfileHref } from '@/utils/userProfileNavigation';
import { CitySearch } from '@/components/CitySearch';
import { locationService, radarService } from '@/services/api';
import { hasPremiumAccess } from '@/utils/premium';
import { useProfileGate } from '@/contexts/ProfileGateContext';
import { formatProfileIdentityLine } from '@/utils/profileIdentity';
import ReferralPaywallModal from '@/components/ReferralPaywallModal';
import { resolveServerUrl } from '@/utils/serverUrl';
import { useActivityTracker } from '@/contexts/ActivityTrackerContext';

type RadarDelivery = {
  deliveredAt: string;
  viewedAt?: string | null;
  contactedAt?: string | null;
  viewer: {
    id: string;
    name: string;
    avatar?: string | null;
    gender?: string | null;
    city?: string | null;
    state?: string | null;
  };
};

type RadarBroadcast = {
  id: string;
  city: string;
  state: string;
  message: string;
  targetGender: string[];
  radius: number;
  durationHours: number;
  createdAt: string;
  expiresAt: string;
  isActive: boolean;
  isAnonymous?: boolean;
  showOnlyOnline?: boolean;
  deliveriesCount: number;
  viewsCount: number;
  responsesCount: number;
  deliveries: RadarDelivery[];
};

type IncomingRadar = {
  id: string;
  city: string;
  state: string;
  message: string;
  targetGender: string[];
  radius: number;
  durationHours: number;
  createdAt: string;
  expiresAt: string;
  distanceKm?: number | null;
  zoneLabel?: string | null;
  isAnonymous?: boolean;
  showOnlyOnline?: boolean;
  sender: {
    id: string;
    name: string;
    avatar?: string | null;
    gender?: string | null;
    city?: string | null;
    state?: string | null;
  };
};

type RadarHeatmap = {
  totalActive: number;
  hottestZone: string | null;
  zones: Array<{ id: string; label: string; count: number }>;
};

type RadarUsage = {
  dailyLimit: number;
  dailyUsed: number;
  dailyRemaining: number;
  weeklyLimit: number;
  weeklyUsed: number;
  weeklyRemaining: number;
};

const MESSAGE_TEMPLATES = [
  'Casal discreto na cidade hoje, aberto a conhecer pessoas alinhadas com respeito e quimica.',
  'Mulher solteira de passagem, procurando conexoes adultas seguras e boa conversa.',
  'Homem solteiro chegando neste fim de semana, aberto a conhecer casais e singles com discricao.',
  'Na cidade por poucas horas e buscando companhia adulta, consensual e sem pressao.',
] as const;

function formatElapsed(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return 'agora';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} d`;
}

function formatRemaining(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) return 'Encerrado';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} min restantes`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h restantes`;
  const days = Math.floor(hours / 24);
  return `${days} d restantes`;
}

function audienceLabel(targets: string[]) {
  const labels: Record<string, string> = {
    all: 'Todos',
    female: 'Mulheres solteiras',
    male: 'Homens solteiros',
    couple: 'Casais',
  };
  return targets.map((item) => labels[item] || item).join(', ');
}

export default function Radar() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { registerActivity } = useActivityTracker();
  const navigate = useNavigate();
  const radarAllowed = hasPremiumAccess(user);
  const { requireFields } = useProfileGate();

  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [cityInput, setCityInput] = useState('');
  const [message, setMessage] = useState('');
  const [targetGender, setTargetGender] = useState<string[]>(['all']);
  const [radius, setRadius] = useState([25]);
  const [duration, setDuration] = useState('1');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [showOnlyOnline, setShowOnlyOnline] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [canCreate, setCanCreate] = useState(radarAllowed);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [myBroadcasts, setMyBroadcasts] = useState<RadarBroadcast[]>([]);
  const [incoming, setIncoming] = useState<IncomingRadar[]>([]);
  const [heatmap, setHeatmap] = useState<RadarHeatmap>({ totalActive: 0, hottestZone: null, zones: [] });
  const [usage, setUsage] = useState<RadarUsage>({
    dailyLimit: 1,
    dailyUsed: 0,
    dailyRemaining: 1,
    weeklyLimit: 3,
    weeklyUsed: 0,
    weeklyRemaining: 3,
  });

  const loadRadar = async () => {
    setIsLoading(true);
    try {
      const data = await radarService.getOverview();
      setCanCreate(!!data?.canCreate);
      setMyBroadcasts(Array.isArray(data?.myBroadcasts) ? data.myBroadcasts : []);
      setIncoming(Array.isArray(data?.incoming) ? data.incoming : []);
      setHeatmap({
        totalActive: Number(data?.heatmap?.totalActive || 0),
        hottestZone: data?.heatmap?.hottestZone ? String(data.heatmap.hottestZone) : null,
        zones: Array.isArray(data?.heatmap?.zones) ? data.heatmap.zones : [],
      });
      setUsage({
        dailyLimit: Number(data?.usage?.dailyLimit || 1),
        dailyUsed: Number(data?.usage?.dailyUsed || 0),
        dailyRemaining: Number(data?.usage?.dailyRemaining ?? 1),
        weeklyLimit: Number(data?.usage?.weeklyLimit || 3),
        weeklyUsed: Number(data?.usage?.weeklyUsed || 0),
        weeklyRemaining: Number(data?.usage?.weeklyRemaining ?? 3),
      });
    } catch {
      toast({ title: 'Erro ao carregar radar', description: 'Tente novamente.', variant: 'destructive' });
      setMyBroadcasts([]);
      setIncoming([]);
      setHeatmap({ totalActive: 0, hottestZone: null, zones: [] });
      setUsage({
        dailyLimit: 1,
        dailyUsed: 0,
        dailyRemaining: 1,
        weeklyLimit: 3,
        weeklyUsed: 0,
        weeklyRemaining: 3,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadRadar();
  }, []);

  const activeBroadcasts = useMemo(() => myBroadcasts.filter((item) => item.isActive), [myBroadcasts]);
  const inactiveBroadcasts = useMemo(() => myBroadcasts.filter((item) => !item.isActive), [myBroadcasts]);
  const limitReached = usage.dailyRemaining <= 0 || usage.weeklyRemaining <= 0;

  const handleUseTemplate = (template: string) => setMessage(template);

  const handleGenderToggle = (gender: string) => {
    if (gender === 'all') {
      setTargetGender(['all']);
      return;
    }
    setTargetGender((prev) => {
      const filtered = prev.filter((item) => item !== 'all');
      if (filtered.includes(gender)) {
        const next = filtered.filter((item) => item !== gender);
        return next.length > 0 ? next : ['all'];
      }
      return [...filtered, gender];
    });
  };

  const handleSendBroadcast = async () => {
    const ok = await requireFields(['photo', 'birthDate', 'city']);
    if (!ok) return;
    if (!radarAllowed || !canCreate) {
      setPaywallOpen(true);
      return;
    }
    if (limitReached) {
      toast({
        title: 'Limite do radar atingido',
        description:
          usage.dailyRemaining <= 0
            ? 'Hoje voce ja usou seu radar. Amanhã o envio volta a liberar.'
            : 'Voce atingiu o limite de 3 radares nesta semana.',
        variant: 'destructive',
      });
      return;
    }
    if (!city || !state || !message.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Escolha cidade, estado e escreva a mensagem do radar.',
        variant: 'destructive',
      });
      return;
    }
    setIsSending(true);
    try {
      await radarService.createBroadcast({
        city,
        state,
        message: message.trim(),
        targetGender,
        radius: radius[0],
        durationHours: Number(duration),
        isAnonymous,
        showOnlyOnline,
      });
      registerActivity('radar');
      toast({
        title: 'Radar ativado',
        description: `Seu aviso ja foi publicado para ${city}, ${state}.`,
      });
      setMessage('');
      setCity('');
      setState('');
      setCityInput('');
      setTargetGender(['all']);
      setRadius([25]);
      setDuration('1');
      setIsAnonymous(false);
      setShowOnlyOnline(false);
      await loadRadar();
    } catch (error: any) {
      const apiError = String(error?.response?.data?.error || '');
      const premiumRequired = apiError === 'premium_required';
      const dailyLimitError = apiError === 'radar_daily_limit';
      const weeklyLimitError = apiError === 'radar_weekly_limit';
      toast({
        title:
          premiumRequired
            ? 'Radar liberado so no trial ativo ou premium'
            : dailyLimitError
              ? 'Voce ja usou o radar hoje'
              : weeklyLimitError
                ? 'Voce atingiu o limite semanal do radar'
                : 'Nao foi possivel ativar o radar',
        description: premiumRequired
          ? 'Seu trial acabou. Escolha um plano para continuar usando o radar.'
          : dailyLimitError
            ? 'O radar libera novamente no proximo dia.'
            : weeklyLimitError
              ? 'O limite atual e de 3 radares por semana.'
              : 'Tente novamente.',
        variant: 'destructive',
      });
      if (premiumRequired) setPaywallOpen(true);
      if (dailyLimitError || weeklyLimitError) await loadRadar();
    } finally {
      setIsSending(false);
    }
  };

  const handleUseDeviceLocation = async () => {
    if (!navigator.geolocation) {
      toast({
        title: 'Geolocalização indisponível',
        description: 'Seu navegador não suporta localização por GPS.',
        variant: 'destructive',
      });
      return;
    }

    setIsLocating(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0,
        });
      });

      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      await locationService.updateLocation(lat, lon);
      const nearest = await locationService.getNearestCity(lat, lon);

      const nextCity = String(nearest?.city?.name || '').trim();
      const nextState = String(nearest?.city?.state || '').trim().toUpperCase();
      if (nextCity && nextState) {
        setCity(nextCity);
        setState(nextState);
        setCityInput(`${nextCity}, ${nextState}`);
      }

      toast({
        title: 'Localização atualizada',
        description: nextCity && nextState
          ? `Radar configurado para ${nextCity}, ${nextState}.`
          : 'Sua localização foi atualizada com sucesso.',
      });
    } catch {
      toast({
        title: 'Não foi possível usar o GPS',
        description: 'Permita o acesso à localização do dispositivo para preencher a cidade.',
        variant: 'destructive',
      });
    } finally {
      setIsLocating(false);
    }
  };

  const handleDeactivateBroadcast = async (id: string) => {
    try {
      await radarService.deactivateBroadcast(id);
      toast({ title: 'Radar desativado', description: 'Ele nao sera mais entregue para novas pessoas.' });
      await loadRadar();
    } catch {
      toast({ title: 'Erro ao desativar radar', description: 'Tente novamente.', variant: 'destructive' });
    }
  };

  const handleContactRadar = async (radarId: string) => {
    try {
      const data = await radarService.contactFromRadar(radarId);
      navigate('/chat', { state: { conversationId: data?.conversationId } });
    } catch {
      toast({ title: 'Nao foi possivel abrir conversa', description: 'Tente novamente.', variant: 'destructive' });
    }
  };

  const totalViews = myBroadcasts.reduce((acc, item) => acc + item.viewsCount, 0);
  const totalResponses = myBroadcasts.reduce((acc, item) => acc + item.responsesCount, 0);
  const totalDeliveries = myBroadcasts.reduce((acc, item) => acc + item.deliveriesCount, 0);
  const hottestZoneCount = useMemo(
    () => heatmap.zones.find((zone) => zone.label === heatmap.hottestZone)?.count ?? 0,
    [heatmap]
  );

  return (
    <div className="container max-w-6xl min-w-0 space-y-4 overflow-x-hidden py-4 pb-24 sm:space-y-6 sm:py-6 md:pb-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-hero p-5 text-center sm:p-8">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2">
            <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-ping" style={{ animationDuration: '3s' }} />
            <div className="absolute inset-8 rounded-full border-2 border-primary/40 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.5s' }} />
            <div className="absolute inset-16 rounded-full border-2 border-primary/50 animate-ping" style={{ animationDuration: '2s', animationDelay: '1s' }} />
          </div>
        </div>

        <div className="relative z-10">
          <div className="mb-3 inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 shadow-glow sm:mb-4 sm:h-20 sm:w-20">
            <Radio className="h-8 w-8 text-primary sm:h-10 sm:w-10" />
          </div>
          <h1 className="mb-2 text-2xl font-bold leading-tight sm:text-3xl">Radar Adulto Discreto</h1>
          <p className="mx-auto max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Avise quem combina com voce que esta na cidade, acompanhe quem recebeu, quem visualizou e quem decidiu puxar conversa.
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="glass overflow-hidden">
          <CardHeader className="p-4 pb-3 sm:p-6">
            <CardTitle className="flex items-start gap-2 text-xl leading-tight sm:items-center">
              <Send className="h-5 w-5 text-primary" />
              Avisar que voce esta na cidade
            </CardTitle>
            <CardDescription>
              Trial ativo libera o radar completo. Depois do periodo gratis, o clique leva para os planos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
            {!canCreate && (
              <div className="flex flex-col gap-3 rounded-lg border bg-secondary/30 p-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span>Seu periodo gratis terminou. Para seguir usando o radar, escolha um plano.</span>
                <Button type="button" size="sm" className="h-10 w-full gap-2 bg-gradient-primary hover:opacity-90 sm:w-auto" onClick={() => setPaywallOpen(true)}>
                  <Crown className="h-4 w-4" />
                  Ver planos
                </Button>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">Uso de hoje</div>
                <div className="mt-2 flex min-w-0 items-end justify-between gap-3">
                  <div>
                    <div className="text-2xl font-bold">{usage.dailyRemaining}</div>
                    <div className="text-xs text-muted-foreground">restante de {usage.dailyLimit}</div>
                  </div>
                  <Badge className="shrink-0" variant={usage.dailyRemaining > 0 ? 'secondary' : 'destructive'}>
                    {usage.dailyUsed}/{usage.dailyLimit} usados
                  </Badge>
                </div>
              </div>
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">Uso da semana</div>
                <div className="mt-2 flex min-w-0 items-end justify-between gap-3">
                  <div>
                    <div className="text-2xl font-bold">{usage.weeklyRemaining}</div>
                    <div className="text-xs text-muted-foreground">restantes de {usage.weeklyLimit}</div>
                  </div>
                  <Badge className="shrink-0" variant={usage.weeklyRemaining > 0 ? 'secondary' : 'destructive'}>
                    {usage.weeklyUsed}/{usage.weeklyLimit} usados
                  </Badge>
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-secondary/20 p-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Regra atual:</span> no maximo 1 radar por dia e 3 por semana.
              {limitReached ? ' Seu limite atual ja foi atingido.' : ' Enquanto houver saldo, o envio segue liberado.'}
            </div>

            <div className="space-y-2">
              <Label>Cidade destino</Label>
              <CitySearch
                value={cityInput}
                onChange={(value) => {
                  setCityInput(value);
                  if (value.includes(',')) {
                    const [nextCity, nextState] = value.split(',').map((item) => item.trim());
                    setCity(nextCity || '');
                    setState((nextState || '').slice(0, 2).toUpperCase());
                  } else {
                    setCity(value);
                    setState('');
                  }
                }}
                onSelect={(nextCity, nextState) => {
                  setCity(nextCity);
                  setState(nextState);
                  setCityInput(`${nextCity}, ${nextState}`);
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleUseDeviceLocation()}
                disabled={isLocating}
                className="h-11 w-full justify-center gap-2 rounded-xl text-sm sm:h-9 sm:rounded-md"
              >
                <MapPin className="h-4 w-4" />
                {isLocating ? 'Obtendo localização...' : 'Usar GPS do dispositivo'}
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Sua mensagem</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Escreva uma mensagem adulta, respeitosa e discreta..."
                className="min-h-[112px] rounded-xl text-base leading-6 sm:min-h-[100px] sm:text-sm"
                maxLength={200}
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{message.length}/200</span>
                <button type="button" className="text-primary hover:underline" onClick={() => handleUseTemplate(MESSAGE_TEMPLATES[Math.floor(Math.random() * MESSAGE_TEMPLATES.length)])}>
                  <Sparkles className="mr-1 inline h-3 w-3" />
                  Usar sugestao
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Quem receber seu radar vai ver essa mensagem e pode abrir conversa direto com voce.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Templates rapidos</Label>
              <div className="flex flex-wrap gap-1.5">
                {MESSAGE_TEMPLATES.slice(0, 3).map((template, i) => (
                  <Badge key={i} variant="secondary" className="cursor-pointer whitespace-normal py-1.5 text-xs leading-snug hover:bg-primary/20" onClick={() => handleUseTemplate(template)}>
                    {template.slice(0, 34)}...
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Perfis que voce quer alcancar</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'all', label: 'Todos' },
                  { value: 'female', label: 'Mulheres solteiras' },
                  { value: 'male', label: 'Homens solteiros' },
                  { value: 'couple', label: 'Casais' },
                ].map((option) => (
                  <Badge key={option.value} variant={targetGender.includes(option.value) ? 'default' : 'outline'} className="min-h-9 cursor-pointer px-3 py-2 text-sm" onClick={() => handleGenderToggle(option.value)}>
                    {targetGender.includes(option.value) && <Check className="mr-1 h-3 w-3" />}
                    {option.label}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Raio de alcance</Label>
                <span className="text-sm text-muted-foreground">{radius[0]} km</span>
              </div>
              <div className="px-1 py-3">
                <Slider value={radius} onValueChange={setRadius} max={100} min={5} step={5} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Duracao do radar</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger className="h-12 rounded-xl text-base sm:h-10 sm:rounded-md sm:text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 hora</SelectItem>
                  <SelectItem value="3">3 horas</SelectItem>
                  <SelectItem value="6">6 horas</SelectItem>
                  <SelectItem value="12">12 horas</SelectItem>
                  <SelectItem value="24">24 horas</SelectItem>
                  <SelectItem value="48">48 horas</SelectItem>
                  <SelectItem value="72">72 horas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between gap-4 rounded-xl border bg-secondary/20 p-3">
                <div className="min-w-0 space-y-0.5">
                  <Label className="text-sm">Modo anonimo</Label>
                  <p className="text-xs text-muted-foreground">No recebido, seu nome so aparece como perfil discreto.</p>
                </div>
                <Switch checked={isAnonymous} onCheckedChange={setIsAnonymous} />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border bg-secondary/20 p-3">
                <div className="min-w-0 space-y-0.5">
                  <Label className="text-sm">Apenas online</Label>
                  <p className="text-xs text-muted-foreground">Entrega priorizada a quem estiver online no momento em que abrir o radar.</p>
                </div>
                <Switch checked={showOnlyOnline} onCheckedChange={setShowOnlyOnline} />
              </div>
            </div>

            <Button className="mt-4 h-12 w-full rounded-xl bg-gradient-primary text-base font-semibold hover:opacity-90" size="lg" onClick={handleSendBroadcast} disabled={isSending || !city || !state || !message.trim() || limitReached}>
              {isSending ? (
                <>
                  <Radio className="h-4 w-4 animate-pulse" />
                  Ativando radar...
                </>
              ) : (
                <>
                  <Radio className="h-4 w-4" />
                  {limitReached ? 'Limite do radar atingido' : 'Publicar no radar'}
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4 sm:space-y-6">
          <Card className="glass overflow-hidden">
            <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Navigation className="h-5 w-5 text-primary" />
                Seus radares
              </CardTitle>
              <CardDescription>Voce acompanha quem recebeu, visualizou e puxou conversa a partir do radar.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
              {isLoading ? (
                <div className="py-8 text-center text-muted-foreground">Carregando radar...</div>
              ) : myBroadcasts.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Radio className="mx-auto mb-3 h-12 w-12 opacity-30" />
                  <p>Nenhum radar enviado ainda</p>
                </div>
              ) : (
                <>
                  {activeBroadcasts.map((broadcast) => (
                    <div key={broadcast.id} className="rounded-xl border border-border/50 bg-secondary/50 p-3.5 sm:p-4">
                      <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="font-medium">{broadcast.city}, {broadcast.state}</p>
                          <p className="text-xs text-muted-foreground">
                            Ativo ha {formatElapsed(broadcast.createdAt)} . {formatRemaining(broadcast.expiresAt)}
                          </p>
                        </div>
                        <Button variant="ghost" size="sm" className="h-9 w-full sm:w-auto" onClick={() => void handleDeactivateBroadcast(broadcast.id)}>
                          Desativar
                        </Button>
                      </div>
                      <p className="mb-3 text-sm">{broadcast.message}</p>
                      <div className="mb-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary">{audienceLabel(broadcast.targetGender)}</Badge>
                        <Badge variant="secondary">{broadcast.radius} km</Badge>
                        <Badge variant="secondary">{broadcast.durationHours} h</Badge>
                      </div>
                      <div className="grid gap-2 text-sm sm:grid-cols-3">
                        <div className="rounded-lg bg-background/60 p-3">
                          <div className="font-semibold">{broadcast.deliveriesCount}</div>
                          <div className="text-xs text-muted-foreground">receberam</div>
                        </div>
                        <div className="rounded-lg bg-background/60 p-3">
                          <div className="font-semibold">{broadcast.viewsCount}</div>
                          <div className="text-xs text-muted-foreground">visualizaram</div>
                        </div>
                        <div className="rounded-lg bg-background/60 p-3">
                          <div className="font-semibold">{broadcast.responsesCount}</div>
                          <div className="text-xs text-muted-foreground">abriram conversa</div>
                        </div>
                      </div>
                      {broadcast.deliveries.length > 0 ? (
                        <div className="mt-4 space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Quem recebeu</p>
                          {broadcast.deliveries.slice(0, 6).map((delivery) => (
                            <div key={`${broadcast.id}-${delivery.viewer.id}-${delivery.deliveredAt}`} className="flex min-w-0 flex-col gap-3 rounded-lg border bg-background/50 p-3 min-[420px]:flex-row min-[420px]:items-center">
                              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-secondary">
                                {delivery.viewer.avatar ? (
                                  <img src={resolveServerUrl(delivery.viewer.avatar)} alt={delivery.viewer.name} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-sm font-semibold">
                                    {delivery.viewer.name.charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <button
                                  type="button"
                                  className="truncate text-left text-sm font-medium hover:underline"
                                  onClick={() => navigate(getUserProfileHref(delivery.viewer.id, user?.id, '/radar'))}
                                >
                                  {delivery.viewer.name}
                                </button>
                                <div className="text-xs text-muted-foreground">{formatProfileIdentityLine(delivery.viewer) || 'Perfil da rede'}</div>
                              </div>
                              <div className="flex shrink-0 flex-wrap gap-1">
                                <Badge variant="outline">Recebido</Badge>
                                {delivery.viewedAt ? <Badge variant="outline">Visualizou</Badge> : null}
                                {delivery.contactedAt ? <Badge className="bg-primary/15 text-primary">Conversou</Badge> : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}

                  {inactiveBroadcasts.length > 0 ? (
                    <div className="space-y-2 pt-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Encerrados</p>
                      {inactiveBroadcasts.slice(0, 3).map((broadcast) => (
                        <div key={broadcast.id} className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                          {broadcast.city}, {broadcast.state} . {broadcast.viewsCount} visualizacoes . {broadcast.responsesCount} conversas
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="glass overflow-hidden border-primary/20">
            <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <MapPin className="h-5 w-5 text-primary" />
                Mapa rápido da atividade
              </CardTitle>
              <CardDescription>
                Visão simplificada por zona para mostrar onde o Radar está mais quente agora na sua região.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
              {isLoading ? (
                <div className="py-6 text-center text-muted-foreground">Montando mapa simplificado...</div>
              ) : heatmap.totalActive === 0 ? (
                <div className="py-6 text-center text-muted-foreground">
                  <MapPin className="mx-auto mb-3 h-10 w-10 opacity-30" />
                  <p>Nenhuma concentração ativa perto de você no momento</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/10 bg-primary/5 p-3 text-sm text-muted-foreground">
                    <Badge className="bg-primary/15 text-primary">{heatmap.totalActive} ativos agora</Badge>
                    {heatmap.hottestZone ? (
                      <span className="inline-flex items-center gap-1">
                        <Flame className="h-4 w-4 text-orange-500" />
                        Maior concentração em <strong className="text-foreground">{heatmap.hottestZone}</strong> com {hottestZoneCount} radar{hottestZoneCount === 1 ? '' : 'es'}
                      </span>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {heatmap.zones.map((zone) => {
                      const levelClass =
                        zone.count >= 3
                          ? 'border-rose-300 bg-rose-100/70 text-rose-700'
                          : zone.count >= 1
                            ? 'border-primary/20 bg-primary/5 text-foreground'
                            : 'border-border/50 bg-secondary/20 text-muted-foreground';
                      return (
                        <div key={zone.id} className={`rounded-2xl border p-3 text-center transition-colors ${levelClass}`}>
                          <div className="text-xs font-semibold uppercase tracking-[0.14em]">{zone.label}</div>
                          <div className="mt-2 text-2xl font-bold">{zone.count}</div>
                          <div className="text-[11px]">{zone.count === 0 ? 'sem radar' : zone.count === 1 ? '1 radar' : `${zone.count} radares`}</div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="glass overflow-hidden border-primary/30">
            <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageCircle className="h-5 w-5 text-primary" />
                Radares que voce recebeu
              </CardTitle>
              <CardDescription>Quando alguem usar o radar perto da sua cidade, o aviso aparece aqui com botao de conversa.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
              {isLoading ? (
                <div className="py-6 text-center text-muted-foreground">Carregando avisos recebidos...</div>
              ) : incoming.length === 0 ? (
                <div className="py-6 text-center text-muted-foreground">
                  <Eye className="mx-auto mb-3 h-10 w-10 opacity-30" />
                  <p>Nenhum radar recebido no momento</p>
                </div>
              ) : (
                incoming.map((item) => (
                  <div key={item.id} className="rounded-xl border border-border/50 bg-secondary/40 p-3.5 sm:p-4">
                    <div className="mb-3 flex items-start gap-3">
                      <div className="h-12 w-12 overflow-hidden rounded-full bg-secondary">
                        {item.sender.avatar ? (
                          <img src={resolveServerUrl(item.sender.avatar)} alt={item.sender.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm font-semibold">
                            {item.sender.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          className="text-left font-medium hover:underline"
                          onClick={() => navigate(getUserProfileHref(item.sender.id, user?.id, '/radar'))}
                        >
                          {item.sender.name}
                        </button>
                        <div className="text-xs text-muted-foreground">{formatProfileIdentityLine(item.sender) || `${item.city}, ${item.state}`}</div>
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> ativo ha {formatElapsed(item.createdAt)}</span>
                          <span>{formatRemaining(item.expiresAt)}</span>
                          {typeof item.distanceKm === 'number' ? <span>{item.distanceKm} km de você</span> : null}
                        </div>
                      </div>
                    </div>
                    <p className="mb-3 text-sm leading-6">{item.message}</p>
                    <div className="mb-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">{audienceLabel(item.targetGender)}</Badge>
                      <Badge variant="secondary">{item.radius} km</Badge>
                      <Badge variant="secondary">{item.durationHours} h</Badge>
                      {item.zoneLabel ? <Badge variant="secondary">{item.zoneLabel}</Badge> : null}
                    </div>
                    <Button className="h-11 w-full gap-2 rounded-xl bg-gradient-primary hover:opacity-90" onClick={() => void handleContactRadar(item.id)}>
                      <MessageCircle className="h-4 w-4" />
                      Conversar sobre este radar
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="glass overflow-hidden">
            <CardContent className="p-4 sm:pt-6">
              <div className="grid grid-cols-3 gap-2 text-center sm:gap-4">
                <div>
                  <p className="text-xl font-bold text-primary sm:text-2xl">{totalDeliveries}</p>
                  <p className="text-xs text-muted-foreground">Receberam</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-primary sm:text-2xl">{totalViews}</p>
                  <p className="text-xs text-muted-foreground">Visualizaram</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-primary sm:text-2xl">{totalResponses}</p>
                  <p className="text-xs text-muted-foreground">Conversaram</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass overflow-hidden border-primary/30">
            <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5 text-primary" />
                Como o radar funciona
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                  <span>Quem recebe abre esta mesma tela e encontra seu aviso na area de radares recebidos.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                  <span>Ao abrir o aviso, a pessoa entra como recebida e visualizada no seu painel.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                  <span>Quando a pessoa toca em conversar, o sistema abre o chat e marca isso como resposta do radar.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                  <span>Agora existe duracao minima de 1 hora, alem das opcoes maiores.</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      <ReferralPaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </div>
  );
}

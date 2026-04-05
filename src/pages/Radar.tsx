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
import { CitySearch } from '@/components/CitySearch';
import { radarService } from '@/services/api';
import { hasPremiumAccess } from '@/utils/premium';
import { formatProfileIdentityLine } from '@/utils/profileIdentity';
import { resolveServerUrl } from '@/utils/serverUrl';

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
  const navigate = useNavigate();
  const radarAllowed = hasPremiumAccess(user);

  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [message, setMessage] = useState('');
  const [targetGender, setTargetGender] = useState<string[]>(['all']);
  const [radius, setRadius] = useState([25]);
  const [duration, setDuration] = useState('1');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [showOnlyOnline, setShowOnlyOnline] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [canCreate, setCanCreate] = useState(radarAllowed);
  const [myBroadcasts, setMyBroadcasts] = useState<RadarBroadcast[]>([]);
  const [incoming, setIncoming] = useState<IncomingRadar[]>([]);
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
    if (!radarAllowed || !canCreate) {
      toast({
        title: 'Radar disponível após o trial',
        description: 'Quando seu periodo gratis terminar, o radar passa a ficar nos planos.',
        variant: 'destructive',
      });
      navigate('/subscriptions');
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
      toast({
        title: 'Radar ativado',
        description: `Seu aviso ja foi publicado para ${city}, ${state}.`,
      });
      setMessage('');
      setCity('');
      setState('');
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
      if (premiumRequired) navigate('/subscriptions');
      if (dailyLimitError || weeklyLimitError) await loadRadar();
    } finally {
      setIsSending(false);
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

  return (
    <div className="container max-w-6xl py-6 space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-hero p-8 text-center">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2">
            <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-ping" style={{ animationDuration: '3s' }} />
            <div className="absolute inset-8 rounded-full border-2 border-primary/40 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.5s' }} />
            <div className="absolute inset-16 rounded-full border-2 border-primary/50 animate-ping" style={{ animationDuration: '2s', animationDelay: '1s' }} />
          </div>
        </div>

        <div className="relative z-10">
          <div className="mb-4 inline-flex h-20 w-20 items-center justify-center rounded-full bg-primary/20 shadow-glow">
            <Radio className="h-10 w-10 text-primary" />
          </div>
          <h1 className="mb-2 text-3xl font-bold">Radar Adulto Discreto</h1>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Avise quem combina com voce que esta na cidade, acompanhe quem recebeu, quem visualizou e quem decidiu puxar conversa.
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Avisar que voce esta na cidade
            </CardTitle>
            <CardDescription>
              Trial ativo libera o radar completo. Depois do periodo gratis, o clique leva para os planos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!canCreate && (
              <div className="flex items-center justify-between gap-3 rounded-lg border bg-secondary/30 p-3 text-sm text-muted-foreground">
                <span>Seu periodo gratis terminou. Para seguir usando o radar, escolha um plano.</span>
                <Button type="button" size="sm" className="gap-2 bg-gradient-primary hover:opacity-90" onClick={() => navigate('/subscriptions')}>
                  <Crown className="h-4 w-4" />
                  Ver planos
                </Button>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">Uso de hoje</div>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <div>
                    <div className="text-2xl font-bold">{usage.dailyRemaining}</div>
                    <div className="text-xs text-muted-foreground">restante de {usage.dailyLimit}</div>
                  </div>
                  <Badge variant={usage.dailyRemaining > 0 ? 'secondary' : 'destructive'}>
                    {usage.dailyUsed}/{usage.dailyLimit} usados
                  </Badge>
                </div>
              </div>
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">Uso da semana</div>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <div>
                    <div className="text-2xl font-bold">{usage.weeklyRemaining}</div>
                    <div className="text-xs text-muted-foreground">restantes de {usage.weeklyLimit}</div>
                  </div>
                  <Badge variant={usage.weeklyRemaining > 0 ? 'secondary' : 'destructive'}>
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
                value={city ? `${city}, ${state}` : ''}
                onChange={(value) => {
                  setCity(value);
                  if (!value.includes(',')) setState('');
                }}
                onSelect={(nextCity, nextState) => {
                  setCity(nextCity);
                  setState(nextState);
                }}
              />
            </div>

            <div className="space-y-2">
              <Label>Sua mensagem</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Escreva uma mensagem adulta, respeitosa e discreta..."
                className="min-h-[100px]"
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
              <div className="flex flex-wrap gap-1">
                {MESSAGE_TEMPLATES.slice(0, 3).map((template, i) => (
                  <Badge key={i} variant="secondary" className="cursor-pointer hover:bg-primary/20 text-xs" onClick={() => handleUseTemplate(template)}>
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
                  <Badge key={option.value} variant={targetGender.includes(option.value) ? 'default' : 'outline'} className="cursor-pointer" onClick={() => handleGenderToggle(option.value)}>
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
              <Slider value={radius} onValueChange={setRadius} max={100} min={5} step={5} />
            </div>

            <div className="space-y-2">
              <Label>Duracao do radar</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger>
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
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Modo anonimo</Label>
                  <p className="text-xs text-muted-foreground">No recebido, seu nome so aparece como perfil discreto.</p>
                </div>
                <Switch checked={isAnonymous} onCheckedChange={setIsAnonymous} />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Apenas online</Label>
                  <p className="text-xs text-muted-foreground">Entrega priorizada a quem estiver online no momento em que abrir o radar.</p>
                </div>
                <Switch checked={showOnlyOnline} onCheckedChange={setShowOnlyOnline} />
              </div>
            </div>

            <Button className="mt-4 w-full" size="lg" onClick={handleSendBroadcast} disabled={isSending || !city || !state || !message.trim() || limitReached}>
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

        <div className="space-y-6">
          <Card className="glass">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Navigation className="h-5 w-5 text-primary" />
                Seus radares
              </CardTitle>
              <CardDescription>Voce acompanha quem recebeu, visualizou e puxou conversa a partir do radar.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
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
                    <div key={broadcast.id} className="rounded-lg border border-border/50 bg-secondary/50 p-4">
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">{broadcast.city}, {broadcast.state}</p>
                          <p className="text-xs text-muted-foreground">
                            Ativo ha {formatElapsed(broadcast.createdAt)} . {formatRemaining(broadcast.expiresAt)}
                          </p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => void handleDeactivateBroadcast(broadcast.id)}>
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
                            <div key={`${broadcast.id}-${delivery.viewer.id}-${delivery.deliveredAt}`} className="flex items-center gap-3 rounded-lg border bg-background/50 p-3">
                              <div className="h-10 w-10 overflow-hidden rounded-full bg-secondary">
                                {delivery.viewer.avatar ? (
                                  <img src={resolveServerUrl(delivery.viewer.avatar)} alt={delivery.viewer.name} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-sm font-semibold">
                                    {delivery.viewer.name.charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium">{delivery.viewer.name}</div>
                                <div className="text-xs text-muted-foreground">{formatProfileIdentityLine(delivery.viewer) || 'Perfil da rede'}</div>
                              </div>
                              <div className="flex flex-wrap gap-1">
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

          <Card className="glass border-primary/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageCircle className="h-5 w-5 text-primary" />
                Radares que voce recebeu
              </CardTitle>
              <CardDescription>Quando alguem usar o radar perto da sua cidade, o aviso aparece aqui com botao de conversa.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <div className="py-6 text-center text-muted-foreground">Carregando avisos recebidos...</div>
              ) : incoming.length === 0 ? (
                <div className="py-6 text-center text-muted-foreground">
                  <Eye className="mx-auto mb-3 h-10 w-10 opacity-30" />
                  <p>Nenhum radar recebido no momento</p>
                </div>
              ) : (
                incoming.map((item) => (
                  <div key={item.id} className="rounded-lg border border-border/50 bg-secondary/40 p-4">
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
                        <div className="font-medium">{item.sender.name}</div>
                        <div className="text-xs text-muted-foreground">{formatProfileIdentityLine(item.sender) || `${item.city}, ${item.state}`}</div>
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> ativo ha {formatElapsed(item.createdAt)}</span>
                          <span>{formatRemaining(item.expiresAt)}</span>
                        </div>
                      </div>
                    </div>
                    <p className="mb-3 text-sm leading-6">{item.message}</p>
                    <div className="mb-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">{audienceLabel(item.targetGender)}</Badge>
                      <Badge variant="secondary">{item.radius} km</Badge>
                      <Badge variant="secondary">{item.durationHours} h</Badge>
                    </div>
                    <Button className="w-full gap-2 bg-gradient-primary hover:opacity-90" onClick={() => void handleContactRadar(item.id)}>
                      <MessageCircle className="h-4 w-4" />
                      Conversar sobre este radar
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="glass">
            <CardContent className="pt-6">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-primary">{totalDeliveries}</p>
                  <p className="text-xs text-muted-foreground">Receberam</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary">{totalViews}</p>
                  <p className="text-xs text-muted-foreground">Visualizaram</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary">{totalResponses}</p>
                  <p className="text-xs text-muted-foreground">Conversaram</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass border-primary/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5 text-primary" />
                Como o radar funciona
              </CardTitle>
            </CardHeader>
            <CardContent>
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
    </div>
  );
}

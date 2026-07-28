import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useFavorites } from '@/contexts/FavoritesContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Lock, Eye, EyeOff, ArrowLeft, ArrowRight, MapPin, Locate, Check, Users } from 'lucide-react';
import GoogleSignInButton from '@/components/GoogleSignInButton';
import { useToast } from '@/hooks/use-toast';
import { getApiErrorInfo } from '@/utils/apiError';
import { cn } from '@/lib/utils';
import { onboardingService, authService } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { useAgeGate } from '@/contexts/AgeGateContext';
import { CitySearch } from '@/components/CitySearch';
import BrandLogo from '@/components/BrandLogo';

// ─── Options ─────────────────────────────────────────────────────────────────

const primaryOptions = [
  { value: 'Casal (Ele/Ela)', label: 'Somos um casal', emoji: '👫', hint: 'casal hetero' },
  { value: 'Mulher',          label: 'Sou mulher',     emoji: '👩', hint: 'single feminina' },
  { value: 'Homem',           label: 'Sou homem',      emoji: '👨', hint: 'single masculino' },
] as const;

const otherOptions = [
  { value: 'Casal (Ele/Ele)',    label: 'Casal (ele/ele)', emoji: '👬', hint: '' },
  { value: 'Casal (Ela/Ela)',    label: 'Casal (ela/ela)', emoji: '👭', hint: '' },
  { value: 'Transexual',         label: 'Pessoa trans',    emoji: '🏳️‍⚧️', hint: '' },
  { value: 'Crossdresser (CD)',  label: 'Crossdresser',    emoji: '✨', hint: '' },
  { value: 'Travesti',           label: 'Travesti',        emoji: '🌈', hint: '' },
] as const;

const allOptions = [...primaryOptions, ...otherOptions];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Derive a sensible default lookingFor from the profile type so the user
// doesn't need to fill an extra step — they can refine it inside the platform.
function defaultLookingFor(gender: string): string[] {
  if (gender === 'Mulher') return ['Casal (Ele/Ela)', 'Homem'];
  if (gender === 'Homem')  return ['Casal (Ele/Ela)', 'Mulher'];
  if (gender.startsWith('Casal'))
    return ['Mulher', 'Homem', 'Casal (Ele/Ela)', 'Casal (Ele/Ele)', 'Casal (Ela/Ela)', 'Transexual', 'Crossdresser (CD)', 'Travesti'];
  return ['Mulher', 'Homem', 'Casal (Ele/Ela)'];
}

// ─── Social proof ticker ───────────────────────────────────────────────────────

const SOCIAL_PROOFS = [
  { icon: '✨', text: '247 pessoas se cadastraram hoje' },
  { icon: '📍', text: '18 casais ativos na plataforma agora' },
  { icon: '🔒', text: 'Seu perfil é 100% privado por padrão' },
  { icon: '🔥', text: 'Conexões reais, sem julgamentos' },
];

// ─── Steps ────────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Perfil' },
  { id: 2, label: 'Acesso' },
  { id: 3, label: 'Entrar' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function Register() {
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite')?.trim() || '';

  const [currentStep, setCurrentStep] = useState(1);
  const [showOthers, setShowOthers] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [nameStatus, setNameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'blacklisted'>('idle');
  const [loadingLabel, setLoadingLabel] = useState('Criando sua conta...');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [proofIndex, setProofIndex] = useState(0);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    gender: '',
    city: '',
    state: '',
    acceptTerms: false,
  });
  // A cidade só é "confirmada" (caixa travada) quando vem do GPS ou de uma seleção
  // da lista. Enquanto o usuário digita manualmente, o campo permanece editável.
  const [cityConfirmed, setCityConfirmed] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);

  const { register } = useAuth();
  const { addFavorite } = useFavorites();
  const { confirmAge } = useAgeGate();
  const navigate = useNavigate();
  const { toast } = useToast();

  const isCouple = formData.gender.toLowerCase().includes('casal');

  const updateField = (field: string, value: unknown) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  // Erro vindo do OAuth (ex.: Google sem escolher o tipo de perfil).
  useEffect(() => {
    if (searchParams.get('error') === 'profile_type_required') {
      toast({
        title: 'Escolha o tipo de perfil',
        description: 'Informe se é Homem, Mulher, Casal ou outro perfil para continuar o cadastro.',
        variant: 'destructive',
      });
    }
  }, [searchParams, toast]);

  // ── Social proof ticker ───────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(
      () => setProofIndex((i) => (i + 1) % SOCIAL_PROOFS.length),
      3500
    );
    return () => clearInterval(t);
  }, []);

  // ── Checa disponibilidade do nome em tempo real (com debounce) ────────────
  useEffect(() => {
    const name = formData.name.trim();
    if (name.length < 2) { setNameStatus('idle'); return; }
    setNameStatus('checking');
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const { available, reason } = await authService.checkName(name);
        if (cancelled) return;
        if (available === true) setNameStatus('available');
        else if (reason === 'blacklisted') setNameStatus('blacklisted');
        else if (available === false) setNameStatus('taken');
        else setNameStatus('idle');
      } catch {
        if (!cancelled) setNameStatus('idle');
      }
    }, 450);
    return () => { cancelled = true; clearTimeout(t); };
  }, [formData.name]);

  // ── Load suggestions when reaching step 3 ────────────────────────────────
  useEffect(() => {
    if (currentStep !== 3 || !formData.gender) return;
    let cancelled = false;
    setIsLoadingSuggestions(true);
    const lookingFor = defaultLookingFor(formData.gender);
    onboardingService
      .getSuggestions({
        lookingFor,
        city: formData.city || undefined,
        state: formData.state || undefined,
      })
      .then((data) => {
        if (cancelled) return;
        setSuggestions(
          Array.isArray(data) ? data.filter((u: any) => u.avatar).slice(0, 6) : []
        );
      })
      .catch(() => { if (!cancelled) setSuggestions([]); })
      .finally(() => { if (!cancelled) setIsLoadingSuggestions(false); });
    return () => { cancelled = true; };
  }, [currentStep, formData.gender, formData.city, formData.state]);

  // ── GPS ───────────────────────────────────────────────────────────────────
  const handleGpsLocation = () => {
    if (!navigator.geolocation) {
      toast({
        title: 'GPS não disponível',
        description: 'Seu navegador não suporta geolocalização.',
        variant: 'destructive',
      });
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const resp = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=pt-BR`
          );
          const geo = await resp.json();
          const city =
            geo?.address?.city ||
            geo?.address?.town ||
            geo?.address?.village ||
            '';
          const state =
            geo?.address?.state_code ||
            geo?.address?.ISO3166_2_lvl4?.replace('BR-', '') ||
            '';
          if (city) { updateField('city', city); setCityConfirmed(true); }
          if (state) updateField('state', state.slice(0, 2).toUpperCase());
          if (city)
            toast({
              title: '📍 Localização obtida!',
              description: `${city}${state ? `, ${state}` : ''}`,
            });
          else
            toast({
              title: 'Cidade não identificada',
              description: 'Digite manualmente abaixo.',
            });
        } catch {
          toast({
            title: 'Erro ao obter localização',
            description: 'Tente digitar manualmente.',
            variant: 'destructive',
          });
        } finally {
          setGpsLoading(false);
        }
      },
      () => {
        setGpsLoading(false);
        toast({
          title: 'Permissão negada',
          description: 'Ative o GPS ou digite sua cidade.',
          variant: 'destructive',
        });
      }
    );
  };

  // ── Card select — auto-focus name after picking ───────────────────────────
  const handleSelectGender = (value: string) => {
    updateField('gender', value);
    setTimeout(() => nameInputRef.current?.focus(), 180);
  };

  // ── Navigation ────────────────────────────────────────────────────────────
  const handleNext = async () => {
    if (currentStep === 1) {
      if (!formData.gender) {
        toast({
          title: 'Selecione seu perfil',
          description: 'Clique em um dos cards acima.',
          variant: 'destructive',
        });
        return;
      }
      if (!formData.name.trim()) {
        toast({
          title: 'Como quer ser chamado?',
          description: 'Informe seu nome ou apelido.',
          variant: 'destructive',
        });
        return;
      }
      if (nameStatus === 'taken' || nameStatus === 'blacklisted') {
        toast({
          title: nameStatus === 'blacklisted' ? 'Nome indisponível' : 'Nome já em uso',
          description: 'Escolha outro nome para continuar.',
          variant: 'destructive',
        });
        return;
      }
      // Se ainda não confirmou disponível, valida agora antes de avançar.
      if (nameStatus !== 'available') {
        try {
          setIsLoading(true);
          const { available, reason } = await authService.checkName(formData.name.trim());
          if (!available) {
            setNameStatus(reason === 'blacklisted' ? 'blacklisted' : 'taken');
            toast({
              title: reason === 'blacklisted' ? 'Nome indisponível' : 'Nome já em uso',
              description: 'Escolha outro nome para continuar.',
              variant: 'destructive',
            });
            return;
          }
          setNameStatus('available');
        } catch {
          // Se a checagem falhar, deixa seguir — o cadastro final ainda valida.
        } finally {
          setIsLoading(false);
        }
      }
      setCurrentStep(2);
      return;
    }

    if (currentStep === 2) {
      if (!formData.email.trim()) {
        toast({ title: 'E-mail obrigatório', variant: 'destructive' });
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        toast({ title: 'E-mail inválido', variant: 'destructive' });
        return;
      }
      if (!formData.password || formData.password.length < 6) {
        toast({
          title: 'Senha muito curta',
          description: 'Use pelo menos 6 caracteres.',
          variant: 'destructive',
        });
        return;
      }
      try {
        setIsLoading(true);
        const { available } = await authService.checkEmail(formData.email);
        if (!available) {
          toast({
            title: 'E-mail já cadastrado',
            description: 'Use outro e-mail ou faça login.',
            variant: 'destructive',
          });
          return;
        }
      } catch {
        toast({
          title: 'Erro ao validar e-mail',
          description: 'Tente novamente.',
          variant: 'destructive',
        });
        return;
      } finally {
        setIsLoading(false);
      }
      setCurrentStep(3);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep((s) => s - 1);
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.acceptTerms) {
      toast({
        title: 'Aceite os termos para continuar.',
        variant: 'destructive',
      });
      return;
    }

    const payload = {
      name: formData.name,
      email: formData.email,
      password: formData.password,
      ...(inviteToken ? { inviteToken } : {}),
      gender: formData.gender,
      city: formData.city || undefined,
      state: formData.state || undefined,
      lookingFor: defaultLookingFor(formData.gender),
    };

    const attemptRegister = async (attempt: number): Promise<Awaited<ReturnType<typeof register>>> => {
      try {
        return await register(payload);
      } catch (err: any) {
        const status = err?.response?.status as number | undefined;
        // Retry up to 3 times on transient server errors (5xx / network) — server may be warming up after deploy
        const maxAttempts = 3;
        if (attempt < maxAttempts && (!status || status >= 500)) {
          setLoadingLabel(attempt === 1 ? 'Reconectando...' : 'Aguardando servidor...');
          await new Promise((r) => setTimeout(r, 2500 * attempt)); // 2.5s, 5s
          setLoadingLabel('Criando sua conta...');
          return attemptRegister(attempt + 1);
        }
        throw err;
      }
    };

    setIsLoading(true);
    setLoadingLabel('Criando sua conta...');
    try {
      const createdUser = await attemptRegister(1);

      if (selectedSuggestionIds.length > 0) {
        selectedSuggestionIds.forEach((id) => {
          const user = suggestions.find((s) => String(s.id) === id);
          if (user)
            addFavorite({
              id: user.id,
              name: user.name,
              avatar: user.avatar,
              addedAt: new Date().toISOString(),
            });
        });
      }

      sessionStorage.setItem('nosigilo_login_email', formData.email);
      if (createdUser?.user?.id) {
        localStorage.setItem(
          `nosigilo:first-access-flow:${createdUser.user.id}`,
          JSON.stringify({
            needsPhoto: true,
            needsPost: true,
            startedAt: new Date().toISOString(),
          })
        );
        window.dispatchEvent(new CustomEvent('nosigilo:first-access-flow-changed'));
      }
      confirmAge(); // user accepted 18+ terms during registration
      toast({ title: 'Conta criada! Bem-vindo(a) 🎉' });
      // Homem cai direto na aba de Busca (descoberta de perfis = maior gatilho p/ assinar).
      const isMan = String(formData.gender || '').toLowerCase().startsWith('homem');
      navigate(isMan ? '/search' : '/feed');
    } catch (error) {
      const info = getApiErrorInfo(error, {
        title: 'Erro ao criar conta',
        description: 'Tente novamente mais tarde.',
      });
      const data = (error as any)?.response?.data;
      const serverMsg =
        data?.debug ||
        data?.message ||
        (Array.isArray(data?.errors) ? data.errors.map((e: any) => e.message).join(', ') : null);
      console.error('[Register handleSubmit]', data ?? error);
      toast({
        title: info.title,
        description: serverMsg ? serverMsg : info.description,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setLoadingLabel('Criando sua conta...');
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen items-start justify-center overflow-x-hidden bg-background p-2 py-3 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-gradient-hero" />

      <div className="relative z-10 w-full max-w-lg min-w-0">
        <Link
          to="/"
          className="mb-4 inline-flex min-h-10 items-center gap-2 text-muted-foreground transition-colors hover:text-foreground sm:mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Link>

        <div className="glass-strong rounded-2xl p-5 shadow-glow sm:p-8">
          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="mb-4 flex min-w-0 items-center gap-3">
            <BrandLogo size="md" showText={false} />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold leading-tight">Criar Conta</h1>
              <p className="text-muted-foreground text-sm">Passo {currentStep} de 3</p>
            </div>
          </div>

          {/* ── Social Proof Ticker ─────────────────────────────────────── */}
          <div className="mb-5 flex items-center gap-2.5 overflow-hidden rounded-xl border border-primary/15 bg-primary/8 px-3.5 py-2.5">
            <span className="shrink-0 animate-pulse text-xs text-primary">●</span>
            <span className="truncate text-sm text-muted-foreground">
              {SOCIAL_PROOFS[proofIndex].icon} {SOCIAL_PROOFS[proofIndex].text}
            </span>
          </div>

          {/* ── Progress bar ────────────────────────────────────────────── */}
          <div className="mb-6 flex items-center gap-1.5">
            {STEPS.map((step, idx) => (
              <div key={step.id} className="flex flex-1 items-center">
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all',
                    currentStep > step.id
                      ? 'bg-primary text-primary-foreground'
                      : currentStep === step.id
                        ? 'bg-gradient-primary text-primary-foreground shadow-glow'
                        : 'bg-secondary text-muted-foreground'
                  )}
                >
                  {currentStep > step.id ? <Check className="h-3.5 w-3.5" /> : step.id}
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className={cn(
                      'mx-1.5 h-1 flex-1 rounded-full transition-all',
                      currentStep > step.id ? 'bg-primary' : 'bg-secondary'
                    )}
                  />
                )}
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit}>
            {/* ══════════════════════════════════════════════════════════
                PASSO 1 — Quem vai entrar nessa? + Nome
            ══════════════════════════════════════════════════════════ */}
            {currentStep === 1 && (
              <div className="space-y-5 animate-fade-in">
                <div>
                  <h2 className="text-lg font-semibold">Quem vai entrar nessa?</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Escolha seu perfil — define como outros te encontram.
                  </p>
                </div>

                {/* Primary cards */}
                <div className="grid grid-cols-3 gap-2.5">
                  {primaryOptions.map((opt) => {
                    const selected = formData.gender === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleSelectGender(opt.value)}
                        className={cn(
                          'relative flex flex-col items-center gap-2 rounded-xl border-2 px-2 py-4 text-center transition-all active:scale-95',
                          selected
                            ? 'border-primary bg-primary/10 shadow-glow'
                            : 'border-border hover:border-primary/40 hover:bg-secondary/50'
                        )}
                      >
                        {selected && (
                          <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary">
                            <Check className="h-2.5 w-2.5 text-primary-foreground" />
                          </span>
                        )}
                        <span className="text-3xl leading-none">{opt.emoji}</span>
                        <span className="text-xs font-semibold leading-tight">{opt.label}</span>
                        <span className="text-[10px] text-muted-foreground leading-tight">{opt.hint}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Other options — collapsible */}
                {!showOthers && !otherOptions.some((o) => o.value === formData.gender) && (
                  <button
                    type="button"
                    onClick={() => setShowOthers(true)}
                    className="w-full rounded-xl border border-dashed border-border py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    Outros perfis (trans, casal homoafetivo, CD…)
                  </button>
                )}

                {(showOthers || otherOptions.some((o) => o.value === formData.gender)) && (
                  <div className="grid grid-cols-3 gap-2 animate-fade-in sm:grid-cols-5">
                    {otherOptions.map((opt) => {
                      const selected = formData.gender === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleSelectGender(opt.value)}
                          className={cn(
                            'relative flex flex-col items-center gap-1.5 rounded-xl border-2 px-1 py-3 text-center text-xs transition-all active:scale-95',
                            selected
                              ? 'border-primary bg-primary/10 shadow-glow'
                              : 'border-border hover:border-primary/40 hover:bg-secondary/50'
                          )}
                        >
                          {selected && (
                            <span className="absolute right-1.5 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary">
                              <Check className="h-2 w-2 text-primary-foreground" />
                            </span>
                          )}
                          <span className="text-2xl leading-none">{opt.emoji}</span>
                          <span className="font-medium leading-tight">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Name */}
                <div className="space-y-2">
                  <Label htmlFor="name">
                    {isCouple ? 'Como vocês querem ser chamados?' : 'Como quer ser chamado(a)?'}
                  </Label>
                  <Input
                    id="name"
                    ref={nameInputRef}
                    placeholder={isCouple ? 'Apelido do casal (ex: Casal SP)' : 'Seu apelido ou nome'}
                    value={formData.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    className={cn(
                      'h-12 rounded-xl text-base sm:h-10 sm:rounded-md sm:text-sm',
                      nameStatus === 'available' && 'border-emerald-500 focus-visible:ring-emerald-500/40',
                      (nameStatus === 'taken' || nameStatus === 'blacklisted') && 'border-destructive focus-visible:ring-destructive/40'
                    )}
                    autoComplete="nickname"
                  />
                  {nameStatus === 'checking' && (
                    <p className="px-1 text-xs text-muted-foreground">Verificando disponibilidade…</p>
                  )}
                  {nameStatus === 'available' && (
                    <p className="px-1 text-xs font-medium text-emerald-600">✓ Nome disponível</p>
                  )}
                  {nameStatus === 'taken' && (
                    <p className="px-1 text-xs font-medium text-destructive">Esse nome já está em uso. Escolha outro.</p>
                  )}
                  {nameStatus === 'blacklisted' && (
                    <p className="px-1 text-xs font-medium text-destructive">Esse nome não está disponível. Escolha outro.</p>
                  )}
                  {nameStatus === 'idle' && (
                    <p className="px-1 text-xs text-muted-foreground/70">
                      É o nome visível no seu perfil. Pode ser apelido — sem sobrenome necessário.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════
                PASSO 2 — E-mail + Senha + Cidade
            ══════════════════════════════════════════════════════════ */}
            {currentStep === 2 && (
              <div className="space-y-4 animate-fade-in">
                <div>
                  <h2 className="text-lg font-semibold">Seu acesso</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    E-mail e senha são privados — nunca aparecem no perfil.
                  </p>
                </div>

                {/* Google Sign-In — fastest path */}
                <GoogleSignInButton
                  label="Cadastrar com Google"
                  gender={formData.gender}
                  name={formData.name}
                  city={formData.city}
                  state={formData.state}
                />

                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">ou cadastre com e-mail</span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
                      value={formData.email}
                      onChange={(e) => updateField('email', e.target.value)}
                      className="h-12 rounded-xl pl-10 text-base sm:h-10 sm:rounded-md sm:text-sm"
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Mínimo 6 caracteres"
                      value={formData.password}
                      onChange={(e) => updateField('password', e.target.value)}
                      className="h-12 rounded-xl pl-10 pr-11 text-base sm:h-10 sm:rounded-md sm:text-sm"
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  <p className="px-1 text-xs text-muted-foreground/70">
                    Sua conta é só sua — nenhuma informação é compartilhada sem permissão.
                  </p>
                </div>

                {/* City — GPS first */}
                <div className="space-y-3">
                  <Label>
                    {isCouple ? 'Onde vocês estão?' : 'Onde você está?'}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">(opcional)</span>
                  </Label>

                  <Button
                    type="button"
                    onClick={handleGpsLocation}
                    disabled={gpsLoading}
                    variant="outline"
                    className="h-12 w-full gap-2 rounded-xl border-primary/40 bg-primary/8 font-medium text-primary hover:bg-primary/15 sm:h-10 sm:rounded-md"
                  >
                    {gpsLoading ? (
                      <>
                        <Locate className="h-5 w-5 animate-spin" />
                        Obtendo localização...
                      </>
                    ) : (
                      <>
                        <MapPin className="h-5 w-5" />
                        Usar minha localização atual
                      </>
                    )}
                  </Button>

                  {formData.city && cityConfirmed ? (
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2.5 animate-fade-in">
                      <MapPin className="h-4 w-4 shrink-0 text-emerald-400" />
                      <span className="text-sm text-muted-foreground">
                        <strong className="text-foreground/80">{formData.city}</strong>
                        {formData.state ? `, ${formData.state}` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => { updateField('city', ''); updateField('state', ''); setCityConfirmed(false); }}
                        className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                      >
                        Alterar
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground/60">
                        <div className="h-px flex-1 bg-border/50" />
                        ou digite manualmente
                        <div className="h-px flex-1 bg-border/50" />
                      </div>
                      <CitySearch
                        value={formData.city}
                        onChange={(val) => { updateField('city', val); setCityConfirmed(false); }}
                        onSelect={(city, state) => {
                          updateField('city', city);
                          updateField('state', state);
                          setCityConfirmed(true);
                        }}
                      />
                    </div>
                  )}

                  <p className="px-1 text-xs text-muted-foreground/70">
                    Usamos sua cidade para mostrar perfis próximos. Pode preencher depois.
                  </p>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════
                PASSO 3 — Termos + Sugestões + Entrar
            ══════════════════════════════════════════════════════════ */}
            {currentStep === 3 && (
              <div className="space-y-5 animate-fade-in">
                <div>
                  <h2 className="text-lg font-semibold">Tudo pronto! 🎉</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Leia e confirme abaixo para liberar seu acesso.
                  </p>
                </div>

                {/* Terms */}
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 p-4 text-sm text-muted-foreground space-y-1.5">
                  <p className="font-medium text-foreground">Antes de entrar</p>
                  <p>
                    O NoSigilo é uma plataforma +18 para interações adultas consensuais, com foco
                    em casais e singles. Ao criar a conta, você confirma que é maior de idade e
                    vai usar a plataforma de forma legal, consensual e respeitosa.
                  </p>
                </div>

                <label
                  htmlFor="terms"
                  className={cn(
                    'flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition-all',
                    formData.acceptTerms
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-secondary/40'
                  )}
                >
                  <div className="relative mt-0.5 shrink-0">
                    <input
                      id="terms"
                      type="checkbox"
                      checked={formData.acceptTerms}
                      onChange={(e) => updateField('acceptTerms', e.target.checked)}
                      className="sr-only"
                    />
                    <div
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-md border-2 transition-all',
                        formData.acceptTerms
                          ? 'border-primary bg-primary'
                          : 'border-border bg-background'
                      )}
                    >
                      {formData.acceptTerms && (
                        <Check className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={3} />
                      )}
                    </div>
                  </div>
                  <span className="text-sm leading-relaxed text-muted-foreground">
                    Tenho 18 anos ou mais e aceito os{' '}
                    <Link
                      to="/terms"
                      className="text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Termos de Uso
                    </Link>{' '}
                    e a{' '}
                    <Link
                      to="/privacy"
                      className="text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Política de Privacidade
                    </Link>
                    . Li as{' '}
                    <Link
                      to="/guidelines"
                      className="text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Diretrizes da Comunidade
                    </Link>
                    .
                  </span>
                </label>

                {/* Submit */}
                <Button
                  type="submit"
                  className="h-14 w-full rounded-xl bg-gradient-primary text-base font-semibold shadow-glow hover:opacity-90 sm:h-12 sm:rounded-md"
                  disabled={isLoading || !formData.acceptTerms}
                >
                  {isLoading ? (
                    loadingLabel
                  ) : (
                    <>
                      Entrar no NoSigilo
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </>
                  )}
                </Button>

                {/* Suggestions (optional favorites) */}
                {(isLoadingSuggestions || suggestions.length > 0) && (
                  <div className="rounded-xl border bg-secondary/30 p-4 space-y-3">
                    <h3 className="font-semibold flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-primary" />
                      Perfis que combinam com {isCouple ? 'vocês' : 'você'}
                    </h3>
                    {isLoadingSuggestions ? (
                      <p className="text-sm text-muted-foreground">Carregando sugestões...</p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2.5">
                        {suggestions.map((u: any) => {
                          const id = String(u.id);
                          const selected = selectedSuggestionIds.includes(id);
                          return (
                            <div
                              key={id}
                              role="button"
                              tabIndex={0}
                              onClick={() =>
                                setSelectedSuggestionIds((prev) =>
                                  prev.includes(id)
                                    ? prev.filter((x) => x !== id)
                                    : [...prev, id]
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ')
                                  setSelectedSuggestionIds((prev) =>
                                    prev.includes(id)
                                      ? prev.filter((x) => x !== id)
                                      : [...prev, id]
                                  );
                              }}
                              className={cn(
                                'cursor-pointer rounded-xl border p-2.5 text-left transition-all',
                                selected
                                  ? 'border-primary bg-primary/10'
                                  : 'border-border hover:bg-secondary/40'
                              )}
                            >
                              <div className="aspect-square overflow-hidden rounded-lg bg-gradient-card mb-2">
                                <img
                                  src={resolveServerUrl(u.avatar)}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              </div>
                              <p className="truncate text-xs font-medium">{u.name}</p>
                              <p className="truncate text-[10px] text-muted-foreground">
                                {u.city ?? ''}
                              </p>
                              <div className="mt-1.5">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 w-full rounded-lg text-xs"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {selected ? '✓ Favoritado' : 'Favoritar'}
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Navigation buttons ──────────────────────────────────── */}
            <div className="mt-6 flex gap-3">
              {currentStep > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  className="h-12 flex-1 rounded-xl sm:h-10 sm:rounded-md"
                  disabled={isLoading}
                >
                  Voltar
                </Button>
              )}
              {currentStep < 3 && (
                <Button
                  type="button"
                  onClick={handleNext}
                  disabled={isLoading}
                  className="h-12 flex-1 rounded-xl bg-gradient-primary hover:opacity-90 gap-2 sm:h-10 sm:rounded-md"
                >
                  {isLoading ? 'Verificando...' : 'Próximo'}
                  {!isLoading && <ArrowRight className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Já tem uma conta?{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

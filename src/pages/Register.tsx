import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useFavorites } from '@/contexts/FavoritesContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User, Mail, Lock, ArrowLeft, ArrowRight, Users, MapPin, Locate } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getApiErrorInfo } from '@/utils/apiError';
import { cn } from '@/lib/utils';
import { onboardingService, authService } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { CitySearch } from '@/components/CitySearch';
import BrandLogo from '@/components/BrandLogo';

const audienceOptions = [
  { value: 'Mulher', label: 'Mulher solteira', hint: 'single feminina', emoji: '👩' },
  { value: 'Homem', label: 'Homem solteiro', hint: 'single masculino', emoji: '👨' },
  { value: 'Casal (Ele/Ela)', label: 'Casal (Ele/Ela)', hint: 'casal hetero', emoji: '👫' },
  { value: 'Casal (Ele/Ele)', label: 'Casal (Ele/Ele)', hint: 'casal masculino', emoji: '👬' },
  { value: 'Casal (Ela/Ela)', label: 'Casal (Ela/Ela)', hint: 'casal feminino', emoji: '👭' },
  { value: 'Transexual', label: 'Pessoa trans', hint: 'perfil individual', emoji: '🏳️‍⚧️' },
  { value: 'Crossdresser (CD)', label: 'Crossdresser (CD)', hint: 'perfil individual', emoji: '✨' },
  { value: 'Travesti', label: 'Travesti', hint: 'perfil individual', emoji: '🌈' },
] as const;

const steps = [
  { id: 1, title: 'Dados Pessoais' },
  { id: 2, title: 'Interesses' },
  { id: 3, title: 'Localização' },
  { id: 4, title: 'Finalizar' },
];

export default function Register() {
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite')?.trim() || '';
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    gender: '',
    city: '',
    state: '',
    lookingFor: [] as string[],
    acceptTerms: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<string[]>([]);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [step2Count, setStep2Count] = useState<number | null>(null);
  const step2Timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { register } = useAuth();
  const { addFavorite } = useFavorites();
  const navigate = useNavigate();
  const { toast } = useToast();

  const genderOptions = useMemo(() => audienceOptions, []);

  const isCouple = formData.gender.toLowerCase().includes('casal');
  const subject = isCouple ? 'Vocês' : 'Você';

  const updateField = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    if (currentStep !== 4) return;
    if (formData.lookingFor.length === 0) return;
    let cancelled = false;
    setIsLoadingSuggestions(true);
    onboardingService
      .getSuggestions({ lookingFor: formData.lookingFor, city: formData.city || undefined, state: formData.state || undefined })
      .then((data) => {
        if (cancelled) return;
        setSuggestions(Array.isArray(data) ? data.filter((u: any) => u.avatar) : []);
      })
      .catch(() => {
        if (cancelled) return;
        setSuggestions([]);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoadingSuggestions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentStep, formData.lookingFor, formData.city, formData.state]);

  useEffect(() => {
    if (currentStep !== 2 || formData.lookingFor.length === 0) {
      setStep2Count(null);
      return;
    }
    if (step2Timer.current) clearTimeout(step2Timer.current);
    step2Timer.current = setTimeout(async () => {
      try {
        const data = await onboardingService.getSuggestions({
          lookingFor: formData.lookingFor,
          city: formData.city || undefined,
          state: formData.state || undefined,
        });
        setStep2Count(Array.isArray(data) ? data.length : null);
      } catch {
        setStep2Count(null);
      }
    }, 600);
    return () => { if (step2Timer.current) clearTimeout(step2Timer.current); };
  }, [currentStep, formData.lookingFor, formData.city, formData.state]);

  const handleGpsLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: 'GPS não disponível', description: 'Seu navegador não suporta geolocalização.', variant: 'destructive' });
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
          const city = geo?.address?.city || geo?.address?.town || geo?.address?.village || '';
          const state = geo?.address?.state_code || geo?.address?.ISO3166_2_lvl4?.replace('BR-', '') || '';
          if (city) updateField('city', city);
          if (state) updateField('state', state.slice(0, 2).toUpperCase());
          if (city) toast({ title: 'Localização obtida', description: `${city}${state ? `, ${state}` : ''}` });
          else toast({ title: 'Cidade não identificada', description: 'Digite manualmente.' });
        } catch {
          toast({ title: 'Erro ao obter cidade', description: 'Tente digitar manualmente.', variant: 'destructive' });
        } finally {
          setGpsLoading(false);
        }
      },
      () => {
        setGpsLoading(false);
        toast({ title: 'Permissão negada', description: 'Ative o GPS ou digite sua cidade manualmente.', variant: 'destructive' });
      }
    );
  };

  const toggleLookingFor = (value: string) => {
    setFormData((prev) => {
      const exists = prev.lookingFor.includes(value);
      return { ...prev, lookingFor: exists ? prev.lookingFor.filter((v) => v !== value) : [...prev.lookingFor, value] };
    });
  };

  const setLookingFor = (value: string, checked: boolean) => {
    setFormData((prev) => {
      const exists = prev.lookingFor.includes(value);
      if (checked && !exists) return { ...prev, lookingFor: [...prev.lookingFor, value] };
      if (!checked && exists) return { ...prev, lookingFor: prev.lookingFor.filter((v) => v !== value) };
      return prev;
    });
  };

  const handleNext = async () => {
    if (currentStep === 1) {
      if (!formData.name.trim()) {
        toast({ title: 'Nome obrigatório', description: 'Por favor, informe seu nome.', variant: 'destructive' });
        return;
      }
      if (!formData.email.trim()) {
        toast({ title: 'E-mail obrigatório', description: 'Por favor, informe seu e-mail.', variant: 'destructive' });
        return;
      }
      
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        toast({ title: 'E-mail inválido', description: 'Por favor, informe um e-mail válido.', variant: 'destructive' });
        return;
      }

      if (!formData.password || formData.password.length < 6) {
        toast({ title: 'Senha muito curta', description: 'A senha deve ter pelo menos 6 caracteres.', variant: 'destructive' });
        return;
      }

      if (!formData.gender) {
        toast({ title: 'Gênero obrigatório', description: 'Por favor, selecione seu gênero.', variant: 'destructive' });
        return;
      }

      try {
        setIsLoading(true);
        const { available } = await authService.checkEmail(formData.email);
        if (!available) {
          toast({ title: 'E-mail em uso', description: 'Este e-mail já está cadastrado. Tente outro.', variant: 'destructive' });
          return;
        }
      } catch (error) {
        toast({ title: 'Erro de validação', description: 'Não foi possível validar o e-mail no momento.', variant: 'destructive' });
        return;
      } finally {
        setIsLoading(false);
      }
    }

    if (currentStep === 2 && formData.lookingFor.length === 0) {
      toast({
        title: 'Selecione ao menos um interesse',
        description: 'Escolha pelo menos uma opção para continuar.',
        variant: 'destructive',
      });
      return;
    }
    if (currentStep < 4) setCurrentStep((s) => s + 1);
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep((s) => s - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.acceptTerms) {
      toast({
        title: 'Termos obrigatórios',
        description: 'Você precisa aceitar os termos de uso.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const createdUser = await register({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        inviteToken,
        gender: formData.gender,
        city: formData.city,
        state: formData.state,
        lookingFor: formData.lookingFor,
      });

      // Save selected favorites
      if (selectedSuggestionIds.length > 0) {
        selectedSuggestionIds.forEach((id) => {
          const user = suggestions.find((s) => String(s.id) === id);
          if (user) {
            addFavorite({
              id: user.id,
              name: user.name,
              avatar: user.avatar,
              addedAt: new Date().toISOString(),
            });
          }
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
      toast({
        title: 'Conta criada',
        description: 'Seu acesso foi liberado com sucesso.',
      });
      navigate('/feed');
    } catch (error) {
      const info = getApiErrorInfo(error, { title: 'Erro ao criar conta', description: 'Tente novamente mais tarde.' });
      toast({
        title: info.title,
        description: info.description,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-start justify-center overflow-x-hidden bg-background p-2 py-3 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-gradient-hero" />

      <div className="relative z-10 w-full max-w-lg min-w-0">
        <Link to="/" className="mb-4 inline-flex min-h-10 items-center gap-2 text-muted-foreground transition-colors hover:text-foreground sm:mb-8">
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Link>

        <div className="glass-strong rounded-2xl p-5 shadow-glow sm:p-8">
          <div className="mb-5 flex min-w-0 items-center gap-3 sm:mb-6">
            <BrandLogo size="md" showText={false} />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold leading-tight">Criar Conta</h1>
              <p className="text-muted-foreground text-sm">Passo {currentStep} de 4</p>
            </div>
          </div>

          <div className="mb-6 flex items-center gap-1.5 sm:mb-8 sm:gap-2">
            {steps.map((step, idx) => (
              <div key={step.id} className="flex items-center flex-1">
                <div
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-all sm:h-8 sm:w-8',
                    currentStep >= step.id ? 'bg-gradient-primary text-primary-foreground shadow-glow' : 'bg-secondary text-muted-foreground'
                  )}
                >
                  {step.id}
                </div>
                {idx < steps.length - 1 && (
                  <div className={cn('mx-1.5 h-1 flex-1 rounded-full transition-all sm:mx-2', currentStep > step.id ? 'bg-primary' : 'bg-secondary')} />
                )}
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit}>
            {currentStep === 1 && (
              <div className="space-y-4 animate-fade-in">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input id="name" placeholder="Seu nome" value={formData.name} onChange={(e) => updateField('name', e.target.value)} className="h-12 rounded-xl pl-10 text-base sm:h-10 sm:rounded-md sm:text-sm" required />
                  </div>
                  <p className="text-xs text-muted-foreground/70 px-1">É o nome que as pessoas vão ver no seu perfil. Pode ser apelido.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
                      value={formData.email}
                      onChange={(e) => updateField('email', e.target.value)}
                      className="h-12 rounded-xl pl-10 text-base sm:h-10 sm:rounded-md sm:text-sm"
                      required
                    />
                  </div>
                  <p className="text-xs text-muted-foreground/70 px-1">Usado apenas para login. Nunca aparece no seu perfil público.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={formData.password}
                      onChange={(e) => updateField('password', e.target.value)}
                      className="h-12 rounded-xl pl-10 text-base sm:h-10 sm:rounded-md sm:text-sm"
                      required
                    />
                  </div>
                  <p className="text-xs text-muted-foreground/70 px-1">Mínimo 6 caracteres. Sua conta é só sua.</p>
                </div>

                <div className="space-y-2">
                  <Label>Como você se identifica?</Label>
                  <Select value={formData.gender} onValueChange={(v) => updateField('gender', v)}>
                    <SelectTrigger className="h-12 rounded-xl text-base sm:h-10 sm:rounded-md sm:text-sm">
                      <SelectValue placeholder="Escolha o tipo do seu perfil" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[50dvh]">
                      {genderOptions.map((g) => (
                        <SelectItem key={g.value} value={g.value}>
                          {g.emoji} {g.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground/70 px-1">Isso define como outros perfis vão te encontrar nos resultados.</p>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center justify-between gap-3">
                  <Label>{subject} querem conhecer...</Label>
                  <span className="text-xs text-muted-foreground">{formData.lookingFor.length} selecionado(s)</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Escolha os tipos de perfil que mais combinam com {isCouple ? 'vocês' : 'você'}. Pode marcar mais de um.
                </p>
                {step2Count !== null && formData.lookingFor.length > 0 && (
                  <div className="rounded-xl bg-primary/10 border border-primary/20 px-4 py-2.5 flex items-center gap-2 animate-fade-in">
                    <span className="text-primary text-lg font-bold">{step2Count > 0 ? `+${step2Count}` : '0'}</span>
                    <span className="text-sm text-muted-foreground">
                      perfis ativos correspondem às suas preferências
                      {formData.city ? ` em ${formData.city}` : ' na plataforma'}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 sm:grid-cols-3">
                  {genderOptions.map((opt) => {
                    const selected = formData.lookingFor.includes(opt.value);
                    return (
                      <div
                        key={opt.value}
                        onClick={() => setLookingFor(opt.value, !selected)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') setLookingFor(opt.value, !selected);
                        }}
                        className={cn(
                          'relative min-h-[92px] overflow-hidden rounded-xl border p-3.5 text-left transition-all sm:p-4',
                          selected ? 'border-primary bg-primary/10 shadow-glow' : 'border-border hover:bg-secondary/40'
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium leading-tight">{opt.label}</p>
                            <p className="text-xs text-muted-foreground mt-1">{opt.hint}</p>
                          </div>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(e) => setLookingFor(opt.value, e.target.checked)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4 w-4 accent-primary"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-4 animate-fade-in">
                <div className="space-y-1">
                  <Label htmlFor="city">{subject} estão em...</Label>
                  <p className="text-sm text-muted-foreground">
                    Usamos sua cidade para mostrar perfis próximos — <strong className="text-foreground/70">quanto mais perto, mais conexões</strong>.
                  </p>
                </div>

                {/* GPS Button — prominent */}
                <Button
                  type="button"
                  onClick={handleGpsLocation}
                  disabled={gpsLoading}
                  className="w-full h-12 rounded-xl bg-primary/15 hover:bg-primary/25 border border-primary/40 text-primary font-medium gap-2 transition-all sm:h-10 sm:rounded-md"
                  variant="outline"
                >
                  {gpsLoading ? (
                    <>
                      <Locate className="w-5 h-5 animate-spin" />
                      Obtendo localização...
                    </>
                  ) : (
                    <>
                      <MapPin className="w-5 h-5" />
                      Usar minha localização atual
                    </>
                  )}
                </Button>

                <div className="flex items-center gap-3 text-xs text-muted-foreground/60">
                  <div className="h-px flex-1 bg-border/50" />
                  ou digite manualmente
                  <div className="h-px flex-1 bg-border/50" />
                </div>

                <div className="space-y-2">
                  <CitySearch
                    value={formData.city}
                    onChange={(val) => updateField('city', val)}
                    onSelect={(city, state) => {
                      updateField('city', city);
                      updateField('state', state);
                    }}
                  />
                </div>

                <div className="grid gap-4 min-[380px]:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="state">Estado (UF)</Label>
                    <Input
                      id="state"
                      placeholder="SP"
                      value={formData.state}
                      onChange={(e) => updateField('state', e.target.value.toUpperCase().slice(0, 2))}
                      className="h-12 rounded-xl text-base uppercase sm:h-10 sm:rounded-md sm:text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>&nbsp;</Label>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 w-full rounded-xl sm:h-10 sm:rounded-md"
                      onClick={() => {
                        updateField('city', '');
                        updateField('state', '');
                      }}
                    >
                      Preencher depois
                    </Button>
                  </div>
                </div>

                {formData.city && (
                  <div className="rounded-xl bg-green-500/10 border border-green-500/20 px-4 py-2.5 flex items-center gap-2 animate-fade-in">
                    <MapPin className="w-4 h-4 text-green-400 shrink-0" />
                    <span className="text-sm text-muted-foreground">
                      Mostrando perfis ativos em <strong className="text-foreground/80">{formData.city}{formData.state ? `, ${formData.state}` : ''}</strong>
                    </span>
                  </div>
                )}
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-5 animate-fade-in sm:space-y-6">
                <div className="rounded-xl border bg-secondary/30 p-4 space-y-4 sm:p-6">
                  <h3 className="font-semibold text-lg">Quase lá! Só confirmar e você entra 🎉</h3>
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm text-muted-foreground space-y-2 sm:p-4">
                    <p className="font-medium text-foreground">Antes de entrar</p>
                    <p>O NoSigilo é uma plataforma +18 para interações adultas consensuais, com foco principal em casais e singles femininos e masculinos.</p>
                    <p>Ao criar a conta, você confirma que é maior de idade e concorda em respeitar privacidade, consentimento, discrição e as regras da comunidade.</p>
                  </div>
                  <div className="space-y-4">
                    <label
                      htmlFor="terms"
                      className={cn(
                        'flex items-start gap-4 rounded-xl border p-4 cursor-pointer transition-all',
                        formData.acceptTerms ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary/40'
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
                        <div className={cn(
                          'h-6 w-6 rounded-md border-2 flex items-center justify-center transition-all',
                          formData.acceptTerms ? 'bg-primary border-primary' : 'border-border bg-background'
                        )}>
                          {formData.acceptTerms && (
                            <svg className="w-3.5 h-3.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </div>
                      <span className="text-sm text-muted-foreground leading-relaxed">
                        Tenho 18 anos ou mais e aceito os{' '}
                        <Link to="/terms" className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                          Termos de Uso
                        </Link>{' '}
                        e a{' '}
                        <Link to="/privacy" className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                          Política de Privacidade
                        </Link>
                        . Li as{' '}
                        <Link to="/guidelines" className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                          Diretrizes da Comunidade
                        </Link>{' '}
                        e vou usar a plataforma de forma legal, consensual e respeitosa.
                      </span>
                    </label>

                    <Button type="submit" className="h-14 w-full rounded-xl bg-gradient-primary shadow-glow hover:opacity-90 text-base font-semibold gap-2 sm:h-12 sm:rounded-md" disabled={isLoading || !formData.acceptTerms}>
                      {isLoading ? 'Criando sua conta...' : (
                        <>
                          Entrar no NoSigilo
                          <ArrowRight className="w-5 h-5" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border bg-secondary/30 p-4 space-y-4 sm:p-6">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    Conheçam novas pessoas!
                  </h3>
                  <p className="text-sm text-muted-foreground">Com base nas preferências escolhidas, priorizamos sugestões de perfis mais alinhados ao público principal da plataforma para {subject.toLowerCase()}:</p>
                  {isLoadingSuggestions && <p className="text-sm text-muted-foreground">Carregando sugestões...</p>}
                  {!isLoadingSuggestions && suggestions.length === 0 && <p className="text-sm text-muted-foreground">Sem sugestões por enquanto. Você pode continuar.</p>}
                  {!isLoadingSuggestions && suggestions.length > 0 && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {suggestions.map((u: any) => {
                        const id = String(u.id);
                        const selected = selectedSuggestionIds.includes(id);
                        return (
                          <div
                            key={id}
                            onClick={() => setSelectedSuggestionIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                setSelectedSuggestionIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
                              }
                            }}
                            className={cn('rounded-xl border p-3 text-left transition-all', selected ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary/40')}
                          >
                            <div
                              className={cn(
                                'aspect-square rounded-lg bg-gradient-card mb-2 overflow-hidden',
                                u.isPremium ? 'ring-2 ring-gold/60' : ''
                              )}
                            >
                              {u.avatar ? (
                                <img src={resolveServerUrl(u.avatar)} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">{String(u.name || 'U')[0]}</div>
                              )}
                            </div>
                            <p className="font-medium truncate">{u.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{u.city ? `${u.city}${u.state ? `, ${u.state}` : ''}` : ''}</p>
                            <div className="mt-2">
                              <Button type="button" variant="outline" size="sm" className="h-9 w-full rounded-lg" onClick={(e) => e.stopPropagation()}>
                                {selected ? 'Selecionado' : 'Favoritar'}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="mt-6 flex gap-3 sm:mt-8">
              {currentStep > 1 && (
                <Button type="button" variant="outline" onClick={handleBack} className="h-12 flex-1 rounded-xl sm:h-10 sm:rounded-md">
                  Voltar
                </Button>
              )}

              {currentStep < 4 ? (
                <Button 
                  type="button" 
                  onClick={handleNext} 
                  disabled={isLoading}
                  className="h-12 flex-1 rounded-xl bg-gradient-primary hover:opacity-90 gap-2 sm:h-10 sm:rounded-md"
                >
                  {isLoading ? 'Verificando...' : 'Próximo'}
                  {!isLoading && <ArrowRight className="w-4 h-4" />}
                </Button>
              ) : null}
            </div>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Já tem uma conta?{' '}
            <Link to="/login" className="text-primary hover:underline font-medium">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

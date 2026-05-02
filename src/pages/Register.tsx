import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useFavorites } from '@/contexts/FavoritesContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User, Mail, Lock, ArrowLeft, ArrowRight, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getApiErrorInfo } from '@/utils/apiError';
import { cn } from '@/lib/utils';
import { onboardingService, authService } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { CitySearch } from '@/components/CitySearch';
import BrandLogo from '@/components/BrandLogo';

const audienceOptions = [
  { value: 'Mulher', label: 'Mulher solteira', hint: 'single feminino' },
  { value: 'Homem', label: 'Homem solteiro', hint: 'single masculino' },
  { value: 'Casal (Ele/Ela)', label: 'Casal (Ele/Ela)', hint: 'casal hetero' },
  { value: 'Casal (Ele/Ele)', label: 'Casal (Ele/Ele)', hint: 'casal masculino' },
  { value: 'Casal (Ela/Ela)', label: 'Casal (Ela/Ela)', hint: 'casal feminino' },
  { value: 'Transexual', label: 'Pessoa trans', hint: 'perfil individual' },
  { value: 'Crossdresser (CD)', label: 'Crossdresser (CD)', hint: 'perfil individual' },
  { value: 'Travesti', label: 'Travesti', hint: 'perfil individual' },
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
        setSuggestions(Array.isArray(data) ? data : []);
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
                </div>

                <div className="space-y-2">
                  <Label>Meu perfil principal</Label>
                  <Select value={formData.gender} onValueChange={(v) => updateField('gender', v)}>
                    <SelectTrigger className="h-12 rounded-xl text-base sm:h-10 sm:rounded-md sm:text-sm">
                      <SelectValue placeholder="Selecione como seu perfil será exibido" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[50dvh]">
                      {genderOptions.map((g) => (
                        <SelectItem key={g.value} value={g.value}>
                          {g.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center justify-between gap-3">
                  <Label>{subject} querem conhecer mais</Label>
                  <span className="text-xs text-muted-foreground">{formData.lookingFor.length} selecionado(s)</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Priorizamos principalmente casais, mulheres solteiras e homens solteiros com base no perfil que mais combina com {isCouple ? 'vocês' : 'você'}.
                </p>

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
                  <p className="text-sm text-muted-foreground">Usaremos seu local para sugerir pessoas interessantes na sua cidade</p>
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
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-5 animate-fade-in sm:space-y-6">
                <div className="rounded-xl border bg-secondary/30 p-4 space-y-4 sm:p-6">
                  <h3 className="font-semibold">Só falta criar o seu acesso</h3>
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm text-muted-foreground space-y-2 sm:p-4">
                    <p className="font-medium text-foreground">Antes de continuar</p>
                    <p>O NoSigilo é uma plataforma +18 para interações adultas consensuais, com foco principal em casais e singles femininos e masculinos.</p>
                    <p>Ao criar a conta, você confirma que é maior de idade e concorda em respeitar privacidade, consentimento, discrição e as regras da comunidade.</p>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-start space-x-3">
                      <input
                        id="terms"
                        type="checkbox"
                        checked={formData.acceptTerms}
                        onChange={(e) => updateField('acceptTerms', e.target.checked)}
                        className="mt-1 h-5 w-5 shrink-0 accent-primary"
                      />
                      <label htmlFor="terms" className="text-sm text-muted-foreground leading-relaxed">
                        Declaro que tenho 18 anos ou mais e aceito os{' '}
                        <Link to="/terms" className="text-primary hover:underline">
                          Termos de Uso
                        </Link>{' '}
                        e a{' '}
                        <Link to="/privacy" className="text-primary hover:underline">
                          Política de Privacidade
                        </Link>
                        , li as{' '}
                        <Link to="/guidelines" className="text-primary hover:underline">
                          Diretrizes da Comunidade
                        </Link>{' '}
                        e concordo em usar a plataforma apenas para interações adultas legais, consensuais e respeitosas.
                        .
                      </label>
                    </div>

                    <Button type="submit" className="h-12 w-full rounded-xl bg-gradient-primary shadow-glow hover:opacity-90 sm:h-10 sm:rounded-md" disabled={isLoading || !formData.acceptTerms}>
                      {isLoading ? 'Criando...' : 'Concluir cadastro'}
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

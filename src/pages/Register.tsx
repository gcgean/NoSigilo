import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useFavorites } from '@/contexts/FavoritesContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, User, Mail, Lock, MapPin, ArrowLeft, ArrowRight, LocateFixed, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getApiErrorInfo } from '@/utils/apiError';
import { cn } from '@/lib/utils';
import { locationService, onboardingService, authService } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { CitySearch } from '@/components/CitySearch';

const steps = [
  { id: 1, title: 'Dados Pessoais' },
  { id: 2, title: 'Interesses' },
  { id: 3, title: 'Localização' },
  { id: 4, title: 'Finalizar' },
];

export default function Register() {
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
  const [authMethod, setAuthMethod] = useState<'email' | 'google'>('email');

  const { register } = useAuth();
  const { addFavorite } = useFavorites();
  const navigate = useNavigate();
  const { toast } = useToast();

  const genderOptions = useMemo(
    () => [
      'Homem',
      'Mulher',
      'Casal (Ele/Ela)',
      'Casal (Ele/Ele)',
      'Casal (Ela/Ela)',
      'Transexual',
      'Crossdresser (CD)',
      'Travesti',
    ],
    []
  );

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
      await register({
        name: formData.name,
        email: formData.email,
        password: formData.password,
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
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gradient-hero" />

      <div className="relative z-10 w-full max-w-lg">
        <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Link>

        <div className="glass-strong rounded-2xl p-8 shadow-glow">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
              <Sparkles className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Criar Conta</h1>
              <p className="text-muted-foreground text-sm">Passo {currentStep} de 4</p>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-8">
            {steps.map((step, idx) => (
              <div key={step.id} className="flex items-center flex-1">
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all',
                    currentStep >= step.id ? 'bg-gradient-primary text-primary-foreground shadow-glow' : 'bg-secondary text-muted-foreground'
                  )}
                >
                  {step.id}
                </div>
                {idx < steps.length - 1 && (
                  <div className={cn('flex-1 h-1 mx-2 rounded-full transition-all', currentStep > step.id ? 'bg-primary' : 'bg-secondary')} />
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
                    <Input id="name" placeholder="Seu nome" value={formData.name} onChange={(e) => updateField('name', e.target.value)} className="pl-10" required />
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
                      className="pl-10"
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
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Eu sou</Label>
                  <Select value={formData.gender} onValueChange={(v) => updateField('gender', v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione seu gênero" />
                    </SelectTrigger>
                    <SelectContent>
                      {genderOptions.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
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
                  <Label>{subject} têm interesse em</Label>
                  <span className="text-xs text-muted-foreground">{formData.lookingFor.length} selecionado(s)</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {genderOptions.map((opt) => {
                    const selected = formData.lookingFor.includes(opt);
                    return (
                      <div
                        key={opt}
                        onClick={() => setLookingFor(opt, !selected)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') setLookingFor(opt, !selected);
                        }}
                        className={cn(
                          'relative overflow-hidden rounded-xl border p-4 text-left transition-all',
                          selected ? 'border-primary bg-primary/10 shadow-glow' : 'border-border hover:bg-secondary/40'
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-medium leading-tight">{opt}</p>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(e) => setLookingFor(opt, e.target.checked)}
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="state">Estado (UF)</Label>
                    <Input
                      id="state"
                      placeholder="SP"
                      value={formData.state}
                      onChange={(e) => updateField('state', e.target.value.toUpperCase().slice(0, 2))}
                      className="uppercase"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>&nbsp;</Label>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
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
              <div className="space-y-6 animate-fade-in">
                <div className="p-6 rounded-xl bg-secondary/30 border space-y-4">
                  <h3 className="font-semibold">Só falta criar o seu acesso</h3>
                  <div className="space-y-3">
                    <Button
                      type="button"
                      variant={authMethod === 'google' ? 'default' : 'outline'}
                      className={cn('w-full justify-start', authMethod === 'google' && 'bg-gradient-primary')}
                      onClick={() => {
                        setAuthMethod('google');
                        toast({ title: 'Google em breve', description: 'Login com Google ainda não está ativo no backend.' });
                      }}
                    >
                      Continuar com o Google
                    </Button>
                    <Button
                      type="button"
                      variant={authMethod === 'email' ? 'default' : 'outline'}
                      className={cn('w-full justify-start', authMethod === 'email' && 'bg-gradient-primary')}
                      onClick={() => setAuthMethod('email')}
                    >
                      Continuar com e-mail e senha
                    </Button>
                  </div>

                  {authMethod === 'email' ? (
                    <div className="pt-4 border-t space-y-4">
                      <div className="p-4 rounded-xl bg-background/40 border space-y-2">
                        <h4 className="font-semibold">Resumo do Cadastro</h4>
                        <div className="space-y-1 text-sm">
                          <p>
                            <span className="text-muted-foreground">Nome:</span> {formData.name}
                          </p>
                          <p>
                            <span className="text-muted-foreground">E-mail:</span> {formData.email}
                          </p>
                          <p>
                            <span className="text-muted-foreground">Local:</span> {formData.city}
                            {formData.state ? `, ${formData.state}` : ''}
                          </p>
                          <p>
                            <span className="text-muted-foreground">Interesses:</span> {formData.lookingFor.join(', ')}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start space-x-3">
                        <input
                          id="terms"
                          type="checkbox"
                          checked={formData.acceptTerms}
                          onChange={(e) => updateField('acceptTerms', e.target.checked)}
                          className="mt-1 h-4 w-4 accent-primary"
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
                          .
                        </label>
                      </div>

                      <Button type="submit" className="w-full bg-gradient-primary hover:opacity-90 shadow-glow" disabled={isLoading || !formData.acceptTerms}>
                        {isLoading ? 'Criando...' : 'Concluir cadastro'}
                      </Button>
                    </div>
                  ) : null}
                </div>

                <div className="p-6 rounded-xl bg-secondary/30 border space-y-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    Conheçam novas pessoas!
                  </h3>
                  <p className="text-sm text-muted-foreground">Baseado em suas preferências, encontramos alguns perfis para {subject.toLowerCase()} seguirem:</p>
                  {isLoadingSuggestions && <p className="text-sm text-muted-foreground">Carregando sugestões...</p>}
                  {!isLoadingSuggestions && suggestions.length === 0 && <p className="text-sm text-muted-foreground">Sem sugestões por enquanto. Você pode continuar.</p>}
                  {!isLoadingSuggestions && suggestions.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
                              <Button type="button" variant="outline" size="sm" className="w-full" onClick={(e) => e.stopPropagation()}>
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

            <div className="flex gap-3 mt-8">
              {currentStep > 1 && (
                <Button type="button" variant="outline" onClick={handleBack} className="flex-1">
                  Voltar
                </Button>
              )}

              {currentStep < 4 ? (
                <Button 
                  type="button" 
                  onClick={handleNext} 
                  disabled={isLoading}
                  className="flex-1 bg-gradient-primary hover:opacity-90 gap-2"
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

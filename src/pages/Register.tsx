import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, User, Mail, Lock, Calendar, MapPin, ArrowLeft, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const steps = [
  { id: 1, title: 'Dados Pessoais' },
  { id: 2, title: 'Localização' },
  { id: 3, title: 'Finalizar' },
];

export default function Register() {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    birthDate: '',
    gender: '',
    city: '',
    state: '',
    acceptTerms: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const updateField = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    if (currentStep < 3) setCurrentStep(currentStep + 1);
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
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
        birthDate: formData.birthDate,
        gender: formData.gender,
        city: formData.city,
        state: formData.state,
      });
      navigate('/feed');
    } catch (error) {
      toast({
        title: 'Erro ao criar conta',
        description: 'Tente novamente mais tarde.',
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
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
              <Sparkles className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Criar Conta</h1>
              <p className="text-muted-foreground text-sm">Passo {currentStep} de 3</p>
            </div>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-2 mb-8">
            {steps.map((step, idx) => (
              <div key={step.id} className="flex items-center flex-1">
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all",
                    currentStep >= step.id
                      ? "bg-gradient-primary text-primary-foreground shadow-glow"
                      : "bg-secondary text-muted-foreground"
                  )}
                >
                  {step.id}
                </div>
                {idx < steps.length - 1 && (
                  <div className={cn(
                    "flex-1 h-1 mx-2 rounded-full transition-all",
                    currentStep > step.id ? "bg-primary" : "bg-secondary"
                  )} />
                )}
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit}>
            {/* Step 1: Personal Data */}
            {currentStep === 1 && (
              <div className="space-y-4 animate-fade-in">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="name"
                      placeholder="Seu nome"
                      value={formData.name}
                      onChange={(e) => updateField('name', e.target.value)}
                      className="pl-10"
                      required
                    />
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="birthDate">Data de Nascimento</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        id="birthDate"
                        type="date"
                        value={formData.birthDate}
                        onChange={(e) => updateField('birthDate', e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Gênero</Label>
                    <Select value={formData.gender} onValueChange={(v) => updateField('gender', v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Homem</SelectItem>
                        <SelectItem value="female">Mulher</SelectItem>
                        <SelectItem value="other">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Location */}
            {currentStep === 2 && (
              <div className="space-y-4 animate-fade-in">
                <div className="space-y-2">
                  <Label htmlFor="state">Estado</Label>
                  <Select value={formData.state} onValueChange={(v) => updateField('state', v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione seu estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SP">São Paulo</SelectItem>
                      <SelectItem value="RJ">Rio de Janeiro</SelectItem>
                      <SelectItem value="MG">Minas Gerais</SelectItem>
                      <SelectItem value="RS">Rio Grande do Sul</SelectItem>
                      <SelectItem value="PR">Paraná</SelectItem>
                      <SelectItem value="SC">Santa Catarina</SelectItem>
                      <SelectItem value="BA">Bahia</SelectItem>
                      <SelectItem value="GO">Goiás</SelectItem>
                      <SelectItem value="DF">Distrito Federal</SelectItem>
                      <SelectItem value="CE">Ceará</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="city">Cidade</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="city"
                      placeholder="Sua cidade"
                      value={formData.city}
                      onChange={(e) => updateField('city', e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-secondary/50 border">
                  <p className="text-sm text-muted-foreground">
                    Sua localização ajuda a encontrar pessoas próximas a você.
                    Você pode alterar isso a qualquer momento.
                  </p>
                </div>
              </div>
            )}

            {/* Step 3: Finalize */}
            {currentStep === 3 && (
              <div className="space-y-6 animate-fade-in">
                <div className="p-6 rounded-xl bg-secondary/30 border space-y-4">
                  <h3 className="font-semibold">Resumo do Cadastro</h3>
                  <div className="space-y-2 text-sm">
                    <p><span className="text-muted-foreground">Nome:</span> {formData.name}</p>
                    <p><span className="text-muted-foreground">E-mail:</span> {formData.email}</p>
                    <p><span className="text-muted-foreground">Local:</span> {formData.city}, {formData.state}</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="terms"
                    checked={formData.acceptTerms}
                    onCheckedChange={(checked) => updateField('acceptTerms', checked as boolean)}
                  />
                  <label htmlFor="terms" className="text-sm text-muted-foreground leading-relaxed">
                    Declaro que tenho 18 anos ou mais e aceito os{' '}
                    <Link to="/terms" className="text-primary hover:underline">Termos de Uso</Link>
                    {' '}e a{' '}
                    <Link to="/privacy" className="text-primary hover:underline">Política de Privacidade</Link>.
                  </label>
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex gap-3 mt-8">
              {currentStep > 1 && (
                <Button type="button" variant="outline" onClick={handleBack} className="flex-1">
                  Voltar
                </Button>
              )}
              
              {currentStep < 3 ? (
                <Button type="button" onClick={handleNext} className="flex-1 bg-gradient-primary hover:opacity-90 gap-2">
                  Próximo
                  <ArrowRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button 
                  type="submit" 
                  className="flex-1 bg-gradient-primary hover:opacity-90 shadow-glow"
                  disabled={isLoading || !formData.acceptTerms}
                >
                  {isLoading ? 'Criando...' : 'Criar Conta'}
                </Button>
              )}
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

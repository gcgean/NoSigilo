import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Sparkles, ShieldCheck, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { authService } from '@/services/api';
import { getApiErrorInfo } from '@/utils/apiError';

function useQueryEmail() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const email = params.get('email');
  return email && email.trim().length > 0 ? email.trim() : '';
}

export default function ForgotPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [step, setStep] = useState<'request' | 'confirm'>('request');
  const queryEmail = useQueryEmail();

  useEffect(() => {
    const storedEmail = sessionStorage.getItem('nosigilo_login_email') || '';
    const initial = queryEmail || storedEmail;
    if (initial) setEmail(initial);
  }, [queryEmail]);

  const submitRequestCode = async () => {
    setIsLoading(true);
    try {
      sessionStorage.setItem('nosigilo_login_email', email);
      const response = await authService.requestPasswordResetCode(email);
      setStep('confirm');
      toast({
        title: 'Codigo enviado',
        description: response?.previewCode
          ? `Codigo de desenvolvimento: ${response.previewCode}`
          : 'Enviamos um codigo para o seu e-mail. Digite-o abaixo para trocar a senha.',
      });
    } catch (error) {
      const info = getApiErrorInfo(error, {
        title: 'Nao foi possivel enviar o codigo',
        description: 'Tente novamente em instantes.',
      });
      toast({
        title: info.title,
        description: info.description,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitRequestCode();
  };

  const handleResendCode = async () => {
    await submitRequestCode();
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({
        title: 'As senhas nao conferem',
        description: 'Digite a mesma senha nos dois campos.',
        variant: 'destructive',
      });
      return;
    }
    setIsLoading(true);
    try {
      await authService.confirmPasswordReset({ email, code, newPassword });
      toast({
        title: 'Senha atualizada',
        description: 'Agora voce ja pode entrar com a nova senha.',
      });
      navigate(`/login?email=${encodeURIComponent(email)}`);
    } catch (error) {
      const info = getApiErrorInfo(error, {
        title: 'Nao foi possivel trocar a senha',
        description: 'Confira o codigo e tente novamente.',
      });
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
    <div className="min-h-screen bg-background flex">
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:px-8 py-12">
        <div className="w-full max-w-md mx-auto">
          <Link to="/login" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Link>

          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
              <Sparkles className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Recuperar senha</h1>
              <p className="text-muted-foreground">
                {step === 'request' ? 'Receba um codigo por e-mail para trocar sua senha' : 'Digite o codigo e escolha sua nova senha'}
              </p>
            </div>
          </div>

          {step === 'request' ? (
            <form onSubmit={handleRequestCode} className="space-y-6">
              <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm text-muted-foreground">
                O sistema envia um codigo de 6 digitos para o seu e-mail. Depois voce digita esse codigo aqui e define a nova senha.
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => {
                      const v = e.target.value;
                      setEmail(v);
                      sessionStorage.setItem('nosigilo_login_email', v);
                    }}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full bg-gradient-primary hover:opacity-90 shadow-glow py-6" disabled={isLoading}>
                {isLoading ? 'Enviando codigo...' : 'Enviar codigo'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleConfirmReset} className="space-y-6">
              <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm text-muted-foreground space-y-2">
                <div className="flex items-center gap-2 text-foreground font-medium">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  Codigo enviado para {email}
                </div>
                <p>Digite o codigo recebido e escolha a nova senha da conta.</p>
                <button type="button" className="text-primary hover:underline" onClick={() => setStep('request')}>
                  Alterar e-mail
                </button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="code">Codigo</Label>
                <div className="relative">
                  <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="pl-10 tracking-[0.35em]"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">Nova senha</Label>
                <div className="relative">
                  <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="newPassword"
                    type="password"
                    placeholder="Nova senha"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
                <div className="relative">
                  <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Repita a nova senha"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Button type="button" variant="outline" className="py-6" onClick={handleResendCode} disabled={isLoading}>
                  Reenviar codigo
                </Button>
                <Button type="submit" className="bg-gradient-primary hover:opacity-90 shadow-glow py-6" disabled={isLoading}>
                  {isLoading ? 'Salvando...' : 'Trocar senha'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

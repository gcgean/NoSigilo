import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Lock, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getApiErrorInfo } from '@/utils/apiError';
import BrandLogo from '@/components/BrandLogo';
import { getLastAuthRoute } from '@/utils/sessionNavigation';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    const storedEmail = sessionStorage.getItem('nosigilo_login_email');
    if (storedEmail && typeof storedEmail === 'string') {
      setEmail(storedEmail);
    }
  }, []);

  if (isAuthenticated) {
    const from = (location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null)?.from;
    const target = from?.pathname
      ? `${from.pathname}${from.search || ''}${from.hash || ''}`
      : getLastAuthRoute('/feed');
    return <Navigate to={target} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const loggedUser = await login(email, password);
      const pendingReadyEmail = sessionStorage.getItem('nosigilo_first_access_ready');
      if (pendingReadyEmail && pendingReadyEmail === email) {
        localStorage.setItem(
          `nosigilo:first-access-flow:${loggedUser.id}`,
          JSON.stringify({
            needsPhoto: !loggedUser?.avatar,
            needsPost: true,
            startedAt: new Date().toISOString(),
          })
        );
        sessionStorage.removeItem('nosigilo_first_access_ready');
      }
      const from = (location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null)?.from;
      const target = from?.pathname
        ? `${from.pathname}${from.search || ''}${from.hash || ''}`
        : getLastAuthRoute('/feed');
      navigate(target, { replace: true });
    } catch (error) {
      const info = getApiErrorInfo(error, { title: 'Erro ao entrar', description: 'Não foi possível entrar na sua conta.' });
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
      {/* Left Side - Form */}
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:px-8 py-12">
        <div className="w-full max-w-md mx-auto">
          <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Link>

          <div className="flex items-center gap-3 mb-8">
            <BrandLogo size="md" showText={false} />
            <div>
              <h1 className="text-2xl font-bold">Bem-vindo de volta</h1>
              <p className="text-muted-foreground">Entre na sua conta</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
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

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <Link
                to={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`}
                className="text-primary hover:underline"
              >
                Esqueceu a senha?
              </Link>
            </div>

            <Button 
              type="submit" 
              className="w-full bg-gradient-primary hover:opacity-90 shadow-glow py-6"
              disabled={isLoading}
            >
              {isLoading ? 'Entrando...' : 'Entrar'}
            </Button>

          </form>

          <p className="mt-8 text-center text-muted-foreground">
            Não tem uma conta?{' '}
            <Link to="/register" className="text-primary hover:underline font-medium">
              Criar conta
            </Link>
          </p>
        </div>
      </div>

      {/* Right Side - Visual */}
      <div className="hidden lg:flex flex-1 bg-gradient-hero relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-primary/30 rounded-full blur-3xl animate-float" />
          <div className="absolute bottom-1/4 right-1/3 w-72 h-72 bg-rose/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '-3s' }} />
        </div>
        
        <div className="relative z-10 flex flex-col items-center justify-center p-12 text-center">
          <BrandLogo size="xl" className="mb-8 flex-col gap-5" textClassName="text-4xl" />
          <p className="text-xl text-muted-foreground max-w-md">
            Encontre conexões reais com pessoas que compartilham seus interesses.
          </p>
        </div>
      </div>
    </div>
  );
}

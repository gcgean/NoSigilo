import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

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
  const queryEmail = useQueryEmail();

  useEffect(() => {
    const storedEmail = sessionStorage.getItem('nosigilo_login_email') || '';
    const initial = queryEmail || storedEmail;
    if (initial) setEmail(initial);
  }, [queryEmail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      sessionStorage.setItem('nosigilo_login_email', email);
      toast({
        title: 'Verifique seu e-mail',
        description: 'Se existir uma conta para esse e-mail, enviaremos instruções de recuperação.',
      });
      navigate('/login');
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
              <p className="text-muted-foreground">Informe seu e-mail para receber instruções</p>
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

            <Button type="submit" className="w-full bg-gradient-primary hover:opacity-90 shadow-glow py-6" disabled={isLoading}>
              {isLoading ? 'Enviando...' : 'Enviar instruções'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}


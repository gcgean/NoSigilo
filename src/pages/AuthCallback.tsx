import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const token = searchParams.get('token');
    
    if (token) {
      // Store token from OAuth callback
      localStorage.setItem('token', token);
      navigate('/feed', { replace: true });
    } else {
      // No token, redirect to login
      navigate('/login', { replace: true });
    }
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-glow animate-pulse">
          <Sparkles className="w-10 h-10 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Autenticando...</h1>
        <p className="text-muted-foreground">Por favor, aguarde enquanto finalizamos seu login.</p>
      </div>
    </div>
  );
}

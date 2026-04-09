import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import BrandLogo from '@/components/BrandLogo';

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
        <div className="mb-6 flex justify-center animate-pulse">
          <BrandLogo size="lg" showText={false} />
        </div>
        <h1 className="text-2xl font-bold mb-2">Autenticando...</h1>
        <p className="text-muted-foreground">Por favor, aguarde enquanto finalizamos seu login.</p>
      </div>
    </div>
  );
}

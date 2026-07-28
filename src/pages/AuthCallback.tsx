import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import BrandLogo from '@/components/BrandLogo';
import { authService } from '@/services/api';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const token = searchParams.get('token');
    const isNew = searchParams.get('new') === '1';
    const error = searchParams.get('error');

    if (error) {
      const messages: Record<string, string> = {
        oauth_cancelled:       'Login com Google cancelado.',
        account_banned:        'Esta conta foi suspensa.',
        account_deactivated:   'Esta conta foi desativada.',
        token_exchange_failed: 'Erro ao autenticar com Google. Tente novamente.',
        oauth_error:           'Ocorreu um erro no login com Google.',
      };
      const msg = encodeURIComponent(messages[error] || 'Erro ao autenticar.');
      window.location.replace(`/login?msg=${msg}`);
      return;
    }

    if (!token) {
      window.location.replace('/login');
      return;
    }

    // Store token then load user via getMe to populate localStorage
    localStorage.setItem('token', token);

    authService.getMe().then((user) => {
      if (user) {
        // Mirror what AuthContext.login() does — store user without sensitive billing fields
        const { billingDocument, billingLegalName, billingPhone, billingAddressStreet,
                billingAddressNumber, billingAddressComplement, billingAddressNeighborhood,
                billingAddressCity, billingAddressState, billingAddressZipCode,
                billingPersonType, ...safeUser } = user as any;
        localStorage.setItem('nosigilo_user', JSON.stringify(safeUser));

        // Mark first-access flow for new Google users (no photo yet)
        if (isNew && user.id) {
          localStorage.setItem(
            `nosigilo:first-access-flow:${user.id}`,
            JSON.stringify({ needsPhoto: true, needsPost: true, startedAt: new Date().toISOString() })
          );
        }
      }
      // Homem recém-cadastrado cai direto na aba de Busca (descoberta de perfis =
      // maior gatilho p/ assinar). Demais vão para o feed.
      const isMan = String((user as any)?.gender || '').toLowerCase().startsWith('homem');
      // Force full page reload so AuthContext re-initialises with new token/user
      window.location.replace(isNew && isMan ? '/search' : '/feed');
    }).catch(() => {
      // Even if getMe fails, the token is stored — the app will retry on load
      window.location.replace('/feed');
    });
  }, [searchParams]);

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

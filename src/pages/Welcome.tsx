import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { authService } from '@/services/api';

// Tela de agradecimento exibida após o pagamento (destino do returnUrl do checkout).
export default function Welcome() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const [ready, setReady] = useState(false);

  // Ao voltar do pagamento, recarrega a página UMA vez (guardado por ?refreshed=1)
  // para que todo o app reflita o novo status Premium; só então exibe o obrigado.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('refreshed') !== '1') {
      window.location.replace(`${window.location.pathname}?refreshed=1`);
      return;
    }
    setReady(true);
    let active = true;
    authService
      .getMe()
      .then((me) => {
        if (active && me) updateUser(me);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstName = String(user?.name || '').trim().split(' ')[0] || '';

  // Enquanto recarrega (antes do ?refreshed=1), mostra só um loader — evita piscar
  // a tela de obrigado antes do reload.
  if (!ready) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-background px-6 py-12 text-center">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/15 via-transparent to-transparent" />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-6 animate-fade-in">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-primary shadow-glow">
          <Crown className="h-10 w-10 text-white" />
        </div>

        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Pagamento confirmado
          </span>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
            Obrigado{firstName ? `, ${firstName}` : ''}! 🎉
          </h1>
          <p className="text-base text-muted-foreground">
            Seu acesso Premium está ativo. Bem-vindo(a) à{' '}
            <strong className="text-foreground/90">comunidade liberal que mais cresce no Brasil</strong>.
          </p>
        </div>

        <div className="w-full rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
          Agora é só aproveitar: radar, vídeos, eventos e todos os perfis liberados. Sem fidelidade — cancele quando quiser.
        </div>

        <Button
          onClick={() => navigate('/feed')}
          className="h-12 w-full gap-2 bg-gradient-primary text-base font-bold hover:opacity-90"
        >
          Ir para o Feed <ArrowRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}

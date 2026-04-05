import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { authService } from '@/services/api';
import { ArrowLeft, Clock3, LockKeyhole, Sparkles } from 'lucide-react';
import { resolveServerUrl } from '@/utils/serverUrl';

type PendingData = {
  email: string;
  name?: string | null;
  invitationStatus?: string | null;
  createdAt?: string | null;
  inviter?: { id: string; name?: string | null; avatar?: string | null } | null;
};

const RECHECK_SECONDS = 45;

function formatCountdown(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function maskEmail(email: string) {
  const normalized = String(email || '').trim();
  const [local = '', domain = ''] = normalized.split('@');
  if (!local || !domain) return normalized;
  const visibleLocal = local.length <= 2 ? `${local.charAt(0)}*` : `${local.slice(0, 2)}${'*'.repeat(Math.max(2, local.length - 2))}`;
  return `${visibleLocal}@${domain}`;
}

export default function PendingApproval() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const email = searchParams.get('email')?.trim() || '';
  const inviterNameParam = searchParams.get('inviter')?.trim() || '';
  const [pendingData, setPendingData] = useState<PendingData | null>(
    email
      ? {
          email,
          inviter: inviterNameParam ? { id: '', name: inviterNameParam } : null,
          invitationStatus: 'pending',
        }
      : null
  );
  const [secondsLeft, setSecondsLeft] = useState(RECHECK_SECONDS);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (!email) return;
    const stored = sessionStorage.getItem('nosigilo_pending_access');
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as PendingData;
      if (parsed?.email === email) setPendingData(parsed);
    } catch {}
  }, [email]);

  const inviterName = pendingData?.inviter?.name || inviterNameParam || 'seu padrinho';
  const maskedEmail = useMemo(() => maskEmail(pendingData?.email || email), [pendingData?.email, email]);

  const headline = useMemo(
    () => `Aguardando ${inviterName} aprovar sua solicitação para iniciar a diversão`,
    [inviterName]
  );

  const refreshStatus = async () => {
    if (!email) return;
    setIsChecking(true);
    try {
      const data = await authService.getPendingAccess(email);
      setPendingData(data);
      sessionStorage.setItem('nosigilo_pending_access', JSON.stringify(data));

      if (String(data?.invitationStatus || '') === 'approved') {
        sessionStorage.removeItem('nosigilo_pending_access');
        sessionStorage.setItem('nosigilo_login_email', email);
        sessionStorage.setItem('nosigilo_first_access_ready', email);
        navigate('/login');
        return;
      }
    } catch {
      // Keep waiting state if server check fails temporarily.
    } finally {
      setIsChecking(false);
      setSecondsLeft(RECHECK_SECONDS);
    }
  };

  useEffect(() => {
    if (!email) return;
    void refreshStatus();
  }, [email]);

  useEffect(() => {
    if (!email) return;
    const intervalId = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          void refreshStatus();
          return RECHECK_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [email]);

  if (!email) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-gradient-hero" />
        <div className="relative z-10 w-full max-w-xl glass-strong rounded-3xl p-8 text-center shadow-glow">
          <h1 className="text-2xl font-bold mb-3">Nenhuma solicitação em análise</h1>
          <p className="text-muted-foreground mb-6">Não encontramos um cadastro pendente para acompanhar aqui.</p>
          <Link to="/login">
            <Button className="bg-gradient-primary hover:opacity-90">Voltar para o login</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_50%_60%,rgba(236,72,153,0.22),transparent_35%),linear-gradient(180deg,#130d11_0%,#1e1317_45%,#110d10_100%)] text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center gap-8 px-4 py-10 lg:flex-row lg:items-stretch lg:gap-0">
        <div className="flex-1 rounded-t-[32px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm lg:rounded-l-[32px] lg:rounded-tr-none lg:p-10">
          <Link to="/login" className="mb-8 inline-flex items-center gap-2 text-white/70 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Link>

          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-primary">
              <Clock3 className="w-4 h-4" />
              Entrada exclusiva em análise
            </div>

            <div className="space-y-4">
              <h1 className="max-w-xl text-3xl font-bold leading-[1.05] tracking-tight text-balance sm:text-4xl">
                Aguardando <span className="break-words">{inviterName}</span> aprovar sua solicitacao para iniciar a diversao
              </h1>
              <p className="max-w-xl text-base leading-7 text-white/75">
                Seu acesso ja esta reservado. Falta apenas o sinal verde de <span className="font-semibold text-white break-words">{inviterName}</span> para liberar a sua entrada na rede.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                <div className="text-xs uppercase tracking-[0.22em] text-white/45">Próxima checagem</div>
                <div className="mt-2 text-3xl font-bold text-primary">{formatCountdown(secondsLeft)}</div>
                <div className="mt-2 text-sm text-white/60">Atualizamos seu status automaticamente.</div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                <div className="text-xs uppercase tracking-[0.22em] text-white/45">Padrinho</div>
                <div className="mt-2 break-words text-2xl font-bold leading-tight">{inviterName}</div>
                <div className="mt-2 text-sm text-white/60">A aprovação dele libera o seu acesso.</div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                <div className="text-xs uppercase tracking-[0.22em] text-white/45">Conta em análise</div>
                <div className="mt-2 break-all text-lg font-bold sm:text-xl">{maskedEmail}</div>
                <div className="mt-2 text-sm text-white/60">Seu cadastro esta guardado com seguranca.</div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button className="bg-gradient-primary hover:opacity-90" disabled={isChecking} onClick={() => void refreshStatus()}>
                {isChecking ? 'Atualizando...' : 'Verificar agora'}
              </Button>
              <Link to="/login">
                <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10">
                  Voltar para o login
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center rounded-b-[32px] border border-t-0 border-white/10 bg-black/35 p-6 lg:rounded-r-[32px] lg:rounded-bl-none lg:border-l-0 lg:border-t lg:p-10">
          <div className="relative w-full max-w-xl overflow-hidden rounded-[32px] border border-primary/20 bg-white/5 p-6 shadow-[0_0_60px_rgba(236,72,153,0.16)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(236,72,153,0.18),transparent_60%)]" />
            <div className="relative space-y-6">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] bg-gradient-primary shadow-glow">
                <Sparkles className="h-10 w-10 text-primary-foreground" />
              </div>

              <div className="space-y-3 text-center">
                <p className="text-sm uppercase tracking-[0.3em] text-primary/80">NoSigilo</p>
                <h2 className="text-3xl font-bold">Sua entrada está quase liberada</h2>
                <p className="mx-auto max-w-md text-base leading-7 text-white/70">
                  O clima ja esta montado. Assim que <span className="font-semibold text-white break-words">{inviterName}</span> aprovar, voce entra direto para explorar conexoes, convites e desejos com mais privacidade.
                </p>
              </div>

              <div className="mx-auto flex w-full max-w-sm items-center gap-4 rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="h-16 w-16 overflow-hidden rounded-2xl bg-white/10 ring-2 ring-primary/40">
                  {pendingData?.inviter?.avatar ? (
                    <img src={resolveServerUrl(pendingData.inviter.avatar)} alt={inviterName} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-white/80">
                      {String(inviterName || 'P').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0 text-left">
                  <div className="text-xs uppercase tracking-[0.22em] text-white/45">Padrinho responsavel</div>
                  <div className="break-words text-xl font-bold leading-tight">{inviterName}</div>
                  <div className="mt-1 text-sm text-white/60">Seu acesso entra na fila de aprovacao dele.</div>
                </div>
              </div>

              <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/12 px-4 py-2 text-sm font-medium text-amber-100">
                <Sparkles className="h-4 w-4" />
                Acesso VIP reservado para voce
              </div>

              <div className="grid gap-3">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-3">
                    <LockKeyhole className="h-5 w-5 text-primary" />
                    <div>
                      <div className="font-medium">Acesso fechado e mais seguro</div>
                      <div className="text-sm text-white/60">Quem entra vem por indicacao de alguem ja aprovado.</div>
                    </div>
                  </div>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-3">
                    <Sparkles className="h-5 w-5 text-primary" />
                    <div>
                      <div className="font-medium">Perfil quase pronto para estrear</div>
                      <div className="text-sm text-white/60">Feed, fotos privadas, match e radar esperam por voce.</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl bg-primary/15 p-4 text-sm text-white/85">
                Aguardando <span className="font-semibold">{inviterName}</span> aprovar sua solicitacao para iniciar a diversao.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

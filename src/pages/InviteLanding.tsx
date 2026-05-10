import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { authService } from '@/services/api';
import { Heart, Users, ShieldCheck, Star, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { resolveServerUrl } from '@/utils/serverUrl';

interface InviteInfo {
  inviter?: {
    name?: string;
    avatar?: string;
    city?: string;
  };
  inviterName?: string;
  inviterAvatar?: string;
  inviteToken?: string;
  status?: string;
}

export default function InviteLanding() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (!token) { setInvalid(true); setLoading(false); return; }
    authService
      .getInviteInfo(token)
      .then((data) => {
        setInfo(data);
        setLoading(false);
      })
      .catch(() => {
        setInvalid(true);
        setLoading(false);
      });
  }, [token]);

  const inviterName = info?.inviter?.name ?? info?.inviterName ?? 'alguém especial';
  const inviterAvatar = info?.inviter?.avatar ?? info?.inviterAvatar;
  const inviterCity = info?.inviter?.city;

  const handleRegister = () => {
    navigate(`/register?invite=${token}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (invalid) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="absolute inset-0 bg-gradient-hero pointer-events-none" />
        <div className="relative z-10 max-w-md">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Convite inválido</h1>
          <p className="text-muted-foreground mb-6">
            Este link de convite não existe ou já foi utilizado.
          </p>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-primary text-primary-foreground font-semibold shadow-glow hover:opacity-90 transition-opacity"
          >
            Criar conta assim mesmo
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <div className="absolute inset-0 bg-gradient-hero pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 p-4 flex justify-center">
        <BrandLogo size="md" showText />
      </header>

      {/* Hero */}
      <main className="relative z-10 flex flex-col items-center px-4 pt-6 pb-16 text-center max-w-lg mx-auto">
        {/* Inviter avatar */}
        <div className="relative mb-6">
          <div className="w-24 h-24 rounded-full border-4 border-primary/60 shadow-glow overflow-hidden bg-secondary">
            {inviterAvatar ? (
              <img
                src={resolveServerUrl(inviterAvatar)}
                alt={inviterName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-primary">
                {inviterName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-glow">
            <Heart className="w-3.5 h-3.5 text-primary-foreground fill-primary-foreground" />
          </span>
        </div>

        <h1 className="text-2xl font-bold leading-snug mb-2">
          <span className="text-gradient">{inviterName}</span>{inviterCity ? ` (${inviterCity})` : ''} te convidou para o NoSigilo
        </h1>
        <p className="text-muted-foreground text-sm mb-8">
          Uma rede social discreta para conexões reais. Crie sua conta usando o convite e entre agora.
        </p>

        {/* CTA */}
        <button
          onClick={handleRegister}
          className="w-full max-w-xs flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-gradient-primary text-primary-foreground font-bold text-lg shadow-glow hover:opacity-90 active:scale-95 transition-all mb-4"
        >
          Aceitar convite e criar conta
          <ArrowRight className="w-5 h-5" />
        </button>
        <Link
          to="/login"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Já tenho uma conta → Entrar
        </Link>

        {/* Trust badges */}
        <div className="mt-10 grid grid-cols-3 gap-4 w-full max-w-sm">
          {[
            { icon: ShieldCheck, label: 'Perfil verificado', sub: 'Sem bots' },
            { icon: Users, label: 'Comunidade real', sub: '+12 mil usuários' },
            { icon: Star, label: 'Acesso gratuito', sub: '30 dias de trial' },
          ].map(({ icon: Icon, label, sub }) => (
            <div key={label} className="glass rounded-xl p-3 text-center">
              <Icon className="w-5 h-5 text-primary mx-auto mb-1" />
              <p className="text-xs font-semibold leading-tight">{label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

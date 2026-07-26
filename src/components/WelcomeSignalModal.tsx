import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Lock, Heart, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { discoveryService } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { useAuth } from '@/contexts/AuthContext';
import { hasPremiumAccess } from '@/utils/premium';
import ReferralPaywallModal from '@/components/ReferralPaywallModal';

// Interstitial de 1ª sessão: assim que o usuário novo entra (logo após o
// WelcomeModal), mostra na cara dele que ALGUÉM já curtiu e mandou mensagem —
// o sinal semeado pela vitrine — pra ele não fechar o app sem sentir o puxão.
// Aparece uma única vez por usuário (localStorage) e só para NÃO-premium com
// sinal real recebido (curtida/visita/DM).
const KEY_PREFIX = 'nosigilo:welcome-signal-seen:';

export default function WelcomeSignalModal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const premium = hasPremiumAccess(user);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [previews, setPreviews] = useState<string[]>([]);
  const [paywallOpen, setPaywallOpen] = useState(false);

  const storageKey = user?.id ? `${KEY_PREFIX}${user.id}` : null;

  const tryShow = useCallback(() => {
    if (!user || premium || !storageKey) return;
    try { if (localStorage.getItem(storageKey)) return; } catch { /* ignore */ }
    discoveryService.getInterestInMe()
      .then((d) => {
        if (d && d.count > 0) {
          setCount(d.count);
          setPreviews(d.previews || []);
          setOpen(true);
        }
      })
      .catch(() => { /* sem sinal ou offline — não mostra */ });
  }, [user, premium, storageKey]);

  useEffect(() => {
    // Encadeado ao WelcomeModal: abre logo que ele é fechado.
    const handler = () => tryShow();
    window.addEventListener('nosigilo:open-welcome-signal', handler);
    // Usuário novo retornando (já viu o WelcomeModal): tenta na montagem.
    try { if (localStorage.getItem('nosigilo:welcome-seen-v1')) tryShow(); } catch { /* ignore */ }
    return () => window.removeEventListener('nosigilo:open-welcome-signal', handler);
  }, [tryShow]);

  if (!open && !paywallOpen) return null;

  const dismiss = () => {
    if (storageKey) { try { localStorage.setItem(storageKey, '1'); } catch { /* noop */ } }
    setOpen(false);
  };

  const handleReveal = () => {
    dismiss();
    if (premium) { navigate('/chat'); return; }
    setPaywallOpen(true);
  };

  return (
    <>
      <ReferralPaywallModal open={paywallOpen} onClose={() => { setPaywallOpen(false); }} />
      {open && !paywallOpen && (
        <div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/75 p-4" onClick={dismiss}>
          <div
            className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-primary/30 bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Topo quente */}
            <div className="bg-gradient-to-br from-rose-500 via-primary to-violet-600 px-6 pb-7 pt-8 text-center text-white">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
                <Flame className="h-7 w-7" />
              </div>
              <p className="text-4xl font-extrabold leading-none">{count.toLocaleString('pt-BR')}</p>
              <p className="mt-2 text-sm font-medium text-white/90">
                {count > 1
                  ? 'pessoas já se interessaram por você — curtiram e te mandaram mensagem 🔥'
                  : 'pessoa já se interessou por você — curtiu e te mandou mensagem 🔥'}
              </p>
            </div>

            <div className="px-6 py-5">
              {/* Prévias borradas dos perfis */}
              {previews.length > 0 && (
                <div className="mb-4 flex items-center justify-center -space-x-3">
                  {previews.slice(0, 6).map((avatar, i) => (
                    <div key={i} className="relative h-11 w-11 overflow-hidden rounded-full border-2 border-background bg-secondary">
                      <img
                        src={resolveServerUrl(avatar)}
                        alt="Perfil"
                        className="h-full w-full object-cover blur-[6px] brightness-90"
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Lock className="h-3.5 w-3.5 text-white/90 drop-shadow" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Prévia borrada da mensagem recebida */}
              <div className="mb-4 rounded-2xl border border-border/60 bg-secondary/40 p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <MessageCircle className="h-3.5 w-3.5" /> Mensagem recebida
                </div>
                <div className="space-y-1.5" aria-hidden>
                  <div className="h-2.5 w-3/4 rounded-full bg-foreground/25 blur-[3px]" />
                  <div className="h-2.5 w-2/3 rounded-full bg-foreground/20 blur-[3px]" />
                </div>
                <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Lock className="h-3 w-3" /> Assine para ler e responder
                </p>
              </div>

              <Button
                onClick={handleReveal}
                className="w-full gap-2 bg-gradient-to-r from-rose-500 via-primary to-violet-500 py-6 text-base font-bold shadow-glow hover:opacity-90"
              >
                <Heart className="h-5 w-5" />
                Ver quem curtiu e ler a mensagem
              </Button>
              <button
                type="button"
                onClick={dismiss}
                className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-foreground"
              >
                Agora não
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

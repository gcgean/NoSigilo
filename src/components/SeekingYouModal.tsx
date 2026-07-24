import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Lock, X, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { discoveryService } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { useAuth } from '@/contexts/AuthContext';
import { hasPremiumAccess } from '@/utils/premium';
import ReferralPaywallModal from '@/components/ReferralPaywallModal';

/**
 * Banner de conversão do primeiro acesso: "X perfis procuram alguém como você
 * para uma brincadeira no sigilo". Ao clicar para ver, exige premium.
 */
export default function SeekingYouModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const premium = hasPremiumAccess(user);
  const [count, setCount] = useState<number | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [paywallOpen, setPaywallOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    discoveryService.getSeekingMe()
      .then((d) => { if (!cancelled) { setCount(d.count); setPreviews(d.previews || []); } })
      .catch(() => { if (!cancelled) setCount(0); });
    return () => { cancelled = true; };
  }, [open]);

  // Não mostra se não há ninguém procurando (evita banner vazio).
  if (!open || count === 0) return null;
  // Enquanto carrega o número, não pisca o modal.
  if (count === null) return null;

  const handleReveal = () => {
    if (premium) {
      onClose();
      navigate('/search');
    } else {
      setPaywallOpen(true);
    }
  };

  return (
    <>
      <ReferralPaywallModal open={paywallOpen} onClose={() => { setPaywallOpen(false); onClose(); }} />
      {!paywallOpen && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
          <div
            className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-primary/30 bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-white/80 hover:bg-black/50"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Topo com fogo */}
            <div className="bg-gradient-to-br from-rose-500 via-primary to-violet-600 px-6 pb-8 pt-7 text-center text-white">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
                <Flame className="h-7 w-7" />
              </div>
              <p className="text-4xl font-extrabold leading-none">{count.toLocaleString('pt-BR')}</p>
              <p className="mt-2 text-sm font-medium text-white/90">
                perfis estão procurando alguém como você para uma brincadeira no sigilo 🔥
              </p>
            </div>

            {/* Prévias borradas — gera curiosidade */}
            <div className="px-6 py-5">
              {previews.length > 0 && (
                <div className="mb-4 flex items-center justify-center -space-x-3">
                  {previews.slice(0, 6).map((avatar, i) => (
                    <div key={i} className="relative h-11 w-11 overflow-hidden rounded-full border-2 border-background bg-secondary">
                      <img
                        src={resolveServerUrl(avatar)}
                        alt="Perfil"
                        className={premium ? 'h-full w-full object-cover' : 'h-full w-full object-cover blur-[6px] brightness-90'}
                      />
                      {!premium && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Lock className="h-3.5 w-3.5 text-white/90 drop-shadow" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <Button
                onClick={handleReveal}
                className="w-full gap-2 bg-gradient-to-r from-rose-500 via-primary to-violet-500 py-6 text-base font-bold shadow-glow hover:opacity-90"
              >
                {premium ? <Eye className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
                Ver quem procura por mim
              </Button>
              {!premium && (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Assine o Premium para ver e conversar com quem já está de olho em você.
                </p>
              )}
              <button
                type="button"
                onClick={onClose}
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

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { calcProfileCompletion } from '@/utils/profileCompletion';

type Props = {
  profile: {
    avatar?: string | null;
    bio?: string | null;
    city?: string | null;
    birthDate?: string | null;
    gender?: string | null;
    lookingFor?: string | null;
    maritalStatus?: string | null;
  };
};

const BANNER_DISMISSED_KEY = 'nosigilo:profile-banner-dismissed';

export default function ProfileCompletionBanner({ profile }: Props) {
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(BANNER_DISMISSED_KEY) === '1'; } catch { return false; }
  });

  const { percent, missing } = calcProfileCompletion(profile);

  if (percent >= 100 || dismissed) return null;

  const topMissing = missing.slice(0, 3);

  function dismiss() {
    try { sessionStorage.setItem(BANNER_DISMISSED_KEY, '1'); } catch { /* noop */ }
    setDismissed(true);
  }

  return (
    <div className="mb-4 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 via-rose-500/8 to-orange-400/8 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-primary">
            Seu perfil está {percent}% completo
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Perfis completos aparecem para até 3x mais pessoas
          </p>

          {/* Progress bar */}
          <div className="mt-3 h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-rose-400 transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>

          {/* Missing fields */}
          {topMissing.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {topMissing.map((f) => (
                <Link
                  key={f.label}
                  to="/settings"
                  className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                >
                  + {f.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={dismiss}
          className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          aria-label="Fechar"
        >
          <X size={14} />
        </button>
      </div>

      <div className="mt-3">
        <Button
          asChild
          size="sm"
          className="bg-gradient-primary hover:opacity-90 text-white text-xs h-8 px-4"
        >
          <Link to="/settings">Completar perfil</Link>
        </Button>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'nosigilo:weekend-modal-date';

function shouldShow(user: any): boolean {
  if (!user || !user.avatar || user.isAdmin) return false;
  const now = new Date();
  // Sunday = 0, after 07:00
  if (now.getDay() !== 0 || now.getHours() < 7) return false;
  try {
    return localStorage.getItem(STORAGE_KEY) !== now.toDateString();
  } catch {
    return false;
  }
}

function dismiss() {
  try { localStorage.setItem(STORAGE_KEY, new Date().toDateString()); } catch {}
}

export default function WeekendAdventureModal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(() => shouldShow(user));

  if (!visible) return null;

  const handleShare = () => {
    dismiss();
    setVisible(false);
    // Pass state so Feed.tsx opens the experience form even if already mounted
    navigate('/feed', { state: { openExperienceForm: true } });
  };

  const handleSkip = () => {
    dismiss();
    setVisible(false);
  };

  return (
    <div className="fixed inset-0 z-[9997] flex items-center justify-center p-4 bg-black/80" style={{ WebkitOverflowScrolling: 'auto' }}>
      <div className="w-full max-w-sm rounded-3xl border border-primary/20 bg-background shadow-2xl animate-fade-in">
        {/* Top gradient strip */}
        <div className="h-1.5 w-full rounded-t-3xl bg-gradient-to-r from-rose-500 via-primary to-violet-500" />

        <div className="p-6 pb-7 space-y-5 text-center">
          {/* Emoji */}
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-4xl">
              🔥
            </div>
          </div>

          {/* Copy */}
          <div className="space-y-2">
            <h2 className="text-xl font-bold leading-tight">
              E aí, rolou algo quente esse fim de semana? 🔥
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Teve uma aventura especial? Conta pra galera —{' '}
              <span className="text-primary font-medium">aqui é lugar seguro!</span>
              {' '}Você pode compartilhar texto, foto ou vídeo.
            </p>
          </div>

          {/* Buttons */}
          <div className="space-y-3 pt-1">
            <Button
              className="w-full bg-gradient-to-r from-rose-500 via-primary to-violet-500 text-base font-semibold py-5 hover:opacity-90"
              onClick={handleShare}
            >
              🔥 Sim! Quero compartilhar
            </Button>
            <button
              type="button"
              className="w-full py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={handleSkip}
            >
              Não dessa vez
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

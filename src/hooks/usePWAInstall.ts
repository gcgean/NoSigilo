import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type PWAInstallState =
  | { type: 'none' }
  | { type: 'android'; prompt: BeforeInstallPromptEvent }
  | { type: 'ios' };

const DISMISS_KEY = 'nosigilo:pwa-install-dismissed';
const DISMISS_DAYS = 7;

function isAlreadyInstalled() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

function wasDismissedRecently() {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const ts = Number(raw);
  if (!ts) return false;
  const diffDays = (Date.now() - ts) / (1000 * 60 * 60 * 24);
  return diffDays < DISMISS_DAYS;
}

function isIOSSafari() {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  // Only show on Safari (not Chrome/Firefox on iOS which can't install PWAs)
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
  return isIOS && isSafari;
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export function usePWAInstall() {
  const [state, setState] = useState<PWAInstallState>({ type: 'none' });

  useEffect(() => {
    if (isAlreadyInstalled() || wasDismissedRecently() || !isMobileDevice()) return;

    if (isIOSSafari()) {
      // Delay slightly so the page settles before showing banner
      const t = setTimeout(() => setState({ type: 'ios' }), 3000);
      return () => clearTimeout(t);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      const t = setTimeout(
        () => setState({ type: 'android', prompt: e as BeforeInstallPromptEvent }),
        3000
      );
      // Store ref so we can clear if unmounted fast
      return () => clearTimeout(t);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (state.type !== 'android') return;
    await state.prompt.prompt();
    const { outcome } = await state.prompt.userChoice;
    if (outcome === 'accepted') {
      setState({ type: 'none' });
    }
  };

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setState({ type: 'none' });
  };

  return { state, install, dismiss };
}

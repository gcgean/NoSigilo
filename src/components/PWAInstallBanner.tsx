import { useEffect, useState } from 'react';
import { X, Share, Plus, Download } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { cn } from '@/lib/utils';

export function PWAInstallBanner() {
  const { state, install, dismiss } = usePWAInstall();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (state.type !== 'none') {
      // Small delay to trigger CSS transition
      const t = setTimeout(() => setVisible(true), 50);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
    }
  }, [state.type]);

  if (state.type === 'none') return null;

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(dismiss, 300); // wait for animation
  };

  const handleInstall = () => {
    if (state.type === 'android') {
      install();
    }
  };

  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 z-[9999] transition-transform duration-300 ease-out',
        visible ? 'translate-y-0' : 'translate-y-full'
      )}
    >
      {/* Backdrop blur strip */}
      <div className="mx-auto max-w-lg">
        <div className="m-3 rounded-2xl border border-pink-200 bg-white shadow-2xl shadow-pink-200/40">
          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="absolute right-5 top-4 text-gray-400 hover:text-gray-600"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="p-5 pr-10">
            {/* Header */}
            <div className="mb-3 flex items-center gap-3">
              <img
                src="/icon-192.svg"
                alt="NoSigilo"
                className="h-12 w-12 shrink-0 rounded-2xl shadow-md"
              />
              <div>
                <p className="font-bold text-gray-900 leading-tight">Instale o NoSigilo</p>
                <p className="text-sm text-gray-500">Acesso rápido na tela inicial</p>
              </div>
            </div>

            {state.type === 'android' && (
              <>
                <p className="mb-4 text-sm text-gray-600 leading-relaxed">
                  Adicione à tela inicial para abrir com um toque, sem precisar do navegador.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDismiss}
                    className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-100"
                  >
                    Agora não
                  </button>
                  <button
                    onClick={handleInstall}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary/90 active:bg-primary/80"
                  >
                    <Download className="h-4 w-4" />
                    Instalar
                  </button>
                </div>
              </>
            )}

            {state.type === 'ios' && (
              <>
                <p className="mb-3 text-sm text-gray-600 leading-relaxed">
                  Adicione à tela inicial em 2 passos:
                </p>
                <ol className="mb-4 space-y-2">
                  <li className="flex items-center gap-3 rounded-xl bg-pink-50 px-3 py-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Share className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-sm text-gray-700">
                      Toque no ícone <span className="font-semibold">Compartilhar</span> do Safari
                    </span>
                  </li>
                  <li className="flex items-center gap-3 rounded-xl bg-pink-50 px-3 py-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Plus className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-sm text-gray-700">
                      Selecione <span className="font-semibold">"Adicionar à Tela de Início"</span>
                    </span>
                  </li>
                </ol>
                <button
                  onClick={handleDismiss}
                  className="w-full rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-100"
                >
                  Entendi
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

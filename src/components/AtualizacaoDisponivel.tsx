import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

const INTERVALO_MS = 10 * 60 * 1000; // confere a cada 10 minutos com o app aberto

/**
 * Avisa quando saiu versão nova do site e deixa a pessoa atualizar com um toque.
 *
 * Compara a versão embutida neste código com /version.json do servidor. Confere
 * ao abrir, a cada 10 minutos e sempre que o app volta para a frente (no
 * iPhone, o app instalado fica "dormindo" em segundo plano por dias e acordava
 * com a versão antiga).
 */
export default function AtualizacaoDisponivel() {
  const [temNova, setTemNova] = useState(false);
  const [atualizando, setAtualizando] = useState(false);

  useEffect(() => {
    // Em desenvolvimento não existe version.json.
    if (import.meta.env.DEV) return;

    let cancelado = false;
    const conferir = async () => {
      try {
        const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!r.ok) return;
        const { versao } = (await r.json()) as { versao?: string };
        if (!cancelado && versao && versao !== __APP_VERSION__) setTemNova(true);
      } catch {
        /* sem rede: tenta de novo depois */
      }
    };

    void conferir();
    const timer = window.setInterval(conferir, INTERVALO_MS);
    const aoVoltar = () => { if (document.visibilityState === 'visible') void conferir(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      cancelado = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, []);

  const atualizar = async () => {
    setAtualizando(true);
    try {
      // Pede ao service worker para buscar a versão nova antes de recarregar.
      const reg = await navigator.serviceWorker?.getRegistration?.();
      await reg?.update?.();
    } catch {
      /* segue para o recarregamento mesmo assim */
    }
    window.location.reload();
  };

  if (!temNova) return null;

  return (
    <div className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] z-[70] md:bottom-6 md:left-auto md:right-6 md:w-96">
      <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-background p-3 shadow-2xl">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <RefreshCw className="h-4 w-4 text-brand-pink" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Nova versão disponível</p>
          <p className="text-xs text-muted-foreground">Atualize para ter as melhorias mais recentes.</p>
        </div>
        <button
          type="button"
          onClick={() => void atualizar()}
          disabled={atualizando}
          className="shrink-0 rounded-xl bg-gradient-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
        >
          {atualizando ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>
    </div>
  );
}

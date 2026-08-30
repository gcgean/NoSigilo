import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Botão "voltar ao topo" para as páginas longas (o feed passa de 11.000px).
 *
 * Fica acima da barra de navegação inferior e respeita a safe-area do iPhone,
 * pelo mesmo padrão que a nav usa. Só aparece depois de rolar bastante, para
 * não competir com o conteúdo em telas curtas.
 */
const MOSTRAR_APOS_PX = 1200;

export default function BackToTop({ className }: { className?: string }) {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const aoRolar = () => setVisivel(window.scrollY > MOSTRAR_APOS_PX);
    aoRolar();
    window.addEventListener('scroll', aoRolar, { passive: true });
    return () => window.removeEventListener('scroll', aoRolar);
  }, []);

  if (!visivel) return null;

  return (
    <button
      type="button"
      aria-label="Voltar ao topo"
      onClick={() =>
        window.scrollTo({
          top: 0,
          // Respeita quem pediu menos animação no sistema.
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        })
      }
      className={cn(
        'fixed right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full',
        'border bg-background/95 shadow-lg backdrop-blur transition-opacity hover:bg-secondary',
        // Acima da nav flutuante no mobile; encostado embaixo no desktop,
        // onde a nav inferior não existe.
        'bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] md:bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))]',
        className
      )}
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}

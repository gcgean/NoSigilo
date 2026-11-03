import { cn } from '@/lib/utils';

/** Story com menos disto no ar ganha o selo de "vai sumir". */
export const HORAS_EXPIRANDO = 3;

export function expiraEmBreve(expiresAt?: string | null, agora = Date.now()) {
  if (!expiresAt) return false;
  const falta = Date.parse(expiresAt) - agora;
  return falta > 0 && falta < HORAS_EXPIRANDO * 3_600_000;
}

/**
 * Selinho de ampulheta (estilo Instagram) nos lugares onde aparece story:
 * avisa que ele some em menos de 3h, para a pessoa ver antes que acabe.
 */
export function SeloExpirando({ className }: { className?: string }) {
  return (
    <span
      title="Some em breve"
      aria-label="Some em breve"
      className={cn(
        'z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-red-600 text-[10px] leading-none shadow',
        className,
      )}
    >
      ⏳
    </span>
  );
}

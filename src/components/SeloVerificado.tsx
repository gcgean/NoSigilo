import { BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Selo de perfil verificado (selfie com código aprovada pela equipe). Bem
 * visível ao lado do nome: é o que mostra para os outros que a pessoa é real.
 */
export default function SeloVerificado({ genero, className, compacto = false }: { genero?: string | null; className?: string; compacto?: boolean }) {
  const g = String(genero || '').toLowerCase();
  const rotulo = g.startsWith('mulher') ? 'Verificada' : g.startsWith('casal') ? 'Verificados' : 'Verificado';
  if (compacto) {
    return <BadgeCheck className={cn('h-5 w-5 shrink-0 fill-sky-500 text-white', className)} aria-label={rotulo} />;
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-sky-500 px-2.5 py-0.5 text-xs font-bold text-white shadow-[0_0_12px_rgba(14,165,233,0.45)]',
        className
      )}
      title="Perfil confirmado pela equipe do NoSigilo"
    >
      <BadgeCheck className="h-3.5 w-3.5" /> {rotulo}
    </span>
  );
}

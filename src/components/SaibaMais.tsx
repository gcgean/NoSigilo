import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Uma linha curta e, só se a pessoa quiser, a explicação completa (12/11/2026).
 * As Configurações tinham parágrafos longos que assustavam quem tem pouca
 * prática com app.
 */
export default function SaibaMais({ resumo, children, className }: { resumo: ReactNode; children: ReactNode; className?: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className={cn('text-sm text-muted-foreground', className)}>
      <p>
        {resumo}{' '}
        <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto} className="font-medium text-brand-pink underline-offset-2 hover:underline">
          {aberto ? 'Fechar' : 'Saiba mais'}
        </button>
      </p>
      {aberto && <div className="mt-1.5 text-xs leading-relaxed">{children}</div>}
    </div>
  );
}

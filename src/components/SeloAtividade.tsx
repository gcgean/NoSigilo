import { cn } from '@/lib/utils';

/**
 * Quando a pessoa apareceu por aqui pela última vez.
 *
 * Medido em 23/09/2026: 80% das mensagens de quem nunca recebeu resposta foram
 * para perfis sumidos havia mais de 30 dias. Mostrar isso ANTES do clique evita
 * que alguém gaste a energia (e a assinatura) escrevendo para o vazio.
 */
export function faixaDeAtividade(lastSeenAt?: string | null, isOnline?: boolean) {
  if (isOnline) return { rotulo: 'Online agora', tom: 'online' as const };
  const t = lastSeenAt ? new Date(lastSeenAt).getTime() : NaN;
  if (Number.isNaN(t)) return { rotulo: 'Sem acesso recente', tom: 'sumido' as const };

  const horas = (Date.now() - t) / (60 * 60 * 1000);
  if (horas < 24) return { rotulo: 'Ativo hoje', tom: 'hoje' as const };
  if (horas < 24 * 7) return { rotulo: 'Ativo esta semana', tom: 'semana' as const };

  const dias = Math.floor(horas / 24);
  if (dias < 30) return { rotulo: `Visto há ${dias} dias`, tom: 'parado' as const };
  const meses = Math.floor(dias / 30);
  return { rotulo: `Sumido há ${meses === 1 ? '1 mês' : `${meses} meses`}`, tom: 'sumido' as const };
}

const CORES = {
  online: 'bg-emerald-500 text-white',
  hoje: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  semana: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  parado: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  sumido: 'bg-muted text-muted-foreground',
};

export default function SeloAtividade({
  lastSeenAt,
  isOnline,
  className,
}: {
  lastSeenAt?: string | null;
  isOnline?: boolean;
  className?: string;
}) {
  const { rotulo, tom } = faixaDeAtividade(lastSeenAt, isOnline);
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold', CORES[tom], className)}>
      {tom === 'online' && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
      {rotulo}
    </span>
  );
}

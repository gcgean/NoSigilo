import { cn } from '@/lib/utils';

export type CategoriaContagem = { slug: string; nome: string; total: number; naoLidos: number };
export type OrdemContos = 'recentes' | 'votados';
export type LeituraContos = 'todos' | 'nao_lidos' | 'lidos';

const chip = (ativo: boolean) =>
  cn(
    'flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
    ativo ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground'
  );

/** Barra de filtros dos contos: categoria (com contador), ordem e lidos. */
export default function FiltrosContos({
  categorias,
  total,
  naoLidos,
  categoria,
  ordem,
  leitura,
  onCategoria,
  onOrdem,
  onLeitura,
}: {
  categorias: CategoriaContagem[];
  total: number;
  naoLidos: number;
  categoria: string;
  ordem: OrdemContos;
  leitura: LeituraContos;
  onCategoria: (slug: string) => void;
  onOrdem: (o: OrdemContos) => void;
  onLeitura: (l: LeituraContos) => void;
}) {
  // Só categorias com contos (e a selecionada, mesmo vazia).
  const visiveis = categorias.filter((c) => c.total > 0 || c.slug === categoria);
  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-background/60 p-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button type="button" className={chip(categoria === '')} onClick={() => onCategoria('')}>
          Todas <span className="opacity-70">({total})</span>
        </button>
        {visiveis.map((c) => (
          <button key={c.slug} type="button" className={chip(categoria === c.slug)} onClick={() => onCategoria(c.slug)}>
            {c.nome} <span className="opacity-70">({c.total})</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={chip(ordem === 'recentes')} onClick={() => onOrdem('recentes')}>🕒 Recentes</button>
        <button type="button" className={chip(ordem === 'votados')} onClick={() => onOrdem('votados')}>🔥 Mais votados</button>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <button type="button" className={chip(leitura === 'todos')} onClick={() => onLeitura('todos')}>Todos</button>
        <button type="button" className={chip(leitura === 'nao_lidos')} onClick={() => onLeitura('nao_lidos')}>
          Não lidos {naoLidos > 0 && <span className="opacity-70">({naoLidos})</span>}
        </button>
        <button type="button" className={chip(leitura === 'lidos')} onClick={() => onLeitura('lidos')}>✓ Já lidos</button>
      </div>
    </div>
  );
}

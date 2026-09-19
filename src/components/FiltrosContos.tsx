import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CategoriaContagem = { slug: string; nome: string; total: number; naoLidos: number };
export type OrdemContos = 'recentes' | 'votados';
export type LeituraContos = 'todos' | 'nao_lidos' | 'lidos';

const chip = (ativo: boolean) =>
  cn(
    'flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
    ativo ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground'
  );

/** Barra de filtros dos contos: tema (com contador e busca dentro dele), ordem e lidos. */
export default function FiltrosContos({
  categorias,
  total,
  naoLidos,
  categoria,
  ordem,
  leitura,
  busca,
  onCategoria,
  onOrdem,
  onLeitura,
  onBusca,
}: {
  categorias: CategoriaContagem[];
  total: number;
  naoLidos: number;
  categoria: string;
  ordem: OrdemContos;
  leitura: LeituraContos;
  busca: string;
  onCategoria: (slug: string) => void;
  onOrdem: (o: OrdemContos) => void;
  onLeitura: (l: LeituraContos) => void;
  onBusca: (q: string) => void;
}) {
  // Digitação não dispara busca a cada tecla: espera 400ms.
  const [texto, setTexto] = useState(busca);
  useEffect(() => { setTexto(busca); }, [busca]);
  useEffect(() => {
    if (texto === busca) return;
    const t = setTimeout(() => onBusca(texto.trim()), 400);
    return () => clearTimeout(t);
  }, [texto]); // eslint-disable-line react-hooks/exhaustive-deps

  // Temas com conto primeiro; os vazios continuam visíveis, só apagados.
  const ordenadas = [...categorias].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
  const nomeAtual = categorias.find((c) => c.slug === categoria)?.nome;

  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-background/60 p-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={nomeAtual ? `Buscar em ${nomeAtual}...` : 'Buscar nos contos...'}
            className="h-9 w-full rounded-full border border-input bg-background pl-8 pr-8 text-sm"
            aria-label="Buscar contos"
          />
          {texto && (
            <button
              type="button"
              onClick={() => { setTexto(''); onBusca(''); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Limpar busca"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <select
          value={categoria}
          onChange={(e) => onCategoria(e.target.value)}
          className="h-9 shrink-0 rounded-full border border-input bg-background px-2 text-xs"
          aria-label="Escolher tema"
        >
          <option value="">Todos os temas ({total})</option>
          {ordenadas.map((c) => (
            <option key={c.slug} value={c.slug}>{c.nome} ({c.total})</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button type="button" className={chip(categoria === '')} onClick={() => onCategoria('')}>
          Todos <span className="opacity-70">({total})</span>
        </button>
        {ordenadas.map((c) => (
          <button
            key={c.slug}
            type="button"
            className={cn(chip(categoria === c.slug), c.total === 0 && categoria !== c.slug && 'opacity-50')}
            onClick={() => onCategoria(c.slug)}
          >
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

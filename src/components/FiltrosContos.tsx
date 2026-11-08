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

/** Filtros dos contos: abas (recentes, mais curtidos, não lidos), temas e busca. */
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
  // Três abas no topo, como num app de leitura: ordem e "não lidos" viram uma escolha só.
  const abaAtual: 'recentes' | 'votados' | 'nao_lidos' = leitura === 'nao_lidos' ? 'nao_lidos' : ordem;
  const escolherAba = (aba: 'recentes' | 'votados' | 'nao_lidos') => {
    if (aba === 'nao_lidos') { onLeitura('nao_lidos'); onOrdem('recentes'); return; }
    onLeitura('todos');
    onOrdem(aba);
  };
  const abas = [
    { id: 'recentes' as const, rotulo: '🕒 Recentes' },
    { id: 'votados' as const, rotulo: '🔥 Mais curtidos' },
    { id: 'nao_lidos' as const, rotulo: `🆕 Não lidos${naoLidos > 0 ? ` (${naoLidos})` : ''}` },
  ];

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label="Ordem dos contos">
        {abas.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={abaAtual === a.id}
            onClick={() => escolherAba(a.id)}
            className={cn(
              'min-h-[40px] truncate rounded-lg px-1 text-[13px] font-bold transition-colors',
              abaAtual === a.id ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground/70 hover:bg-background/60 hover:text-foreground'
            )}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none" aria-label="Temas">
        <button type="button" className={chip(categoria === '')} onClick={() => onCategoria('')}>
          Todos os temas <span className="opacity-70">({total})</span>
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

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={nomeAtual ? `Buscar em ${nomeAtual}...` : 'Buscar nos contos...'}
          className="h-10 w-full rounded-full border border-input bg-background pl-8 pr-8 text-base sm:h-9 sm:text-sm"
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
    </div>
  );
}

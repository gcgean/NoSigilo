import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BookOpen, Check, Loader2, PauseCircle, ShieldAlert, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { adminContosService, type ContoAdmin } from '@/services/api';

type FiltroStatus = '' | 'em_revisao' | 'publicado' | 'sem_categoria';

/**
 * Moderação dos contos eróticos: reclassificar a categoria, aprovar ou segurar
 * para revisão e remover. Os que a trava automática pegou aparecem primeiro.
 */
export default function AdminContos() {
  const { toast } = useToast();
  const [status, setStatus] = useState<FiltroStatus>('');
  const [categoria, setCategoria] = useState('');
  const [page, setPage] = useState(1);
  const [contos, setContos] = useState<ContoAdmin[]>([]);
  const [temMais, setTemMais] = useState(false);
  const [contagem, setContagem] = useState({ revisao: 0, semCategoria: 0, total: 0 });
  const [categorias, setCategorias] = useState<Array<{ slug: string; nome: string }>>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const semCategoria = status === 'sem_categoria';
      const r = await adminContosService.listar({
        status: semCategoria ? undefined : status || undefined,
        categoria: semCategoria ? 'sem' : categoria || undefined,
        page,
      });
      setContos(r.contos);
      setTemMais(r.temMais);
      setContagem(r.contagem);
      setCategorias(r.categorias);
    } catch {
      setContos([]);
      toast({ title: 'Não foi possível carregar os contos', variant: 'destructive' });
    } finally {
      setCarregando(false);
    }
  }, [status, categoria, page, toast]);

  useEffect(() => { void carregar(); }, [carregar]);

  const nomeCategoria = (slug: string | null) => categorias.find((c) => c.slug === slug)?.nome ?? 'Sem categoria';

  const atualizar = async (c: ContoAdmin, data: { categoria?: string; status?: 'publicado' | 'em_revisao' }) => {
    setOcupado(c.id);
    try {
      await adminContosService.atualizar(c.id, data);
      setContos((lista) => lista.map((x) => (x.id === c.id ? { ...x, ...data, motivo: data.status === 'publicado' ? null : x.motivo } : x)));
      if (data.status) {
        setContagem((k) => ({ ...k, revisao: Math.max(0, k.revisao + (data.status === 'em_revisao' ? 1 : -1)) }));
      }
      toast({ title: data.status === 'publicado' ? 'Conto aprovado' : data.status === 'em_revisao' ? 'Conto retido para revisão' : 'Categoria atualizada' });
    } catch {
      toast({ title: 'Não foi possível salvar', variant: 'destructive' });
    } finally {
      setOcupado(null);
    }
  };

  const remover = async (c: ContoAdmin) => {
    if (!window.confirm(`Remover o conto "${c.titulo}" de ${c.autor.nome}? Isso apaga curtidas e comentários dele e não tem volta.`)) return;
    setOcupado(c.id);
    try {
      await adminContosService.remover(c.id);
      setContos((lista) => lista.filter((x) => x.id !== c.id));
      setContagem((k) => ({ ...k, total: Math.max(0, k.total - 1), revisao: c.status === 'em_revisao' ? Math.max(0, k.revisao - 1) : k.revisao }));
      toast({ title: 'Conto removido' });
    } catch {
      toast({ title: 'Não foi possível remover', variant: 'destructive' });
    } finally {
      setOcupado(null);
    }
  };

  const varrer = async () => {
    setOcupado('varredura');
    try {
      const r = await adminContosService.varredura();
      toast({
        title: `${r.analisados} contos analisados`,
        description: r.segurados ? `${r.segurados} retidos para revisão — veja a fila "Em revisão".` : 'Nenhum conto suspeito encontrado.',
      });
      if (r.segurados) { setStatus('em_revisao'); setPage(1); }
      await carregar();
    } catch {
      toast({ title: 'Falha na varredura', variant: 'destructive' });
    } finally {
      setOcupado(null);
    }
  };

  const filtro = (valor: FiltroStatus, rotulo: string, qtd?: number) => (
    <button
      type="button"
      onClick={() => { setStatus(valor); setPage(1); }}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs font-medium',
        status === valor ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'
      )}
    >
      {rotulo}{qtd !== undefined && <span className="ml-1 opacity-70">({qtd})</span>}
    </button>
  );

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold"><BookOpen className="h-4 w-4" /> Contos eróticos</h3>
            <p className="text-xs text-muted-foreground">
              Contos com sinais de menores, animais ou incesto ficam retidos e só o autor vê. Aprove, reclassifique ou remova.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={varrer} disabled={ocupado === 'varredura'} className="gap-2">
            {ocupado === 'varredura' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
            Revisar contos antigos
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {filtro('', 'Todos', contagem.total)}
          {filtro('em_revisao', '⚠️ Em revisão', contagem.revisao)}
          {filtro('sem_categoria', 'Sem categoria', contagem.semCategoria)}
          {filtro('publicado', 'Publicados')}
          <select
            value={categoria}
            onChange={(e) => { setCategoria(e.target.value); setPage(1); }}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">Todas as categorias</option>
            {categorias.map((c) => <option key={c.slug} value={c.slug}>{c.nome}</option>)}
          </select>
        </div>
      </Card>

      {carregando ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : contos.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum conto neste filtro.</Card>
      ) : (
        <div className="space-y-3">
          {contos.map((c) => (
            <Card key={c.id} className={cn('p-4 space-y-3', c.status === 'em_revisao' && 'border-amber-500/60')}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{c.titulo || '(sem título)'}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.autor.nome} · {c.autor.email} · {new Date(c.createdAt).toLocaleDateString('pt-BR')} · ❤️ {c.votos} · 👁 {c.leituras}
                  </p>
                </div>
                <span className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  c.status === 'em_revisao' ? 'bg-amber-500/15 text-amber-600' : 'bg-emerald-500/15 text-emerald-600'
                )}>
                  {c.status === 'em_revisao' ? 'Em revisão' : 'Publicado'}
                </span>
              </div>

              {c.motivo && (
                <p className="flex items-start gap-2 rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Trava automática: {c.motivo}
                </p>
              )}

              <button type="button" onClick={() => setAberto(aberto === c.id ? null : c.id)} className="block w-full text-left">
                <p className={cn('whitespace-pre-line text-sm text-muted-foreground', aberto !== c.id && 'line-clamp-3')}>{c.trecho}</p>
                <span className="text-xs font-medium text-primary">{aberto === c.id ? 'Recolher' : 'Ver trecho'}</span>
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={c.categoria ?? ''}
                  disabled={ocupado === c.id}
                  onChange={(e) => e.target.value && void atualizar(c, { categoria: e.target.value })}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  aria-label="Categoria"
                >
                  {!c.categoria && <option value="">{nomeCategoria(null)}</option>}
                  {categorias.map((k) => <option key={k.slug} value={k.slug}>{k.nome}</option>)}
                </select>
                {c.status === 'em_revisao' ? (
                  <Button size="sm" variant="outline" className="gap-1" disabled={ocupado === c.id} onClick={() => void atualizar(c, { status: 'publicado' })}>
                    <Check className="h-3.5 w-3.5" /> Aprovar
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="gap-1" disabled={ocupado === c.id} onClick={() => void atualizar(c, { status: 'em_revisao' })}>
                    <PauseCircle className="h-3.5 w-3.5" /> Reter
                  </Button>
                )}
                <Button size="sm" variant="destructive" className="gap-1" disabled={ocupado === c.id} onClick={() => void remover(c)}>
                  <Trash2 className="h-3.5 w-3.5" /> Remover
                </Button>
              </div>
            </Card>
          ))}
          <div className="flex justify-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
            <Button size="sm" variant="outline" disabled={!temMais} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Check, Loader2, MessageSquareQuote, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { muralService, type RecadoDoMural } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { cn } from '@/lib/utils';

/**
 * Mural do perfil: recados públicos que outras pessoas deixam aqui.
 *
 * Todo recado nasce pendente e só aparece depois que o dono aprova — é
 * conteúdo de terceiros no perfil de alguém, e sem aprovação vira canal de
 * spam e assédio. O dono vê os pendentes no topo, com Aprovar / Recusar.
 */
export default function MuralDoPerfil({
  donoId,
  donoNome,
  podeEscrever,
  onPrecisaAssinar,
}: {
  donoId: string;
  donoNome?: string;
  podeEscrever?: boolean;
  onPrecisaAssinar?: () => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [recados, setRecados] = useState<RecadoDoMural[]>([]);
  const [ehDono, setEhDono] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await muralService.listar(donoId);
      setRecados(r.recados);
      setEhDono(r.ehDono);
    } catch {
      setRecados([]);
    } finally {
      setCarregando(false);
    }
  }, [donoId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const enviar = async () => {
    const conteudo = texto.trim();
    if (conteudo.length < 3) return;
    setEnviando(true);
    try {
      await muralService.escrever(donoId, conteudo);
      setTexto('');
      toast({
        title: 'Recado enviado!',
        description: `Ele aparece no mural assim que ${donoNome || 'o perfil'} aprovar.`,
      });
    } catch (erro: any) {
      const codigo = erro?.response?.data?.error;
      if (codigo === 'premium_required') { onPrecisaAssinar?.(); return; }
      toast({
        title: 'Não foi possível enviar',
        description: erro?.response?.data?.message || 'Tente de novo em instantes.',
        variant: 'destructive',
      });
    } finally {
      setEnviando(false);
    }
  };

  const decidir = async (id: string, acao: 'aprovar' | 'recusar') => {
    setOcupado(id);
    try {
      await muralService.decidir(id, acao);
      setRecados((lista) => (acao === 'recusar'
        ? lista.filter((r) => r.id !== id)
        : lista.map((r) => (r.id === id ? { ...r, status: 'aprovado' } : r))));
      toast({ title: acao === 'aprovar' ? 'Recado aprovado — já aparece no seu perfil' : 'Recado recusado' });
    } catch {
      toast({ title: 'Não foi possível salvar', variant: 'destructive' });
    } finally {
      setOcupado(null);
    }
  };

  const apagar = async (id: string) => {
    if (!window.confirm('Apagar este recado do mural?')) return;
    setOcupado(id);
    try {
      await muralService.apagar(id);
      setRecados((lista) => lista.filter((r) => r.id !== id));
    } catch {
      toast({ title: 'Não foi possível apagar', variant: 'destructive' });
    } finally {
      setOcupado(null);
    }
  };

  const pendentes = recados.filter((r) => r.status === 'pendente');
  const aprovados = recados.filter((r) => r.status === 'aprovado');

  return (
    <div className="space-y-4">
      {!ehDono && podeEscrever !== false && (
        <div className="rounded-2xl border border-border/60 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <MessageSquareQuote className="h-4 w-4 text-brand-pink" /> Deixar um recado no mural
          </p>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value.slice(0, 1000))}
            rows={3}
            placeholder={`Escreva algo para ${donoNome || 'este perfil'}… O recado aparece depois que for aprovado.`}
            className="w-full rounded-xl border border-input bg-background p-2.5 text-sm"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">{texto.length}/1000 · visível para todos após aprovação</span>
            <button
              type="button"
              onClick={() => void enviar()}
              disabled={enviando || texto.trim().length < 3}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
              Enviar recado
            </button>
          </div>
        </div>
      )}

      {ehDono && pendentes.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="text-sm font-semibold text-amber-600">
            {pendentes.length} recado(s) esperando sua aprovação
          </p>
          <p className="text-xs text-muted-foreground">Só aparecem no seu perfil depois que você aprovar.</p>
          {pendentes.map((r) => (
            <CartaoRecado key={r.id} recado={r} onAbrirAutor={() => navigate(`/users/${r.autor.id}`)}>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={ocupado === r.id}
                  onClick={() => void decidir(r.id, 'aprovar')}
                  className="flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  <Check className="h-3.5 w-3.5" /> Aprovar
                </button>
                <button
                  type="button"
                  disabled={ocupado === r.id}
                  onClick={() => void decidir(r.id, 'recusar')}
                  className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-destructive disabled:opacity-60"
                >
                  <X className="h-3.5 w-3.5" /> Recusar
                </button>
              </div>
            </CartaoRecado>
          ))}
        </div>
      )}

      {carregando ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : aprovados.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {ehDono ? 'Seu mural ainda não tem recados aprovados.' : `Seja o primeiro a deixar um recado para ${donoNome || 'este perfil'}.`}
        </p>
      ) : (
        <div className="space-y-2">
          {aprovados.map((r) => (
            <CartaoRecado key={r.id} recado={r} onAbrirAutor={() => navigate(`/users/${r.autor.id}`)}>
              {(ehDono || r.autor.id === user?.id) && (
                <button
                  type="button"
                  disabled={ocupado === r.id}
                  onClick={() => void apagar(r.id)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Apagar
                </button>
              )}
            </CartaoRecado>
          ))}
        </div>
      )}
    </div>
  );
}

function CartaoRecado({
  recado,
  onAbrirAutor,
  children,
}: {
  recado: RecadoDoMural;
  onAbrirAutor: () => void;
  children?: React.ReactNode;
}) {
  const local = [recado.autor.cidade, recado.autor.estado].filter(Boolean).join('/');
  return (
    <div className={cn('rounded-xl border border-border/60 bg-background p-3', recado.status === 'pendente' && 'border-amber-500/40')}>
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={onAbrirAutor} className="flex min-w-0 items-center gap-2 text-left">
          {recado.autor.avatar ? (
            <img src={resolveServerUrl(recado.autor.avatar)} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold">
              {recado.autor.nome.charAt(0)}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{recado.autor.nome}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {[recado.autor.tipo, local].filter(Boolean).join(' · ')}
            </span>
          </span>
        </button>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {formatDistanceToNow(new Date(recado.criadoEm), { addSuffix: true, locale: ptBR })}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-line text-sm">{recado.conteudo}</p>
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}

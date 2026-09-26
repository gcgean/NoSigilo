import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Crown, Heart, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { curtidasRecebidasService, type CurtidaRecebida, type Fa } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { REACTION_EMOJI } from '@/lib/reactions';

function quando(iso: string) {
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return 'agora há pouco';
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d < 30 ? `há ${d} d` : new Date(iso).toLocaleDateString('pt-BR');
}

/**
 * Quem curtiu as minhas fotos e publicações, tudo numa lista só (antes era
 * preciso abrir post por post). No topo, quem mais curtiu — os "fãs".
 */
export default function QuemCurtiuMinhasFotos({
  aberto,
  aoFechar,
  onPrecisaAssinar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  onPrecisaAssinar?: () => void;
}) {
  const [curtidas, setCurtidas] = useState<CurtidaRecebida[]>([]);
  const [fas, setFas] = useState<Fa[]>([]);
  const [pagina, setPagina] = useState(1);
  const [temMais, setTemMais] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async (p: number) => {
    setCarregando(true);
    try {
      const r = await curtidasRecebidasService.listar(p);
      setCurtidas((atual) => (p === 1 ? r.curtidas : [...atual, ...r.curtidas]));
      if (p === 1) setFas(r.quemMaisCurtiu);
      setTemMais(r.temMais);
      setPagina(p);
    } catch (erro: any) {
      if (erro?.response?.data?.error === 'premium_required') {
        aoFechar();
        onPrecisaAssinar?.();
      }
    } finally {
      setCarregando(false);
    }
  }, [aoFechar, onPrecisaAssinar]);

  useEffect(() => { if (aberto) void carregar(1); }, [aberto, carregar]);

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="max-h-[88vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="h-4 w-4 fill-rose-500 text-rose-500" /> Quem curtiu suas fotos
          </DialogTitle>
        </DialogHeader>

        {fas.length > 0 && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-brand-pink">
              <Crown className="h-3.5 w-3.5" /> Quem mais curtiu você
            </p>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {fas.map((f) => (
                <Link key={f.pessoa.id} to={`/users/${f.pessoa.id}`} onClick={aoFechar} className="flex w-16 shrink-0 flex-col items-center text-center">
                  {f.pessoa.avatar ? (
                    <img src={resolveServerUrl(f.pessoa.avatar)} alt="" className="h-12 w-12 rounded-full object-cover ring-2 ring-primary/40" />
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted font-bold">{f.pessoa.nome.charAt(0)}</span>
                  )}
                  <span className="mt-1 w-full truncate text-[11px] font-medium">{f.pessoa.nome}</span>
                  <span className="text-[10px] text-muted-foreground">{f.total} curtida(s)</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1">
          {curtidas.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-muted/50">
              <Link to={`/users/${c.pessoa.id}`} onClick={aoFechar} className="flex min-w-0 flex-1 items-center gap-2.5">
                {c.pessoa.avatar ? (
                  <img src={resolveServerUrl(c.pessoa.avatar)} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted font-bold">{c.pessoa.nome.charAt(0)}</span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {c.pessoa.nome} {c.reacao && REACTION_EMOJI[c.reacao] ? REACTION_EMOJI[c.reacao] : '❤️'}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    curtiu {c.tipo === 'foto' ? 'sua foto' : 'sua publicação'} · {quando(c.em)}
                    {c.pessoa.cidade ? ` · ${c.pessoa.cidade}` : ''}
                  </span>
                </span>
              </Link>
              {c.miniatura && (
                <img src={resolveServerUrl(c.miniatura)} alt="" className="h-11 w-11 shrink-0 rounded-md object-cover" />
              )}
            </div>
          ))}

          {!carregando && curtidas.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Ninguém curtiu suas fotos ainda. Perfil com mais fotos recebe muito mais curtida.
            </p>
          )}
          {carregando && (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          )}
          {temMais && !carregando && (
            <button
              type="button"
              onClick={() => void carregar(pagina + 1)}
              className="w-full rounded-xl border border-border py-2 text-sm text-muted-foreground hover:bg-secondary"
            >
              Ver mais
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

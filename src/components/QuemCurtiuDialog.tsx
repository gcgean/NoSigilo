import { useEffect, useState } from 'react';
import { Heart, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { interactionsService } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { getUserProfileHref } from '@/utils/userProfileNavigation';
import { REACTION_EMOJI } from '@/lib/reactions';

type Curtida = {
  id: string;
  createdAt: string;
  reaction: string | null;
  user: { id: string; name: string; avatar: string | null };
};

function quandoFoi(iso: string) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d < 30 ? `há ${d} d` : new Date(iso).toLocaleDateString('pt-BR');
}

/** Lista de quem curtiu uma publicação — a mesma rota que o Feed já usa. */
export default function QuemCurtiuDialog({
  postId,
  onClose,
}: {
  postId: string | null;
  onClose: () => void;
}) {
  const [curtidas, setCurtidas] = useState<Curtida[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (!postId) return;
    let cancelado = false;
    setCarregando(true);
    setErro(false);
    setCurtidas([]);
    interactionsService
      .getLikes('post', postId)
      .then((dados: unknown) => { if (!cancelado) setCurtidas(Array.isArray(dados) ? (dados as Curtida[]) : []); })
      .catch(() => { if (!cancelado) setErro(true); })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [postId]);

  return (
    <Dialog open={!!postId} onOpenChange={(aberto) => { if (!aberto) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="h-4 w-4 fill-rose-500 text-rose-500" /> Quem curtiu
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-1 overflow-y-auto">
          {carregando && (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          )}
          {!carregando && erro && (
            <p className="py-6 text-center text-sm text-muted-foreground">Não foi possível carregar agora.</p>
          )}
          {!carregando && !erro && curtidas.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Ninguém curtiu ainda.</p>
          )}
          {curtidas.map((c) => (
            <Link
              key={c.id}
              to={getUserProfileHref(c.user.id)}
              onClick={onClose}
              className="flex items-center gap-3 rounded-lg p-2 hover:bg-secondary"
            >
              {c.user.avatar ? (
                <img src={resolveServerUrl(c.user.avatar)} alt="" className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-sm font-semibold">
                  {c.user.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.user.name}</p>
                <p className="text-xs text-muted-foreground">{quandoFoi(c.createdAt)}</p>
              </div>
              {c.reaction && (REACTION_EMOJI as Record<string, string>)[c.reaction] && (
                <span className="text-lg" aria-hidden>{(REACTION_EMOJI as Record<string, string>)[c.reaction]}</span>
              )}
            </Link>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

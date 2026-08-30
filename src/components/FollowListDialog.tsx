import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { usersService } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { formatProfileIdentityLine } from '@/utils/profileIdentity';
import { getUserProfileHref } from '@/utils/userProfileNavigation';

/**
 * Lista de seguidores / seguindo de um perfil.
 *
 * "Seguidor" é quem curtiu o perfil; "seguindo", quem o perfil curtiu — os
 * dois lados da mesma relação. Aberta a qualquer usuário logado.
 *
 * O backend já retira do resultado perfis banidos, desativados, admin e quem
 * tem bloqueio com quem está olhando.
 */
export type TipoDeLista = 'followers' | 'following';

type FollowListDialogProps = {
  /** id (ou nome) do perfil dono da lista */
  userId: string;
  tipo: TipoDeLista | null;
  onClose: () => void;
  /** id de quem está olhando, para o link do próprio perfil ir para /profile */
  viewerId?: string;
};

const PAGINA = 30;

export default function FollowListDialog({ userId, tipo, onClose, viewerId }: FollowListDialogProps) {
  const [itens, setItens] = useState<Array<{ id: string; name: string; avatar: string | null; gender: string | null; city: string | null; state: string | null }>>([]);
  const [carregando, setCarregando] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [temMais, setTemMais] = useState(false);

  // Recomeça do zero sempre que troca de aba (seguidores <-> seguindo).
  useEffect(() => {
    if (!tipo) return;
    setItens([]);
    setPagina(1);
    setTemMais(false);
  }, [tipo, userId]);

  useEffect(() => {
    if (!tipo || !userId) return;
    let cancelado = false;
    setCarregando(true);
    usersService
      .getFollows(userId, { type: tipo, page: pagina, limit: PAGINA })
      .then((r) => {
        if (cancelado) return;
        setItens((prev) => (pagina === 1 ? r.users : [...prev, ...r.users]));
        setTemMais(!!r.hasMore);
      })
      .catch(() => {
        if (!cancelado && pagina === 1) setItens([]);
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => { cancelado = true; };
  }, [tipo, userId, pagina]);

  const titulo = tipo === 'following' ? 'Seguindo' : 'Seguidores';

  return (
    <Dialog open={Boolean(tipo)} onOpenChange={(aberto) => { if (!aberto) onClose(); }}>
      <DialogContent className="flex max-h-[80svh] flex-col gap-0 p-0 sm:max-w-md">
        <DialogHeader className="border-b px-4 py-4 text-left">
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            {tipo === 'following'
              ? 'Perfis que este perfil curtiu.'
              : 'Perfis que curtiram este perfil.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {carregando && itens.length === 0 ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : itens.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              {tipo === 'following' ? 'Ainda não segue ninguém.' : 'Ainda não tem seguidores.'}
            </p>
          ) : (
            <ul>
              {itens.map((u) => (
                <li key={u.id}>
                  <Link
                    to={getUserProfileHref(u.id, viewerId)}
                    onClick={onClose}
                    className="flex items-center gap-3 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-secondary/50"
                  >
                    {u.avatar ? (
                      <img
                        src={resolveServerUrl(u.avatar)}
                        alt=""
                        width={40}
                        height={40}
                        className="h-10 w-10 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary font-semibold">
                        {u.name[0]?.toUpperCase() || 'U'}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{u.name}</span>
                      {formatProfileIdentityLine(u) ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {formatProfileIdentityLine(u)}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {temMais ? (
            <div className="p-3">
              <button
                type="button"
                disabled={carregando}
                onClick={() => setPagina((p) => p + 1)}
                className="w-full rounded-xl border py-2.5 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-60"
              >
                {carregando ? 'Carregando...' : 'Ver mais'}
              </button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

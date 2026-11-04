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
import { interactionsService, usersService } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { formatProfileIdentityLine } from '@/utils/profileIdentity';
import { getUserProfileHref } from '@/utils/userProfileNavigation';
import BandeiraPortugal from '@/components/BandeiraPortugal';

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
  /** Lista "seguindo" do próprio perfil: mostra "Deixar de seguir" em cada um. */
  podeDeixarDeSeguir?: boolean;
  /** Avisado depois de deixar de seguir alguém (para atualizar o contador). */
  onDeixouDeSeguir?: () => void;
};

const PAGINA = 30;

export default function FollowListDialog({ userId, tipo, onClose, viewerId, podeDeixarDeSeguir, onDeixouDeSeguir }: FollowListDialogProps) {
  const [itens, setItens] = useState<Array<{ id: string; name: string; avatar: string | null; gender: string | null; city: string | null; state: string | null }>>([]);
  const [carregando, setCarregando] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [temMais, setTemMais] = useState(false);
  // Dois toques: o primeiro arma a confirmação daquele perfil.
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const mostrarDeixar = podeDeixarDeSeguir && tipo === 'following';

  const deixarDeSeguir = async (id: string) => {
    if (removendo) return;
    if (confirmando !== id) {
      setConfirmando(id);
      window.setTimeout(() => setConfirmando((c) => (c === id ? null : c)), 4000);
      return;
    }
    setConfirmando(null);
    setRemovendo(id);
    try {
      await interactionsService.unlike('user', id);
      setItens((prev) => prev.filter((u) => u.id !== id));
      onDeixouDeSeguir?.();
    } catch {
      // fica na lista; a pessoa pode tentar de novo
    } finally {
      setRemovendo(null);
    }
  };

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
                <li key={u.id} className="flex items-center border-b last:border-b-0">
                  <Link
                    to={getUserProfileHref(u.id, viewerId)}
                    onClick={onClose}
                    className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/50"
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
                          {formatProfileIdentityLine(u)}<BandeiraPortugal state={u?.state} />
                        </span>
                      ) : null}
                    </span>
                  </Link>
                  {mostrarDeixar ? (
                    <button
                      type="button"
                      disabled={removendo === u.id}
                      onClick={() => void deixarDeSeguir(u.id)}
                      className={
                        'mr-3 shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ' +
                        (confirmando === u.id ? 'border-red-600 bg-red-600 text-white' : 'hover:bg-secondary')
                      }
                    >
                      {removendo === u.id ? '...' : confirmando === u.id ? 'Confirmar' : 'Deixar de seguir'}
                    </button>
                  ) : null}
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

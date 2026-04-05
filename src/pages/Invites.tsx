import { useEffect, useState } from 'react';
import { CheckCircle2, Copy, Link2, ShieldCheck, Sparkles, UserPlus, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { invitesService } from '@/services/api';

type InviteItem = {
  id: string;
  token: string;
  status: 'created' | 'pending_approval' | 'approved' | 'denied' | 'revoked';
  createdAt: string;
  updatedAt?: string;
  inviteeEmail?: string | null;
  invitee?: { id: string; name?: string | null; avatar?: string | null } | null;
};

export default function Invites() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [inviteItems, setInviteItems] = useState<InviteItem[]>([]);
  const [isLoadingInvites, setIsLoadingInvites] = useState(false);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);

  const loadInvites = async () => {
    setIsLoadingInvites(true);
    try {
      const list = await invitesService.listMine();
      setInviteItems(Array.isArray(list) ? list : []);
    } catch {
      setInviteItems([]);
    } finally {
      setIsLoadingInvites(false);
    }
  };

  useEffect(() => {
    void loadInvites();
  }, []);

  const handleCreateInvite = async () => {
    try {
      const created = await invitesService.create();
      if (created?.url && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(String(created.url));
      }
      toast({
        title: 'Convite criado',
        description: created?.url ? 'O link foi criado e copiado para a área de transferência.' : 'Seu link de convite está pronto.',
      });
      await loadInvites();
    } catch {
      toast({ title: 'Falha ao criar convite', description: 'Tente novamente.', variant: 'destructive' });
    }
  };

  const handleCopyInvite = async (invite: InviteItem) => {
    try {
      const url = `${window.location.origin}/register?invite=${encodeURIComponent(invite.token)}`;
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copiado', description: 'Envie esse link apenas para quem você realmente deseja indicar.' });
    } catch {
      toast({ title: 'Falha ao copiar', description: 'Copie o link manualmente mais tarde.', variant: 'destructive' });
    }
  };

  const handleApproveInvite = async (inviteId: string) => {
    setBusyInviteId(inviteId);
    try {
      await invitesService.approve(inviteId);
      toast({ title: 'Convite aprovado', description: 'O novo perfil já pode entrar na rede.' });
      await loadInvites();
    } catch {
      toast({ title: 'Falha ao aprovar', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setBusyInviteId(null);
    }
  };

  const handleDenyInvite = async (inviteId: string) => {
    setBusyInviteId(inviteId);
    try {
      await invitesService.deny(inviteId);
      toast({ title: 'Convite negado', description: 'Esse cadastro não foi aprovado por você.' });
      await loadInvites();
    } catch {
      toast({ title: 'Falha ao negar', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setBusyInviteId(null);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    setBusyInviteId(inviteId);
    try {
      await invitesService.revoke(inviteId);
      toast({ title: 'Link revogado', description: 'Esse convite não poderá mais ser usado.' });
      await loadInvites();
    } catch {
      toast({ title: 'Falha ao revogar', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setBusyInviteId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto w-full space-y-6">
      <div className="glass rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm text-primary">
              <ShieldCheck className="w-4 h-4" />
              Rede por indicação
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold">Gerar/Gerenciar convites</h1>
            <p className="text-muted-foreground max-w-2xl">
              Gere links únicos, acompanhe quem iniciou cadastro por você e aprove apenas pessoas que realmente pertencem ao meio liberal da rede.
            </p>
          </div>
          <Button type="button" className="bg-gradient-primary hover:opacity-90 gap-2 w-full sm:w-auto" onClick={handleCreateInvite}>
            <UserPlus className="w-4 h-4" />
            Gerar link de convite
          </Button>
        </div>
      </div>

      {user?.invitedBy ? (
        <div className="glass rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-primary mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">Seu padrinho na rede</p>
              <p className="text-sm text-muted-foreground">
                Seu acesso ao NoSigilo foi patrocinado por <span className="font-medium text-foreground">{user.invitedBy.name}</span>.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="glass rounded-2xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Seus convites</h2>
          <p className="text-sm text-muted-foreground">
            Aqui você acompanha convites livres, cadastros aguardando sua aprovação e acessos já autorizados por você.
          </p>
        </div>

        {isLoadingInvites ? (
          <p className="text-sm text-muted-foreground">Carregando convites...</p>
        ) : inviteItems.length === 0 ? (
          <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            Você ainda não gerou nenhum convite.
          </div>
        ) : (
          <div className="space-y-3">
            {inviteItems.map((invite) => {
              const shareUrl = `${window.location.origin}/register?invite=${encodeURIComponent(invite.token)}`;
              const isBusy = busyInviteId === invite.id;
              return (
                <div key={invite.id} className="rounded-xl border p-4 space-y-3">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="space-y-2 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">Convite de acesso</span>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                          {invite.status === 'created'
                            ? 'Aguardando uso'
                            : invite.status === 'pending_approval'
                              ? 'Aguardando sua aprovação'
                              : invite.status === 'approved'
                                ? 'Aprovado'
                                : invite.status === 'denied'
                                  ? 'Negado'
                                  : 'Revogado'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground break-all">{shareUrl}</p>
                      {invite.invitee?.name || invite.inviteeEmail ? (
                        <p className="text-sm text-muted-foreground">
                          Cadastro vinculado a <span className="font-medium text-foreground">{invite.invitee?.name || invite.inviteeEmail}</span>
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">Nenhum cadastro iniciado com este link ainda.</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {invite.status === 'created' ? (
                        <>
                          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => void handleCopyInvite(invite)}>
                            <Copy className="w-4 h-4" />
                            Copiar link
                          </Button>
                          <Button type="button" variant="ghost" size="sm" className="gap-2" disabled={isBusy} onClick={() => void handleRevokeInvite(invite.id)}>
                            <XCircle className="w-4 h-4" />
                            Revogar
                          </Button>
                        </>
                      ) : null}
                      {invite.status === 'pending_approval' ? (
                        <>
                          <Button type="button" size="sm" className="gap-2 bg-gradient-primary hover:opacity-90" disabled={isBusy} onClick={() => void handleApproveInvite(invite.id)}>
                            <CheckCircle2 className="w-4 h-4" />
                            Aprovar
                          </Button>
                          <Button type="button" variant="outline" size="sm" className="gap-2" disabled={isBusy} onClick={() => void handleDenyInvite(invite.id)}>
                            <XCircle className="w-4 h-4" />
                            Negar
                          </Button>
                        </>
                      ) : null}
                      {invite.status === 'approved' ? (
                        <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">
                          <CheckCircle2 className="w-4 h-4" />
                          Membro liberado por você
                        </div>
                      ) : null}
                      {invite.status === 'denied' ? (
                        <div className="inline-flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-600">
                          <XCircle className="w-4 h-4" />
                          Cadastro recusado
                        </div>
                      ) : null}
                      {invite.status === 'revoked' ? (
                        <div className="inline-flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm text-muted-foreground">
                          <Link2 className="w-4 h-4" />
                          Link encerrado
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

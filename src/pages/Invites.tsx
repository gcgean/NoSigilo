import { useEffect, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Clock,
  Copy,
  Gift,
  Link2,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { invitesService } from '@/services/api';

type InviteItem = {
  id: string;
  token: string;
  status: 'created' | 'revoked' | 'approved' | 'denied' | 'pending_approval';
  createdAt: string;
  updatedAt?: string;
  entrantsCount?: number;
  entries?: Array<{
    id: string;
    createdAt: string;
    inviteeEmail?: string | null;
    invitee?: { id: string; name?: string | null; avatar?: string | null } | null;
  }>;
};

type RewardProgress = Awaited<ReturnType<typeof invitesService.getRewardProgress>>;

const VALIDATION_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Aguardando ações', color: 'text-yellow-600 bg-yellow-500/10' },
  validated: { label: 'Validado ✓', color: 'text-emerald-600 bg-emerald-500/10' },
  failed: { label: 'Falhou', color: 'text-red-500 bg-red-500/10' },
  expired: { label: 'Expirado', color: 'text-muted-foreground bg-secondary' },
};

const FAILED_REASON_LABELS: Record<string, string> = {
  same_ip_as_inviter: 'IP coincide com o invitante',
  deadline_passed: 'Prazo encerrado sem completar ações',
};

const ACTION_BIT_LABELS = ['Perfil ≥50%', 'Enviou mensagem', 'Curtiu perfil'];

export default function Invites() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [inviteItems, setInviteItems] = useState<InviteItem[]>([]);
  const [isLoadingInvites, setIsLoadingInvites] = useState(false);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);
  const [rewardProgress, setRewardProgress] = useState<RewardProgress | null>(null);
  const [isLoadingProgress, setIsLoadingProgress] = useState(false);

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

  const loadRewardProgress = async () => {
    setIsLoadingProgress(true);
    try {
      const progress = await invitesService.getRewardProgress();
      setRewardProgress(progress);
    } catch {
      setRewardProgress(null);
    } finally {
      setIsLoadingProgress(false);
    }
  };

  useEffect(() => {
    void loadInvites();
    void loadRewardProgress();
  }, []);

  const handleCreateInvite = async () => {
    try {
      const created = await invitesService.create();
      if (created?.token && navigator?.clipboard?.writeText) {
        const inviteUrl = `${window.location.origin}/invite/${encodeURIComponent(String(created.token))}`;
        await navigator.clipboard.writeText(inviteUrl);
      } else if (created?.url && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(String(created.url));
      }
      toast({
        title: 'Convite criado',
        description: created?.url ? 'O link foi criado e copiado para a área de transferência.' : 'Seu link de convite está pronto.',
      });
      await loadInvites();
    } catch (err: any) {
      if (err?.response?.data?.error === 'too_many_active_invites') {
        toast({ title: 'Limite atingido', description: 'Você já tem 5 convites ativos. Revogue algum antes de criar outro.', variant: 'destructive' });
      } else {
        toast({ title: 'Falha ao criar convite', description: 'Tente novamente.', variant: 'destructive' });
      }
    }
  };

  const handleCopyInvite = async (invite: InviteItem) => {
    try {
      const url = `${window.location.origin}/invite/${encodeURIComponent(invite.token)}`;
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copiado', description: 'Envie esse link apenas para quem você realmente deseja indicar.' });
    } catch {
      toast({ title: 'Falha ao copiar', description: 'Copie o link manualmente mais tarde.', variant: 'destructive' });
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

  const nextTier = rewardProgress?.nextTier;
  const validatedCount = rewardProgress?.validatedCount ?? 0;
  const progressPct = nextTier ? Math.min(100, Math.round((validatedCount / nextTier.count) * 100)) : 100;

  return (
    <div className="max-w-4xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="glass rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm text-primary">
              <ShieldCheck className="w-4 h-4" />
              Rede por indicação
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold">Convites & Recompensas</h1>
            <p className="text-muted-foreground max-w-2xl">
              Indique amigos, ganhe Premium. Cada indicado precisa completar pelo menos 2 das 3 ações de ativação nos primeiros 7 dias.
            </p>
          </div>
          <Button type="button" className="bg-gradient-primary hover:opacity-90 gap-2 w-full sm:w-auto" onClick={handleCreateInvite}>
            <UserPlus className="w-4 h-4" />
            Gerar link de convite
          </Button>
        </div>
      </div>

      {/* Reward progress */}
      {!isLoadingProgress && rewardProgress && (
        <div className="glass rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Progresso de recompensas</h2>
          </div>

          {/* Tier cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {rewardProgress.tiers.map((tier) => (
              <div
                key={tier.rewardType}
                className={`rounded-xl border p-4 space-y-2 transition-colors ${
                  tier.reached
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border bg-secondary/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{tier.label}</span>
                  {tier.granted ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : tier.reached ? (
                    <Award className="w-4 h-4 text-primary animate-pulse" />
                  ) : (
                    <Award className="w-4 h-4 text-muted-foreground/40" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{tier.count} indicados validados</p>
                <div className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary font-medium">
                  +{tier.days} dias Premium
                </div>
                {tier.granted && (
                  <p className="text-xs text-emerald-600 font-medium">Recompensa resgatada ✓</p>
                )}
                {tier.reached && !tier.granted && (
                  <p className="text-xs text-primary font-medium">Meta atingida!</p>
                )}
              </div>
            ))}
          </div>

          {/* Progress bar toward next tier */}
          {nextTier && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Users className="w-4 h-4" />
                  <span>
                    <span className="font-semibold text-foreground">{validatedCount}</span>
                    {' / '}
                    <span>{nextTier.count}</span> indicações validadas
                  </span>
                </span>
                <span className="font-semibold">{progressPct}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-purple-500 transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Faltam{' '}
                <span className="font-semibold text-foreground">{nextTier.count - validatedCount}</span>{' '}
                indicações para ganhar <span className="font-semibold text-foreground">{nextTier.days} dias</span> de Premium ({nextTier.label})
              </p>
            </div>
          )}

          {!nextTier && (
            <div className="rounded-xl bg-primary/10 border border-primary/20 px-4 py-3 text-sm text-primary font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Você conquistou todas as recompensas! Continue indicando para ajudar a comunidade crescer.
            </div>
          )}

          {/* Recent invitee entries with validation status */}
          {rewardProgress.recentEntries.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Indicados recentes</p>
              <div className="space-y-2">
                {rewardProgress.recentEntries.map((entry) => {
                  const statusMeta = VALIDATION_STATUS_LABELS[entry.validationStatus] ?? VALIDATION_STATUS_LABELS.pending;
                  const completedActions = ACTION_BIT_LABELS.filter((_, i) => (entry.actionsBitmask >> i) & 1);
                  const pendingActions = ACTION_BIT_LABELS.filter((_, i) => !((entry.actionsBitmask >> i) & 1));
                  const deadlineDate = entry.validationDeadline ? new Date(entry.validationDeadline) : null;
                  const daysLeft = deadlineDate ? Math.ceil((deadlineDate.getTime() - Date.now()) / 86400000) : null;

                  return (
                    <div key={entry.id} className="rounded-xl border bg-secondary/30 px-4 py-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-secondary border flex items-center justify-center text-xs font-bold overflow-hidden shrink-0">
                            {entry.inviteeAvatar ? (
                              <img src={entry.inviteeAvatar} alt="" className="w-full h-full object-cover" />
                            ) : (
                              (entry.inviteeName ?? '?')[0]?.toUpperCase()
                            )}
                          </div>
                          <span className="text-sm font-medium">{entry.inviteeName ?? 'Novo membro'}</span>
                        </div>
                        <span className={`text-xs rounded-full px-2.5 py-0.5 font-medium ${statusMeta.color}`}>
                          {statusMeta.label}
                        </span>
                      </div>

                      {entry.failedReason && (
                        <p className="text-xs text-red-500">
                          {FAILED_REASON_LABELS[entry.failedReason] ?? entry.failedReason}
                        </p>
                      )}

                      {entry.validationStatus === 'pending' && (
                        <div className="space-y-1">
                          {completedActions.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {completedActions.map((a) => (
                                <span key={a} className="text-xs rounded-full bg-emerald-500/10 text-emerald-600 px-2 py-0.5 flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" /> {a}
                                </span>
                              ))}
                            </div>
                          )}
                          {pendingActions.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {pendingActions.map((a) => (
                                <span key={a} className="text-xs rounded-full bg-secondary text-muted-foreground px-2 py-0.5 flex items-center gap-1">
                                  <Clock className="w-3 h-3" /> {a}
                                </span>
                              ))}
                            </div>
                          )}
                          {daysLeft !== null && daysLeft > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Prazo: <span className="font-medium text-foreground">{daysLeft} dia{daysLeft !== 1 ? 's' : ''}</span> restante{daysLeft !== 1 ? 's' : ''}
                            </p>
                          )}
                          {daysLeft !== null && daysLeft <= 0 && (
                            <p className="text-xs text-red-500">Prazo encerrado</p>
                          )}
                        </div>
                      )}

                      {entry.validationStatus === 'validated' && entry.validatedAt && (
                        <p className="text-xs text-muted-foreground">
                          Validado em {new Date(entry.validatedAt).toLocaleDateString('pt-BR')}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sponsor */}
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

      {/* Invite links */}
      <div className="glass rounded-2xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Seus links de convite</h2>
          <p className="text-sm text-muted-foreground">
            Cada link pode ser usado por mais de uma pessoa. Você pode ter até 5 links ativos simultâneos.
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
                          {invite.status === 'created' ? 'Ativo' : invite.status === 'revoked' ? 'Revogado' : String(invite.status)}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          <Users className="w-3 h-3" />
                          {invite.entrantsCount || 0} entraram
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground break-all">{shareUrl}</p>
                      {invite.entries && invite.entries.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">Entradas registradas por este convite:</p>
                          <div className="space-y-1">
                            {invite.entries.map((entry) => (
                              <div key={entry.id} className="rounded-lg bg-secondary/40 px-3 py-2 text-sm">
                                <span className="font-medium text-foreground">{entry.invitee?.name || entry.inviteeEmail || 'Novo membro'}</span>
                                <span className="text-muted-foreground"> entrou em {new Date(entry.createdAt).toLocaleString('pt-BR')}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Nenhum cadastro entrou por este link ainda.</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {invite.status === 'created' ? (
                        <>
                          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => void handleCopyInvite(invite)}>
                            <Copy className="w-4 h-4" />
                            Copiar link
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="gap-2"
                            disabled={isBusy}
                            onClick={() => void handleRevokeInvite(invite.id)}
                          >
                            <XCircle className="w-4 h-4" />
                            Revogar
                          </Button>
                        </>
                      ) : null}
                      {invite.status === 'revoked' ? (
                        <div className="inline-flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm text-muted-foreground">
                          <Link2 className="w-4 h-4" />
                          Link encerrado
                        </div>
                      ) : null}
                      {invite.status === 'created' && (invite.entrantsCount || 0) > 0 ? (
                        <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">
                          <CheckCircle2 className="w-4 h-4" />
                          Convite em uso
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

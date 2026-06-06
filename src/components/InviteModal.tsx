import { useEffect, useState } from 'react';
import { X, Copy, Gift, UserPlus, Users, CheckCircle2, Award, Link2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { invitesService } from '@/services/api';
import { cn } from '@/lib/utils';
import { getSiteUrl } from '@/utils/serverUrl';

type InviteItem = {
  id: string;
  token: string;
  status: 'created' | 'revoked' | 'approved' | 'denied' | 'pending_approval';
  createdAt: string;
  entrantsCount?: number;
};

type RewardProgress = Awaited<ReturnType<typeof invitesService.getRewardProgress>>;

type Props = { open: boolean; onClose: () => void };

export default function InviteModal({ open, onClose }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [invites, setInvites] = useState<InviteItem[]>([]);
  const [rewardProgress, setRewardProgress] = useState<RewardProgress | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const validatedCount = rewardProgress?.validatedCount ?? 0;
  const nextTier = rewardProgress?.tiers?.find((t) => !t.reached) ?? rewardProgress?.tiers?.[0];
  const targetCount = nextTier?.count ?? 3;
  const progressPct = Math.min(100, Math.round((validatedCount / targetCount) * 100));
  const allReached = rewardProgress?.tiers?.every((t) => t.reached) ?? false;

  const activeInvites = invites.filter((i) => i.status === 'created' || i.status === 'approved');

  const load = async () => {
    setIsLoading(true);
    try {
      const [list, progress] = await Promise.allSettled([
        invitesService.listMine(),
        invitesService.getRewardProgress(),
      ]);
      if (list.status === 'fulfilled') setInvites(Array.isArray(list.value) ? list.value : []);
      if (progress.status === 'fulfilled') setRewardProgress(progress.value);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const getInviteUrl = (token: string) =>
    `${getSiteUrl()}/invite/${encodeURIComponent(token)}`;

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const created = await invitesService.create();
      const url = created?.token
        ? getInviteUrl(String(created.token))
        : created?.url
        ? String(created.url)
        : null;
      if (url) await navigator.clipboard.writeText(url);
      toast({
        title: '✅ Link criado e copiado!',
        description: 'Compartilhe com quem você quer indicar.',
      });
      await load();
    } catch (err: any) {
      if (err?.response?.data?.error === 'too_many_active_invites') {
        toast({ title: 'Limite atingido', description: 'Você já tem 5 convites ativos.', variant: 'destructive' });
      } else {
        toast({ title: 'Falha ao criar convite', description: 'Tente novamente.', variant: 'destructive' });
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopy = async (invite: InviteItem) => {
    const url = getInviteUrl(invite.token);
    await navigator.clipboard.writeText(url);
    setCopiedId(invite.id);
    toast({ title: '✅ Link copiado!', description: 'Cole no WhatsApp, Instagram ou onde preferir.' });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleShare = async (invite: InviteItem) => {
    const url = getInviteUrl(invite.token);
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Entre no NoSigilo comigo!', url });
      } catch {}
    } else {
      await handleCopy(invite);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full sm:max-w-md max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-background shadow-2xl overflow-hidden">
        {/* Gradient strip */}
        <div className="h-1 w-full shrink-0 bg-gradient-to-r from-emerald-400 via-teal-500 to-primary" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-emerald-500" />
            <span className="font-bold text-base">Convidar amigos</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {isLoading && (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          )}

          {!isLoading && (
            <>
              {/* Reward callout */}
              <div className="rounded-2xl bg-gradient-to-br from-emerald-500/15 to-teal-500/10 border border-emerald-400/30 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-emerald-500 shrink-0" />
                  <p className="font-semibold text-sm">
                    {allReached
                      ? '🎉 Você conquistou todas as recompensas!'
                      : `Indique ${targetCount} amigos → ganhe ${nextTier?.days ?? 30} dias de Premium grátis`}
                  </p>
                </div>

                {/* Progress */}
                {!allReached && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Users className="w-3.5 h-3.5" />
                        {validatedCount}/{targetCount} validados
                      </span>
                      <span className="font-semibold text-emerald-600">{progressPct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-500"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Faltam <span className="font-semibold text-foreground">{Math.max(0, targetCount - validatedCount)}</span> indicações.
                      O convidado precisa completar 2 ações nos primeiros 7 dias.
                    </p>
                  </div>
                )}

                {allReached && (
                  <div className="flex items-center gap-2 text-xs text-emerald-600 font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    Continue indicando para ajudar a comunidade crescer!
                  </div>
                )}
              </div>

              {/* Tiers */}
              {rewardProgress?.tiers && rewardProgress.tiers.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {rewardProgress.tiers.map((tier) => (
                    <div
                      key={tier.rewardType}
                      className={cn(
                        'rounded-xl border p-3 text-center space-y-1 transition-colors',
                        tier.reached ? 'border-emerald-400/40 bg-emerald-500/10' : 'border-border bg-secondary/20'
                      )}
                    >
                      {tier.granted ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                      ) : tier.reached ? (
                        <Award className="w-4 h-4 text-primary mx-auto animate-pulse" />
                      ) : (
                        <Award className="w-4 h-4 text-muted-foreground/40 mx-auto" />
                      )}
                      <p className="text-[11px] font-semibold">{tier.count} amigos</p>
                      <p className="text-[10px] text-emerald-600 font-medium">+{tier.days} dias</p>
                      {tier.granted && <p className="text-[9px] text-emerald-500">Resgatado ✓</p>}
                    </div>
                  ))}
                </div>
              )}

              {/* Create invite button */}
              <Button
                className="w-full py-5 text-base font-bold bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 gap-2"
                onClick={() => void handleCreate()}
                disabled={isCreating}
              >
                {isCreating ? (
                  <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Criando link...</>
                ) : (
                  <><UserPlus className="w-5 h-5" /> Gerar e copiar link de convite</>
                )}
              </Button>

              {/* Active invite links */}
              {activeInvites.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Seus links ativos ({activeInvites.length})
                  </p>
                  <div className="space-y-2">
                    {activeInvites.map((invite) => {
                      const url = getInviteUrl(invite.token);
                      const shortUrl = url.replace(/^https?:\/\//, '').slice(0, 36) + '…';
                      return (
                        <div
                          key={invite.id}
                          className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5"
                        >
                          <Link2 className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="flex-1 text-xs text-muted-foreground truncate">{shortUrl}</span>
                          <div className="flex gap-1.5 shrink-0">
                            {'share' in navigator && (
                              <button
                                type="button"
                                onClick={() => void handleShare(invite)}
                                className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
                                title="Compartilhar"
                              >
                                <ExternalLink className="w-3.5 h-3.5 text-primary" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void handleCopy(invite)}
                              className={cn(
                                'h-7 w-7 flex items-center justify-center rounded-lg transition-colors',
                                copiedId === invite.id ? 'bg-emerald-500/20 text-emerald-600' : 'hover:bg-muted text-muted-foreground'
                              )}
                              title="Copiar link"
                            >
                              {copiedId === invite.id ? (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* How it works */}
              <div className="rounded-2xl border border-border/60 bg-secondary/30 p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Como funciona</p>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-[9px] font-bold text-primary shrink-0">1</span>
                    <span>Gere o link e envie para seus amigos pelo WhatsApp, Instagram ou onde preferir</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-[9px] font-bold text-primary shrink-0">2</span>
                    <span>O amigo se cadastra pelo seu link e completa o perfil + 1 ação em 7 dias</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-[9px] font-bold text-emerald-600 shrink-0">✓</span>
                    <span>A cada 3 indicações validadas você ganha dias de Premium automaticamente</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

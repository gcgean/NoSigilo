import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BadgeDollarSign,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  DollarSign,
  Download,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  Send as SendIcon,
  Share2,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { promoterService, promoterSupportService, type PromoterProfile, type PromoterCommission, type PromoterStats, type PromoterReferredUser, type SupportMessage } from '@/services/api';
import { invitesService } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import InviteModal from '@/components/InviteModal';
import { getSiteUrl, resolveServerUrl } from '@/utils/serverUrl';
import { generatePromoterStoryImage } from '@/utils/promoterShareImage';

const REFERRED_STATUS_META: Record<string, { label: string; color: string }> = {
  subscriber:  { label: 'Assinante',  color: 'bg-emerald-500/10 text-emerald-600 border-emerald-400/30' },
  trial:       { label: 'Trial',      color: 'bg-blue-500/10 text-blue-600 border-blue-400/30' },
  expired:     { label: 'Expirado',   color: 'bg-amber-500/10 text-amber-600 border-amber-400/30' },
  deactivated: { label: 'Desativado', color: 'bg-muted text-muted-foreground border-border' },
  banned:      { label: 'Banido',     color: 'bg-red-500/10 text-red-500 border-red-400/30' },
};

const COMMISSION_RATE = 0.20;
const SUBSCRIPTION_PRICE = 9.90;
const COMMISSION_PER_PLAN = SUBSCRIPTION_PRICE * COMMISSION_RATE; // R$1.98

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendente', color: 'bg-yellow-500/10 text-yellow-600 border-yellow-400/30' },
  approved: { label: 'Aprovada', color: 'bg-blue-500/10 text-blue-600 border-blue-400/30' },
  paid: { label: 'Paga ✓', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-400/30' },
  cancelled: { label: 'Cancelada', color: 'bg-red-500/10 text-red-500 border-red-400/30' },
};

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function Promoter() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [promoter, setPromoter] = useState<PromoterProfile | null>(null);
  const [stats, setStats] = useState<PromoterStats | null>(null);
  const [commissions, setCommissions] = useState<PromoterCommission[]>([]);
  const [referredUsers, setReferredUsers] = useState<PromoterReferredUser[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showAllCommissions, setShowAllCommissions] = useState(false);
  const [showAllReferred, setShowAllReferred] = useState(false);

  // Support chat
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([]);
  const [supportInput, setSupportInput] = useState('');
  const [isSendingSupport, setIsSendingSupport] = useState(false);

  // Activation form
  const [fullName, setFullName] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  // Invite link
  const [inviteUrl, setInviteUrl] = useState('');
  const [generatingImg, setGeneratingImg] = useState<null | 'download' | 'share'>(null);

  const loadData = async () => {
    setIsLoading(true);
    // Pre-fill contact email with account email if not set yet
    if (user?.email && !contactEmail) setContactEmail(user.email);
    try {
      const { promoter: p } = await promoterService.getProfile();
      setPromoter(p);
      if (p) {
        const [dash, supportData, invites] = await Promise.all([
          promoterService.getDashboard(),
          promoterSupportService.getMessages().catch(() => ({ messages: [] })),
          invitesService.listMine().catch(() => []),
        ]);
        setStats(dash.stats);
        setCommissions(dash.commissions);
        setReferredUsers(dash.referredUsers ?? []);
        setSupportMessages(supportData.messages);
        const active = Array.isArray(invites) ? invites.find((i: any) => i.status === 'created') : null;
        if (active?.token) {
          setInviteUrl(`${getSiteUrl()}/invite/${encodeURIComponent(active.token)}`);
        }
      }
    } catch {
      // not promoter or not loaded
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const handleActivate = async () => {
    if (!fullName.trim() || !pixKey.trim() || !acceptTerms) return;
    setIsActivating(true);
    try {
      await promoterService.activate({ fullName: fullName.trim(), pixKey: pixKey.trim(), whatsapp: whatsapp.trim() || undefined, contactEmail: contactEmail.trim() || undefined, acceptTerms: true });
      toast({ title: 'Programa ativado!', description: 'Seu perfil de promotor foi ativado. Agora gere seu convite e comece a ganhar.' });
      await loadData();
    } catch {
      toast({ title: 'Erro ao ativar', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsActivating(false);
    }
  };

  const handleCopyInvite = async () => {
    if (!inviteUrl) {
      setShowInviteModal(true);
      return;
    }
    try {
      await navigator.clipboard.writeText(`Entre para a plataforma pelo meu convite exclusivo e faça parte da comunidade: ${inviteUrl}`);
      toast({ title: 'Link copiado!', description: 'Agora é só enviar para os seus contatos.' });
    } catch {
      toast({ title: 'Falha ao copiar', description: 'Copie manualmente o link abaixo.', variant: 'destructive' });
    }
  };

  const handleShareInvite = async () => {
    const text = `Entre para a plataforma pelo meu convite exclusivo e faça parte da comunidade: ${inviteUrl}`;
    if (navigator.share) {
      try {
        await navigator.share({ text, url: inviteUrl });
      } catch {}
    } else {
      await handleCopyInvite();
    }
  };

  const buildShareImage = async () => {
    if (!inviteUrl) {
      setShowInviteModal(true);
      return null;
    }
    return await generatePromoterStoryImage(inviteUrl, user?.name || promoter?.fullName || undefined);
  };

  const downloadBlob = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nosigilo-convite.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadImage = async () => {
    if (generatingImg) return;
    setGeneratingImg('download');
    try {
      const blob = await buildShareImage();
      if (blob) {
        downloadBlob(blob);
        toast({ title: 'Imagem baixada!', description: 'Poste no seu story ou envie no WhatsApp.' });
      }
    } catch {
      toast({ title: 'Erro ao gerar imagem', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setGeneratingImg(null);
    }
  };

  const handleShareImage = async () => {
    if (generatingImg) return;
    setGeneratingImg('share');
    try {
      const blob = await buildShareImage();
      if (!blob) return;
      const file = new File([blob], 'nosigilo-convite.png', { type: 'image/png' });
      const text = `Entre na NoSigilo.net pelo meu convite: ${inviteUrl}`;
      const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
      if (nav.canShare && nav.canShare({ files: [file] })) {
        try {
          await nav.share({ files: [file], text } as ShareData);
        } catch {
          // usuário cancelou o compartilhamento
        }
      } else {
        // Fallback: baixa a imagem e abre o WhatsApp com o texto
        downloadBlob(blob);
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
        toast({ title: 'Imagem baixada', description: 'Anexe a imagem na conversa do WhatsApp que abrimos.' });
      }
    } catch {
      toast({ title: 'Erro ao gerar imagem', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setGeneratingImg(null);
    }
  };

  const visibleCommissions = showAllCommissions ? commissions : commissions.slice(0, 5);
  const visibleReferred = showAllReferred ? referredUsers : referredUsers.slice(0, 8);
  const referredCounts = referredUsers.reduce(
    (acc, u) => { acc[u.status] = (acc[u.status] || 0) + 1; return acc; },
    {} as Record<string, number>
  );

  const handleSendSupport = async () => {
    const msg = supportInput.trim();
    if (!msg) return;
    setIsSendingSupport(true);
    try {
      await promoterSupportService.sendMessage(msg);
      setSupportInput('');
      const data = await promoterSupportService.getMessages();
      setSupportMessages(data.messages);
    } catch {
      toast({ title: 'Erro ao enviar mensagem', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsSendingSupport(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Not a promoter yet: activation form ──────────────────────────────────
  if (!promoter) {
    return (
      <>
        <InviteModal open={showInviteModal} onClose={() => setShowInviteModal(false)} />
        <div className="max-w-2xl mx-auto w-full space-y-6">
          {/* Hero */}
          <div className="glass rounded-2xl overflow-hidden">
            <div className="bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 px-6 pt-8 pb-10 text-white">
              <div className="flex items-center gap-2 mb-3">
                <BadgeDollarSign className="w-5 h-5 text-yellow-300" />
                <span className="text-sm font-semibold uppercase tracking-wide text-white/80">Programa de Indicação</span>
              </div>
              <h1 className="text-3xl font-bold mb-2">Ganhe dinheiro indicando a plataforma</h1>
              <p className="text-white/85 text-base">
                Torne-se um promotor da nossa comunidade e receba comissão por cada novo assinante que entrar através do seu convite.
              </p>
            </div>

            {/* Como funciona */}
            <div className="px-6 -mt-5 pb-6">
              <div className="rounded-2xl bg-card border shadow-sm p-5 space-y-4">
                <h2 className="font-semibold text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  Como funciona
                </h2>
                <ol className="space-y-3">
                  {[
                    { n: '1', text: 'Ative seu perfil de promotor preenchendo seus dados abaixo.' },
                    { n: '2', text: 'Gere seu convite exclusivo e compartilhe fora da plataforma.' },
                    { n: '3', text: 'Quando alguém assinar usando seu convite, você ganha 20% do valor pago.' },
                    { n: '4', text: 'Acompanhe seus ganhos pelo painel e receba via Pix mensalmente.' },
                  ].map((step) => (
                    <li key={step.n} className="flex items-start gap-3">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-500/15 text-emerald-600 text-xs font-bold flex items-center justify-center mt-0.5">
                        {step.n}
                      </span>
                      <span className="text-sm text-muted-foreground">{step.text}</span>
                    </li>
                  ))}
                </ol>

                {/* Exemplo de ganho */}
                <div className="rounded-xl bg-emerald-500/8 border border-emerald-500/20 p-4">
                  <p className="text-sm font-semibold text-emerald-700 mb-1">Exemplo de ganho</p>
                  <p className="text-sm text-muted-foreground">
                    Em uma assinatura de <strong>R$ {SUBSCRIPTION_PRICE.toFixed(2).replace('.', ',')}</strong>, sua comissão será de{' '}
                    <strong className="text-emerald-600">R$ {COMMISSION_PER_PLAN.toFixed(2).replace('.', ',')}</strong> por assinatura confirmada.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    10 assinantes × R$ {COMMISSION_PER_PLAN.toFixed(2).replace('.', ',')} ={' '}
                    <strong className="text-emerald-600">R$ {(10 * COMMISSION_PER_PLAN).toFixed(2).replace('.', ',')} por mês</strong>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Activation form */}
          <div className="glass rounded-2xl p-6 space-y-5">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              Quero ser promotor
            </h2>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Nome completo</label>
                <Input
                  placeholder="Seu nome completo para o pagamento"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Chave Pix</label>
                <Input
                  placeholder="CPF, e-mail, telefone ou chave aleatória"
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">As comissões serão pagas via Pix mensalmente.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">WhatsApp <span className="text-muted-foreground font-normal">(opcional)</span></label>
                <Input
                  placeholder="(11) 99999-9999"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  type="tel"
                />
                <p className="text-xs text-muted-foreground">Para facilitar o contato sobre pagamentos e suporte.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">E-mail para notificações</label>
                <Input
                  placeholder="seu@email.com"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  type="email"
                />
                <p className="text-xs text-muted-foreground">
                  Você receberá o resumo mensal de comissões neste e-mail. Pré-preenchido com o e-mail da sua conta.
                </p>
              </div>

              {/* Terms */}
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  className="mt-1 accent-emerald-500"
                />
                <span className="text-sm text-muted-foreground leading-relaxed">
                  Li e aceito as regras do Programa de Indicação. Entendo que as comissões são calculadas
                  apenas sobre assinaturas pagas e confirmadas. Cancelamentos, estornos ou pagamentos
                  recusados não geram comissão. Os pagamentos ocorrem mensalmente.
                </span>
              </label>
            </div>

            {/* Warning */}
            <div className="flex items-start gap-2 rounded-xl bg-yellow-500/8 border border-yellow-500/20 p-3 text-sm text-yellow-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                <strong>Aviso importante:</strong> Os ganhos dependem exclusivamente das assinaturas efetivamente realizadas pelas pessoas convidadas.
                Não fazemos promessas de ganhos mínimos.
              </p>
            </div>

            <Button
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white gap-2"
              disabled={!fullName.trim() || !pixKey.trim() || !acceptTerms || isActivating}
              onClick={handleActivate}
            >
              {isActivating ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeDollarSign className="w-4 h-4" />}
              {isActivating ? 'Ativando...' : 'Quero ser promotor'}
            </Button>
          </div>
        </div>
      </>
    );
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────
  return (
    <>
      <InviteModal open={showInviteModal} onClose={() => { setShowInviteModal(false); void loadData(); }} />
      <div className="max-w-4xl mx-auto w-full space-y-6">

        {/* Header */}
        <div className="glass rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <BadgeDollarSign className="w-5 h-5 text-emerald-500" />
                <span className="text-sm font-semibold text-emerald-600 uppercase tracking-wide">Programa de Indicação</span>
                <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-400/30 text-xs">Ativo</Badge>
              </div>
              <h1 className="text-2xl font-bold">Seu painel de promotor</h1>
              <p className="text-muted-foreground text-sm">Pix cadastrado: <strong>{promoter.pixKey}</strong></p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 w-full sm:w-auto"
              onClick={() => setShowInviteModal(true)}
            >
              <UserPlus className="w-4 h-4" />
              Gerar convite
            </Button>
          </div>
        </div>

        {/* Share invite */}
        {inviteUrl && (
          <div className="glass rounded-2xl p-5 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-2">
              <Share2 className="w-4 h-4 text-primary" />
              Seu link de convite
            </p>
            <div className="flex gap-2">
              <input
                readOnly
                value={inviteUrl}
                className="flex-1 rounded-xl border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground font-mono"
              />
              <Button size="sm" variant="outline" onClick={handleCopyInvite} className="gap-1.5 shrink-0">
                <Copy className="w-3.5 h-3.5" />
                Copiar
              </Button>
              <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1.5 shrink-0" onClick={handleShareInvite}>
                <Share2 className="w-3.5 h-3.5" />
                Compartilhar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground italic">
              "Entre para a plataforma pelo meu convite exclusivo e faça parte da comunidade: [link]"
            </p>

            {/* Imagem de divulgação (story 9:16) com QR do convite */}
            <div className="mt-2 rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <ImageIcon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Imagem para Instagram e WhatsApp</p>
                  <p className="text-xs text-muted-foreground">
                    Gera uma arte de story com a marca <strong>NoSigilo.net</strong> e o <strong>QR Code do seu convite</strong> —
                    quem escaneia entra já vinculado a você (sua comissão é preservada).
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 gap-1.5"
                  onClick={handleDownloadImage}
                  disabled={generatingImg !== null}
                >
                  {generatingImg === 'download' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  Baixar imagem
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white gap-1.5"
                  onClick={handleShareImage}
                  disabled={generatingImg !== null}
                >
                  {generatingImg === 'share' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
                  Compartilhar
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Stats grid */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: UserPlus, label: 'Convites criados', value: stats.invitesSent, color: 'text-blue-500' },
              { icon: Users, label: 'Cadastros', value: stats.totalSignups, color: 'text-purple-500' },
              { icon: TrendingUp, label: 'Assinaturas', value: stats.totalSubscriptions, color: 'text-emerald-500' },
              { icon: Wallet, label: 'Total gerado', value: formatBRL(stats.totalCommissionCents), color: 'text-yellow-500', isText: true },
            ].map((item) => (
              <Card key={item.label} className="p-4 space-y-1.5 glass">
                <item.icon className={`w-5 h-5 ${item.color}`} />
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="text-xl font-bold">{item.value}</p>
              </Card>
            ))}
          </div>
        )}

        {/* Financial summary */}
        {stats && (
          <div className="glass rounded-2xl p-5 space-y-4">
            <h2 className="font-semibold flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-500" />
              Resumo financeiro
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { label: 'Pendente de aprovação', cents: stats.pendingCents, color: 'text-yellow-600', border: 'border-yellow-400/30 bg-yellow-500/5' },
                { label: 'Aprovado (aguard. pagto)', cents: stats.approvedCents, color: 'text-blue-600', border: 'border-blue-400/30 bg-blue-500/5' },
                { label: 'Já pago via Pix', cents: stats.paidCents, color: 'text-emerald-600', border: 'border-emerald-400/30 bg-emerald-500/5' },
              ].map((item) => (
                <div key={item.label} className={`rounded-xl border p-4 ${item.border}`}>
                  <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
                  <p className={`text-2xl font-bold ${item.color}`}>{formatBRL(item.cents)}</p>
                </div>
              ))}
            </div>
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-secondary/30 rounded-xl px-4 py-3">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              As comissões são calculadas apenas sobre assinaturas pagas e confirmadas. Cancelamentos, estornos ou pagamentos recusados não geram comissão. O pagamento ocorre mensalmente via Pix.
            </div>
          </div>
        )}

        {/* Seus convidados — status de cada usuário que entrou pelo seu link */}
        <div className="glass rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Seus convidados
            </h2>
            <span className="text-xs text-muted-foreground">{referredUsers.length} no total</span>
          </div>

          {/* Resumo por status */}
          {referredUsers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {(['subscriber', 'trial', 'expired', 'deactivated', 'banned'] as const).map((s) => (
                referredCounts[s] ? (
                  <span key={s} className={`text-xs rounded-full px-2.5 py-1 border font-medium ${REFERRED_STATUS_META[s].color}`}>
                    {REFERRED_STATUS_META[s].label}: {referredCounts[s]}
                  </span>
                ) : null
              ))}
            </div>
          )}

          {referredUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Ninguém entrou pelo seu link ainda. Compartilhe seu convite para começar!
            </p>
          ) : (
            <>
              <div className="space-y-2">
                {visibleReferred.map((u) => {
                  const meta = REFERRED_STATUS_META[u.status] ?? REFERRED_STATUS_META.expired;
                  return (
                    <div key={u.id} className="flex items-center gap-3 rounded-xl bg-secondary/30 px-3 py-2">
                      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-secondary">
                        {u.avatar ? (
                          <img src={resolveServerUrl(u.avatar)} alt={u.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm font-bold text-muted-foreground">
                            {(u.name || '?')[0].toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{u.name || 'Usuário'}</p>
                        <p className="text-xs text-muted-foreground">Entrou em {formatDate(u.joinedAt)}</p>
                      </div>
                      <span className={`shrink-0 text-xs rounded-full px-2 py-0.5 border font-medium ${meta.color}`}>
                        {meta.label}
                      </span>
                    </div>
                  );
                })}
              </div>
              {referredUsers.length > 8 && (
                <button
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mx-auto"
                  onClick={() => setShowAllReferred((v) => !v)}
                >
                  {showAllReferred ? <><ChevronUp className="w-4 h-4" /> Ver menos</> : <><ChevronDown className="w-4 h-4" /> Ver todos ({referredUsers.length})</>}
                </button>
              )}
            </>
          )}
        </div>

        {/* Commission list */}
        {commissions.length > 0 && (
          <div className="glass rounded-2xl p-5 space-y-4">
            <h2 className="font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              Histórico de comissões
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left pb-2 pr-4">Data</th>
                    <th className="text-left pb-2 pr-4">Período</th>
                    <th className="text-right pb-2 pr-4">Assinatura</th>
                    <th className="text-right pb-2 pr-4">Comissão</th>
                    <th className="text-left pb-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visibleCommissions.map((c) => {
                    const statusMeta = STATUS_LABELS[c.status] ?? STATUS_LABELS.pending;
                    return (
                      <tr key={c.id} className="text-sm">
                        <td className="py-2.5 pr-4 text-muted-foreground whitespace-nowrap">{formatDate(c.createdAt)}</td>
                        <td className="py-2.5 pr-4 text-muted-foreground">{c.period ?? '-'}</td>
                        <td className="py-2.5 pr-4 text-right">{formatBRL(c.subscriptionAmount)}</td>
                        <td className="py-2.5 pr-4 text-right font-semibold text-emerald-600">{formatBRL(c.commissionAmount)}</td>
                        <td className="py-2.5">
                          <span className={`text-xs rounded-full px-2 py-0.5 border font-medium ${statusMeta.color}`}>
                            {statusMeta.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {commissions.length > 5 && (
              <button
                className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mx-auto"
                onClick={() => setShowAllCommissions((v) => !v)}
              >
                {showAllCommissions ? <><ChevronUp className="w-4 h-4" /> Ver menos</> : <><ChevronDown className="w-4 h-4" /> Ver todos ({commissions.length})</>}
              </button>
            )}
          </div>
        )}

        {commissions.length === 0 && (
          <div className="glass rounded-2xl p-8 text-center space-y-2">
            <ArrowRight className="w-8 h-8 text-muted-foreground/40 mx-auto" />
            <p className="font-medium text-muted-foreground">Nenhuma comissão ainda</p>
            <p className="text-sm text-muted-foreground">Compartilhe seu convite para começar a ganhar!</p>
            <Button className="mt-2 bg-emerald-500 hover:bg-emerald-600 text-white gap-2" onClick={handleCopyInvite}>
              <Share2 className="w-4 h-4" />
              Compartilhar meu convite
            </Button>
          </div>
        )}

        {/* ── Suporte ─────────────────────────────────────────────────────── */}
        <div className="glass rounded-2xl p-5 space-y-4">
          <h2 className="font-semibold flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-primary" />
            Suporte ao promotor
          </h2>

          {/* Mensagens */}
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {supportMessages.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma mensagem ainda. Envie uma mensagem para falar com o suporte.
              </p>
            )}
            {supportMessages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.senderType === 'promoter' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                    m.senderType === 'promoter'
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-secondary text-foreground rounded-bl-sm'
                  }`}
                >
                  {m.senderType === 'admin' && (
                    <p className="text-[10px] font-semibold mb-0.5 text-muted-foreground">Suporte</p>
                  )}
                  <p>{m.message}</p>
                  <p className={`text-[10px] mt-0.5 ${m.senderType === 'promoter' ? 'text-primary-foreground/70 text-right' : 'text-muted-foreground'}`}>
                    {formatDate(m.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="Digite sua mensagem..."
              value={supportInput}
              onChange={(e) => setSupportInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSendSupport(); } }}
            />
            <Button size="sm" onClick={handleSendSupport} disabled={!supportInput.trim() || isSendingSupport} className="gap-1.5 shrink-0">
              {isSendingSupport ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SendIcon className="w-3.5 h-3.5" />}
              Enviar
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

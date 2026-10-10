import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Ban, Bell, BellOff, ChevronRight, Copy, Crown, Eye, EyeOff, Image as ImageIcon, Loader2, LogOut, MoreVertical, Pin, PinOff,
  Reply, Send, Shield, ShieldOff, Trash2, UserMinus, Users, Volume2, VolumeX, X, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { useSocket } from '@/contexts/SocketContext';
import { hasPremiumAccess } from '@/utils/premium';
import {
  groupsService, profileService, type GroupDetail, type GroupMember, type GroupMessage, type GroupMessageRef,
} from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { getUserProfileHref } from '@/utils/userProfileNavigation';
import { UserAvatar } from '@/components/UserAvatar';
import ReferralPaywallModal from '@/components/ReferralPaywallModal';
import { cn } from '@/lib/utils';

// iPhone: tela cheia fixa presa à área visível. position:fixed no iOS é
// relativo ao layout viewport; quando o teclado abre o Safari rola a página e o
// grupo "subia" (cabeçalho sumia, campo ia parar no meio). Mesmo esquema da
// conversa em Chat.tsx: top/bottom 0 + paddingBottom = altura do teclado.
// zIndex 45: acima do cabeçalho do app (z-40) e ABAIXO dos modais/menus do
// Radix (z-50) — com 60, como no Chat, Participantes e o menu ⋮ abririam atrás.
function useTelaCheiaNoCelular(ativo: boolean): React.CSSProperties | undefined {
  const [estilo, setEstilo] = useState<React.CSSProperties>();
  useEffect(() => {
    if (!ativo) { setEstilo(undefined); return; }
    const atualizar = () => {
      const vv = window.visualViewport;
      const altura = vv ? vv.height : window.innerHeight;
      const teclado = Math.max(0, window.innerHeight - Math.round(altura));
      setEstilo({
        position: 'fixed',
        top: 0,
        bottom: 0,
        left: vv ? Math.round(vv.offsetLeft) : 0,
        width: vv ? Math.round(vv.width) : '100%',
        maxWidth: '100vw',
        height: 'auto',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
        paddingBottom: teclado > 0 ? teclado : 'max(0.5rem, env(safe-area-inset-bottom, 0px))',
        boxSizing: 'border-box',
        zIndex: 45,
        overflowX: 'hidden',
      });
    };
    const vv = window.visualViewport;
    vv?.addEventListener('resize', atualizar);
    vv?.addEventListener('scroll', atualizar);
    window.addEventListener('resize', atualizar);
    atualizar();
    // Trava a rolagem da página por baixo (senão o iOS a rola junto com o teclado).
    const html = document.documentElement;
    const body = document.body;
    const antes = [html.style.overflow, body.style.overflow];
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      vv?.removeEventListener('resize', atualizar);
      vv?.removeEventListener('scroll', atualizar);
      window.removeEventListener('resize', atualizar);
      html.style.overflow = antes[0];
      body.style.overflow = antes[1];
    };
  }, [ativo]);
  return estilo;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Links clicáveis no texto (como no Telegram). Abre em outra aba, sem passar
// a página do grupo como referência.
const URL_RE = /((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)\]'"])/gi;
function TextoComLinks({ texto, mine }: { texto: string; mine: boolean }) {
  const partes = texto.split(URL_RE);
  return (
    <p className="whitespace-pre-wrap break-words text-sm">
      {partes.map((parte, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={parte.toLowerCase().startsWith('www.') ? `https://${parte}` : parte}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={cn('break-all underline underline-offset-2', mine ? 'text-primary-foreground' : 'text-sky-500')}
          >
            {parte}
          </a>
        ) : (
          <Fragment key={i}>{parte}</Fragment>
        )
      )}
    </p>
  );
}

const resumo = (ref: GroupMessageRef) => ref.content?.trim() || (ref.hasMedia ? '📷 Mídia' : 'Mensagem');

function SeloPapel({ role }: { role?: string | null }) {
  if (role === 'organizer') {
    return <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 text-[10px] font-semibold text-gold-text"><Crown className="h-2.5 w-2.5" /> Dono</span>;
  }
  if (role === 'moderator') {
    return <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-500/15 px-1.5 text-[10px] font-semibold text-sky-600"><Shield className="h-2.5 w-2.5" /> Moderador</span>;
  }
  return null;
}

export default function GroupChat() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { emit, on, off } = useSocket();
  const premiumAccess = hasPremiumAccess(user);
  const isMobile = useIsMobile();
  const estiloCelular = useTelaCheiaNoCelular(isMobile);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [respondendo, setRespondendo] = useState<GroupMessage | null>(null);
  const [destaque, setDestaque] = useState<string | null>(null);
  // Mídia escolhida, esperando o "Enviar" (com a opção de visualização única).
  const [anexo, setAnexo] = useState<{ file: File; preview: string; imagem: boolean } | null>(null);
  const [visualizacaoUnica, setVisualizacaoUnica] = useState(false);
  // Foto única aberta em tela cheia (some ao fechar).
  const [fotoUnica, setFotoUnica] = useState<string | null>(null);
  const [abrindoFoto, setAbrindoFoto] = useState<string | null>(null);
  const [silenciandoNotif, setSilenciandoNotif] = useState(false);
  useEffect(() => () => { if (anexo) URL.revokeObjectURL(anexo.preview); }, [anexo]);

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    setIsLoading(true);
    Promise.all([groupsService.getGroup(groupId), groupsService.getMessages(groupId)])
      .then(([g, msgs]) => {
        if (cancelled) return;
        setGroup(g);
        setMessages(Array.isArray(msgs) ? msgs : []);
      })
      .catch(() => {
        if (cancelled) return;
        toast({ title: 'Não foi possível abrir o grupo', variant: 'destructive' });
        navigate('/chat/groups');
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [groupId, navigate, toast]);

  // Tempo real: mensagens novas/apagadas, fixada e mudanças de membros.
  useEffect(() => {
    if (!groupId) return;
    emit('join.group', groupId);
    const nova = (msg: GroupMessage & { groupId: string }) => {
      if (msg.groupId !== groupId) return;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    };
    const apagada = (d: { groupId: string; messageId: string }) => {
      if (d.groupId !== groupId) return;
      setMessages((prev) => prev
        .filter((m) => m.id !== d.messageId)
        .map((m) => (m.replyTo?.id === d.messageId ? { ...m, replyTo: null } : m)));
      setGroup((g) => (g && g.pinned?.id === d.messageId ? { ...g, pinned: null } : g));
    };
    const fixada = (d: { groupId: string; pinned: GroupMessageRef | null }) => {
      if (d.groupId !== groupId) return;
      setGroup((g) => (g ? { ...g, pinned: d.pinned } : g));
    };
    const membroMudou = (d: { groupId: string; userId: string; role?: string; muted?: boolean }) => {
      if (d.groupId !== groupId) return;
      setGroup((g) => {
        if (!g) return g;
        const members = g.members.map((m) => (m.id === d.userId
          ? {
            ...m,
            ...(d.role ? { role: d.role, isModerator: d.role === 'moderator' || d.role === 'organizer' } : {}),
            ...(typeof d.muted === 'boolean' ? { muted: d.muted } : {}),
          }
          : m));
        return { ...g, members, myRole: d.userId === user?.id && d.role ? d.role : g.myRole };
      });
    };
    const removido = (d: { groupId: string; userId: string }) => {
      if (d.groupId !== groupId) return;
      if (d.userId === user?.id) {
        toast({ title: 'Você foi removido deste grupo' });
        navigate('/chat/groups');
        return;
      }
      setGroup((g) => (g ? { ...g, members: g.members.filter((m) => m.id !== d.userId) } : g));
    };
    const vista = (d: { groupId: string; messageId: string; viewsCount: number }) => {
      if (d.groupId !== groupId) return;
      setMessages((prev) => prev.map((m) => (m.id === d.messageId && m.senderId === user?.id ? { ...m, viewsCount: d.viewsCount } : m)));
    };
    on('group.message.new', nova);
    on('group.message.viewed', vista);
    on('group.message.deleted', apagada);
    on('group.pinned', fixada);
    on('group.member.updated', membroMudou);
    on('group.member.removed', removido);
    return () => {
      off('group.message.new', nova);
      off('group.message.viewed', vista);
      off('group.message.deleted', apagada);
      off('group.pinned', fixada);
      off('group.member.updated', membroMudou);
      off('group.member.removed', removido);
    };
  }, [groupId, emit, on, off, user?.id, navigate, toast]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const eu = group?.members.find((m) => m.id === user?.id);
  const meuPapel = group?.myRole ?? (eu?.isOrganizer ? 'organizer' : 'member');
  const souDono = meuPapel === 'organizer';
  const souModerador = souDono || meuPapel === 'moderator';
  const estouSilenciado = !!eu?.muted;
  const dono = group?.members.find((m) => m.isOrganizer || m.role === 'organizer');
  const moderadores = group?.members.filter((m) => m.role === 'moderator') ?? [];
  const papelDe = (id: string) => group?.members.find((m) => m.id === id)?.role ?? null;
  // Moderador age sobre membro comum; só o dono age sobre moderador; ninguém sobre o dono.
  const podeModerar = (alvoRole?: string | null) => alvoRole !== 'organizer' && (souDono || (souModerador && alvoRole !== 'moderator'));

  const handleSend = useCallback(async () => {
    if (!groupId) return;
    if (!premiumAccess) { setPaywallOpen(true); return; }
    const content = message.trim();
    if (!content || sending) return;
    setSending(true);
    setMessage('');
    const resposta = respondendo;
    setRespondendo(null);
    try {
      await groupsService.sendMessage(groupId, content, undefined, resposta?.id);
    } catch (e: any) {
      toast({ title: 'Erro ao enviar', description: e?.response?.data?.message || 'Tente novamente.', variant: 'destructive' });
      setMessage(content);
      setRespondendo(resposta);
    } finally {
      setSending(false);
    }
  }, [groupId, message, sending, premiumAccess, toast, respondendo]);

  const escolherAnexo = (file: File) => {
    if (!premiumAccess) { setPaywallOpen(true); return; }
    setAnexo({ file, preview: URL.createObjectURL(file), imagem: file.type.startsWith('image/') });
    setVisualizacaoUnica(false);
  };

  const enviarAnexo = useCallback(async () => {
    if (!groupId || !anexo) return;
    setUploading(true);
    try {
      const { id } = await profileService.uploadMedia(anexo.file, { source: 'chat' });
      const legenda = message.trim();
      await groupsService.sendMessage(groupId, legenda || undefined, id, respondendo?.id, anexo.imagem && visualizacaoUnica);
      setRespondendo(null);
      setMessage('');
      setAnexo(null);
      setVisualizacaoUnica(false);
    } catch (e: any) {
      toast({ title: 'Erro ao enviar mídia', description: e?.response?.data?.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }, [groupId, anexo, message, respondendo, visualizacaoUnica, toast]);

  const abrirFotoUnica = async (m: GroupMessage) => {
    if (!groupId) return;
    if (!premiumAccess) { setPaywallOpen(true); return; }
    setAbrindoFoto(m.id);
    try {
      const { mediaUrl } = await groupsService.verFotoUnica(groupId, m.id);
      setFotoUnica(resolveServerUrl(mediaUrl));
    } catch (e: any) {
      toast({ title: 'Não foi possível abrir', description: e?.response?.data?.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      // Aberta (ou já vista antes): não abre de novo.
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, viewedByMe: true } : x)));
      setAbrindoFoto(null);
    }
  };

  const alternarNotificacoes = async () => {
    if (!groupId || !group) return;
    const silenciar = !group.notificacoesSilenciadas;
    setSilenciandoNotif(true);
    try {
      await groupsService.silenciarNotificacoes(groupId, silenciar);
      setGroup((g) => (g ? { ...g, notificacoesSilenciadas: silenciar } : g));
      toast({ title: silenciar ? 'Grupo silenciado 🔕' : 'Notificações do grupo ligadas 🔔', description: silenciar ? 'Você não recebe mais avisos das mensagens deste grupo.' : undefined });
    } catch {
      toast({ title: 'Não foi possível mudar agora', variant: 'destructive' });
    } finally {
      setSilenciandoNotif(false);
    }
  };

  const handleLeave = useCallback(async () => {
    if (!groupId) return;
    try {
      await groupsService.leave(groupId);
      toast({ title: 'Você saiu do grupo' });
      navigate('/chat/groups');
    } catch {
      toast({ title: 'Não foi possível sair do grupo', variant: 'destructive' });
    }
  }, [groupId, navigate, toast]);

  const acao = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast({ title: ok });
    } catch (e: any) {
      toast({ title: 'Não foi possível', description: e?.response?.data?.message || 'Tente novamente.', variant: 'destructive' });
    }
  };

  const removerMembro = (m: GroupMember, banir: boolean) => {
    if (!groupId) return;
    const texto = banir
      ? `Banir ${m.name}? Sai do grupo e não volta nem confirmando presença de novo.`
      : `Remover ${m.name} do grupo?`;
    if (!window.confirm(texto)) return;
    void acao(async () => {
      await groupsService.removeMember(groupId, m.id, banir);
      setGroup((g) => (g ? { ...g, members: g.members.filter((x) => x.id !== m.id) } : g));
    }, banir ? `${m.name} foi banido do grupo` : `${m.name} foi removido do grupo`);
  };

  const irParaMensagem = (id: string) => {
    const el = document.getElementById(`gm-${id}`);
    if (!el) { toast({ title: 'Essa mensagem é antiga e não está carregada' }); return; }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setDestaque(id);
    window.setTimeout(() => setDestaque(null), 1600);
  };

  const responder = (m: GroupMessage) => {
    setRespondendo(m);
    inputRef.current?.focus();
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }
  if (!group || !groupId) return null;

  return (
    <div
      style={estiloCelular}
      className="mx-auto flex h-[calc(100dvh-var(--app-header-h,3.5rem))] max-w-2xl min-w-0 flex-col bg-background px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3 [touch-action:manipulation] md:h-[calc(100dvh-6rem)] md:bg-transparent md:px-0 md:pb-0 md:pt-0"
    >
      <ReferralPaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />

      {/* Header */}
      <div className="flex items-center gap-2 border-b pb-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/chat/groups')} aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setMembersOpen(true)}>
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-secondary">
            {group.image ? <img src={resolveServerUrl(group.image)} alt="" className="h-full w-full object-cover" /> : null}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold leading-tight">{group.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {group.members.length} participante{group.members.length === 1 ? '' : 's'}
              {dono && <> · <Crown className="mb-0.5 inline h-3 w-3 text-gold-text" /> Moderador: <span className="font-medium text-foreground">{dono.name}</span></>}
              {moderadores.length > 0 && ` +${moderadores.length}`}
            </p>
          </div>
        </button>
        <Button
          variant="ghost"
          size="icon"
          disabled={silenciandoNotif}
          onClick={() => void alternarNotificacoes()}
          aria-label={group.notificacoesSilenciadas ? 'Ligar notificações do grupo' : 'Silenciar notificações do grupo'}
          title={group.notificacoesSilenciadas ? 'Grupo silenciado — toque para ligar' : 'Silenciar notificações do grupo'}
        >
          {group.notificacoesSilenciadas ? <BellOff className="h-5 w-5 text-muted-foreground" /> : <Bell className="h-5 w-5" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setMembersOpen(true)} aria-label="Ver membros">
          <Users className="h-5 w-5" />
        </Button>
      </div>

      {/* Mensagem fixada */}
      {group.pinned && (
        <div className="flex items-center gap-2 border-b bg-secondary/40 px-2 py-1.5">
          <Pin className="h-4 w-4 shrink-0 text-primary" />
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => irParaMensagem(group.pinned!.id)}>
            <p className="text-[11px] font-semibold text-primary">Mensagem fixada · {group.pinned.senderName}</p>
            <p className="truncate text-xs text-muted-foreground">{resumo(group.pinned)}</p>
          </button>
          {souModerador && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label="Desafixar"
              onClick={() => void acao(() => groupsService.pin(groupId, null), 'Mensagem desafixada')}
            >
              <PinOff className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain py-3">
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma mensagem ainda. Diga oi para o grupo! 👋
          </p>
        )}
        {messages.map((m) => {
          const isMine = m.senderId === user?.id;
          const papel = m.senderRole ?? papelDe(m.senderId);
          const podeApagar = isMine || (souModerador && podeModerar(papelDe(m.senderId)));
          return (
            <div key={m.id} id={`gm-${m.id}`} className={cn('group/msg flex items-end gap-2', isMine && 'flex-row-reverse')}>
              {!isMine && (
                <button type="button" onClick={() => navigate(getUserProfileHref(m.senderId, user?.id, `/chat/group/${groupId}`))} aria-label={`Ver perfil de ${m.senderName}`}>
                  <UserAvatar user={{ name: m.senderName, avatar: m.senderAvatar }} className="h-7 w-7 shrink-0" />
                </button>
              )}
              <div
                className={cn(
                  'max-w-[75%] rounded-2xl px-3 py-2 transition-shadow',
                  isMine ? 'bg-primary text-primary-foreground' : 'bg-secondary',
                  destaque === m.id && 'ring-2 ring-amber-400'
                )}
                onDoubleClick={() => responder(m)}
              >
                {!isMine && (
                  <p className="mb-0.5 flex flex-wrap items-center gap-1 text-[11px] font-semibold text-brand-pink">
                    <button
                      type="button"
                      className="font-semibold hover:underline"
                      onClick={() => navigate(getUserProfileHref(m.senderId, user?.id, `/chat/group/${groupId}`))}
                    >
                      {m.senderName}
                    </button>
                    <SeloPapel role={papel} />
                  </p>
                )}
                {m.replyTo && (
                  <button
                    type="button"
                    onClick={() => irParaMensagem(m.replyTo!.id)}
                    className={cn(
                      'mb-1 block w-full rounded-md border-l-2 px-2 py-1 text-left text-xs',
                      isMine ? 'border-primary-foreground/60 bg-primary-foreground/10' : 'border-primary bg-background/60'
                    )}
                  >
                    <span className="block font-semibold">{m.replyTo.senderName}</span>
                    <span className="line-clamp-2 opacity-80">{resumo(m.replyTo)}</span>
                  </button>
                )}
                {m.isViewOnce ? (
                  isMine ? (
                    <div className="mb-1 flex items-center gap-2 rounded-lg border border-white/20 bg-black/10 px-3 py-2.5 text-xs">
                      <Zap className="h-4 w-4 shrink-0 text-yellow-400" />
                      <span>Foto de visualização única · {m.viewsCount ? `aberta por ${m.viewsCount}` : 'ninguém abriu ainda'}</span>
                    </div>
                  ) : m.viewedByMe ? (
                    <div className="mb-1 flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs italic text-muted-foreground opacity-70">
                      <EyeOff className="h-4 w-4 shrink-0" /> Foto aberta
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={abrindoFoto === m.id}
                      onClick={() => void abrirFotoUnica(m)}
                      className="mb-1 flex w-full flex-col items-center gap-1.5 rounded-lg border border-white/20 bg-black/20 px-6 py-5 text-xs font-medium"
                    >
                      {abrindoFoto === m.id ? <Loader2 className="h-6 w-6 animate-spin" /> : <Zap className="h-6 w-6 text-yellow-400" />}
                      Foto de visualização única
                      <span className="flex items-center gap-1 rounded-md bg-secondary px-2.5 py-1 text-foreground"><Eye className="h-3.5 w-3.5" /> Ver uma vez</span>
                    </button>
                  )
                ) : m.mediaUrl && (
                  m.mediaMimeType?.startsWith('video/') ? (
                    <video src={resolveServerUrl(m.mediaUrl)} controls className="mb-1 max-h-64 w-full rounded-lg" />
                  ) : (
                    <img src={resolveServerUrl(m.mediaUrl)} alt="" className="mb-1 max-h-64 w-full rounded-lg object-cover" />
                  )
                )}
                {m.content && <TextoComLinks texto={m.content} mine={isMine} />}
                <p className={cn('mt-0.5 text-[10px]', isMine ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                  {formatTime(m.createdAt)}
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Opções da mensagem"
                    className="mb-1 flex h-10 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-60 hover:bg-secondary hover:opacity-100 sm:h-8 sm:opacity-0 sm:group-hover/msg:opacity-100"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={isMine ? 'end' : 'start'}>
                  {premiumAccess && !estouSilenciado && (
                    <DropdownMenuItem onClick={() => responder(m)}><Reply className="mr-2 h-4 w-4" /> Responder</DropdownMenuItem>
                  )}
                  {m.content && (
                    <DropdownMenuItem onClick={() => { void navigator.clipboard?.writeText(m.content || '').then(() => toast({ title: 'Texto copiado' })).catch(() => {}); }}>
                      <Copy className="mr-2 h-4 w-4" /> Copiar texto
                    </DropdownMenuItem>
                  )}
                  {souModerador && (
                    group.pinned?.id === m.id ? (
                      <DropdownMenuItem onClick={() => void acao(() => groupsService.pin(groupId, null), 'Mensagem desafixada')}>
                        <PinOff className="mr-2 h-4 w-4" /> Desafixar
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => void acao(() => groupsService.pin(groupId, m.id), 'Mensagem fixada no topo')}>
                        <Pin className="mr-2 h-4 w-4" /> Fixar no topo
                      </DropdownMenuItem>
                    )
                  )}
                  {podeApagar && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => {
                          if (!window.confirm(isMine ? 'Apagar sua mensagem para todos?' : `Apagar a mensagem de ${m.senderName} para todos?`)) return;
                          void acao(() => groupsService.deleteMessage(groupId, m.id), 'Mensagem apagada');
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Apagar
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="border-t pt-2">
        {!premiumAccess && (
          <button
            type="button"
            onClick={() => navigate('/subscriptions')}
            aria-label="Acesso bloqueado. Toque para assinar."
            className="mb-2 flex w-full items-center justify-between rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-left transition-colors hover:bg-destructive/10 active:scale-[0.99]"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="font-medium text-destructive">Acesso bloqueado</p>
              <p className="text-sm text-muted-foreground">Assine para participar da conversa do grupo.</p>
            </div>
            <span className="ml-3 flex shrink-0 items-center gap-1 rounded-full bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground">
              Assinar
              <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </button>
        )}
        {group.encerrado ? (
          <p className="mb-1 rounded-xl border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            🏁 O evento já aconteceu: o grupo agora é só para leitura
            {group.apagaEm ? ` e será apagado em ${new Date(group.apagaEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}.
          </p>
        ) : premiumAccess && estouSilenciado ? (
          <p className="mb-1 flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-muted-foreground">
            <VolumeX className="h-4 w-4 shrink-0 text-amber-600" /> Um moderador silenciou você neste grupo. Você continua lendo as mensagens.
          </p>
        ) : (
          <>
            {anexo && (
              <div className="mb-2 flex items-center gap-3 rounded-xl border bg-secondary/40 p-2">
                {anexo.imagem ? (
                  <img src={anexo.preview} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                ) : (
                  <video src={anexo.preview} className="h-16 w-16 shrink-0 rounded-lg object-cover" muted />
                )}
                <div className="min-w-0 flex-1 space-y-1.5">
                  {anexo.imagem ? (
                    <button
                      type="button"
                      onClick={() => setVisualizacaoUnica((v) => !v)}
                      className={cn(
                        'flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-xs font-semibold',
                        visualizacaoUnica ? 'border-yellow-400 bg-yellow-400/15 text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      <Zap className={cn('h-4 w-4', visualizacaoUnica && 'fill-yellow-400 text-yellow-400')} />
                      {visualizacaoUnica ? 'Visualização única ligada' : 'Visualização única'}
                    </button>
                  ) : (
                    <p className="text-xs text-muted-foreground">Vídeo pronto para enviar</p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    {visualizacaoUnica ? 'Cada pessoa do grupo abre uma vez só.' : 'Escreva uma legenda no campo, se quiser.'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <Button size="sm" className="h-9" disabled={uploading} onClick={() => void enviarAnexo()}>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar'}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8" disabled={uploading} onClick={() => setAnexo(null)}>Cancelar</Button>
                </div>
              </div>
            )}
            {respondendo && (
              <div className="mb-2 flex items-center gap-2 rounded-lg border-l-2 border-primary bg-secondary/50 px-2 py-1.5">
                <Reply className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-primary">Respondendo {respondendo.senderName}</p>
                  <p className="truncate text-xs text-muted-foreground">{respondendo.content || (respondendo.mediaUrl ? '📷 Mídia' : '')}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Cancelar resposta" onClick={() => setRespondendo(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) escolherAnexo(f); e.target.value = ''; }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 shrink-0 md:h-10 md:w-10"
                aria-label="Enviar foto ou vídeo"
                disabled={uploading}
                onClick={() => (premiumAccess ? fileInputRef.current?.click() : setPaywallOpen(true))}
              >
                <ImageIcon className="h-5 w-5" />
              </Button>
              <textarea
                ref={inputRef}
                placeholder="Mensagem para o grupo (links são permitidos)..."
                value={message}
                readOnly={!premiumAccess}
                onMouseDown={!premiumAccess ? (e) => { e.preventDefault(); setPaywallOpen(true); } : undefined}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void (anexo ? enviarAnexo() : handleSend()); }
                  if (e.key === 'Escape') setRespondendo(null);
                }}
                rows={1}
                enterKeyHint="send"
                className="max-h-28 min-h-[44px] flex-1 resize-none rounded-xl border bg-background px-3 py-2.5 text-[16px] leading-5 outline-none focus:ring-1 focus:ring-primary md:min-h-0 md:py-2 md:text-sm"
              />
              <Button type="button" size="icon" className="h-11 w-11 shrink-0 md:h-10 md:w-10" disabled={anexo ? uploading : !message.trim() || sending} onClick={() => void (anexo ? enviarAnexo() : handleSend())}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>

      {fotoUnica && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-black" onContextMenu={(e) => e.preventDefault()}>
          <div className="flex items-center justify-between p-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] text-white">
            <span className="flex items-center gap-1.5 text-sm"><Zap className="h-4 w-4 text-yellow-400" /> Visualização única — ao fechar, some</span>
            <Button variant="ghost" size="icon" className="text-white" aria-label="Fechar" onClick={() => setFotoUnica(null)}>
              <X className="h-6 w-6" />
            </Button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-2">
            <img
              src={fotoUnica}
              alt="Foto de visualização única"
              className="max-h-full max-w-full select-none object-contain"
              draggable={false}
              style={{ WebkitTouchCallout: 'none' } as React.CSSProperties}
            />
          </div>
        </div>
      )}

      {/* Members modal */}
      <Dialog open={membersOpen} onOpenChange={setMembersOpen}>
        <DialogContent className="max-h-[85dvh] max-w-sm overflow-hidden">
          <DialogHeader>
            <DialogTitle>Participantes ({group.members.length})</DialogTitle>
          </DialogHeader>
          {souModerador && (
            <p className="-mt-2 text-xs text-muted-foreground">
              {souDono
                ? 'Você é o dono do grupo: pode escolher moderadores, silenciar, remover e banir.'
                : 'Você é moderador: pode silenciar, remover e banir membros e apagar ou fixar mensagens.'}
            </p>
          )}
          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {group.members.map((m) => {
              const role = m.role ?? (m.isOrganizer ? 'organizer' : 'member');
              const gerenciavel = m.id !== user?.id && podeModerar(role);
              return (
                <div key={m.id} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
                  <button type="button" onClick={() => navigate(getUserProfileHref(m.id, user?.id, `/chat/group/${groupId}`))}>
                    <UserAvatar user={{ name: m.name, avatar: m.avatar }} className="h-9 w-9" />
                  </button>
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => navigate(getUserProfileHref(m.id, user?.id, `/chat/group/${groupId}`))}
                  >
                    <p className="truncate text-sm font-medium hover:underline">{m.name}{m.id === user?.id ? ' (você)' : ''}</p>
                    <div className="flex flex-wrap items-center gap-1">
                      <SeloPapel role={role} />
                      {m.muted && <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600"><VolumeX className="h-2.5 w-2.5" /> Silenciado</span>}
                    </div>
                  </button>
                  {gerenciavel && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Moderar ${m.name}`}>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {souDono && (
                          role === 'moderator' ? (
                            <DropdownMenuItem onClick={() => void acao(() => groupsService.setRole(groupId, m.id, 'member'), `${m.name} não é mais moderador`)}>
                              <ShieldOff className="mr-2 h-4 w-4" /> Tirar de moderador
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => void acao(() => groupsService.setRole(groupId, m.id, 'moderator'), `${m.name} agora é moderador`)}>
                              <Shield className="mr-2 h-4 w-4" /> Tornar moderador
                            </DropdownMenuItem>
                          )
                        )}
                        {m.muted ? (
                          <DropdownMenuItem onClick={() => void acao(() => groupsService.mute(groupId, m.id, false), `${m.name} pode falar de novo`)}>
                            <Volume2 className="mr-2 h-4 w-4" /> Devolver a voz
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => void acao(() => groupsService.mute(groupId, m.id, true), `${m.name} foi silenciado`)}>
                            <VolumeX className="mr-2 h-4 w-4" /> Silenciar
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => removerMembro(m, false)}>
                          <UserMinus className="mr-2 h-4 w-4" /> Remover do grupo
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => removerMembro(m, true)}>
                          <Ban className="mr-2 h-4 w-4" /> Banir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              );
            })}
          </div>
          {!souDono && (
            <Button variant="outline" className="mt-2 gap-2 text-destructive" onClick={() => void handleLeave()}>
              <LogOut className="h-4 w-4" /> Sair do grupo
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

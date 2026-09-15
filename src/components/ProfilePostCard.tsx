import { useEffect, useRef, useState } from 'react';
import { Heart, MessageCircle, Eye, Loader2, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { feedService, interactionsService } from '@/services/api';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { resolveServerUrl } from '@/utils/serverUrl';
import { getUserProfileHref } from '@/utils/userProfileNavigation';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import PostContent from '@/components/PostContent';

/**
 * Postagem na aba "Postagens" do perfil, com as mesmas ações do feed:
 * curtir, comentar e contagem de visualizações.
 *
 * Vive separado do card do feed (que tem ~430 linhas inline em Feed.tsx e
 * carrega recursos que não fazem sentido aqui, como carrossel de mídia com
 * paywall de vídeo e reações por foto). O que importa é que a AÇÃO é a mesma:
 * os dois chamam interactionsService sobre target_type='post', então uma
 * curtida feita aqui aparece no feed e vice-versa.
 */
export type PostDoPerfil = {
  id: string;
  content: string;
  createdAt: string;
  media: Array<{ id: string; url: string | null; mimeType: string | null }>;
  likesCount?: number;
  commentsCount?: number;
  viewsCount?: number;
  likedByMe?: boolean;
};

type Comentario = {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string; avatar?: string | null };
};

type ProfilePostCardProps = {
  post: PostDoPerfil;
  /** id de quem está olhando, para o link do próprio perfil ir para /profile */
  viewerId?: string;
  /** Data já formatada por quem usa (cada tela tem seu formato). */
  dataLabel: string;
  /** Sem premium, curtir/comentar leva para a tela de planos. */
  podeInteragir?: boolean;
  onPrecisaAssinar?: () => void;
  /** Abre os comentários ao montar (notificação de comentário/resposta). */
  abrirComentarios?: boolean;
  /** Mostra "Editar" e "Excluir". Só para o dono — o backend confere de novo. */
  podeGerenciar?: boolean;
  /** Chamado depois de excluir, para quem usa o cartão tirar ele da lista. */
  onRemovido?: (postId: string) => void;
};

export default function ProfilePostCard({
  post,
  viewerId,
  dataLabel,
  podeInteragir = true,
  onPrecisaAssinar,
  abrirComentarios = false,
  podeGerenciar = false,
  onRemovido,
}: ProfilePostCardProps) {
  const { toast } = useToast();
  const [curtido, setCurtido] = useState(!!post.likedByMe);
  const [curtidas, setCurtidas] = useState(Number(post.likesCount ?? 0));
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [totalComentarios, setTotalComentarios] = useState(Number(post.commentsCount ?? 0));
  const [abertos, setAbertos] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [rascunho, setRascunho] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Texto local: depois de editar, o cartão mostra o novo sem recarregar a lista.
  const [texto, setTexto] = useState(post.content || '');
  const [editando, setEditando] = useState(false);
  const [rascunhoTexto, setRascunhoTexto] = useState('');
  const [salvandoTexto, setSalvandoTexto] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const temMidia = (post.media || []).length > 0;

  const salvarTexto = async () => {
    const novo = rascunhoTexto.trim();
    if (!novo && !temMidia) {
      toast({ title: 'A publicação não pode ficar vazia', variant: 'destructive' });
      return;
    }
    setSalvandoTexto(true);
    try {
      const r = await feedService.updatePost(post.id, novo);
      setTexto(r.content);
      setEditando(false);
      toast({ title: 'Publicação atualizada' });
    } catch {
      toast({ title: 'Não foi possível salvar', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setSalvandoTexto(false);
    }
  };

  const excluir = async () => {
    setExcluindo(true);
    try {
      await feedService.deletePost(post.id);
      toast({ title: 'Publicação removida' });
      setConfirmarExclusao(false);
      onRemovido?.(post.id);
    } catch {
      toast({ title: 'Falha ao remover', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setExcluindo(false);
    }
  };

  const fotos = (post.media || []).filter((m) => m.url && !String(m.mimeType || '').startsWith('video/'));
  const videos = (post.media || []).filter((m) => m.url && String(m.mimeType || '').startsWith('video/'));

  const alternarCurtida = async () => {
    if (!podeInteragir) { onPrecisaAssinar?.(); return; }
    const proximo = !curtido;
    // Otimista: a UI responde na hora e volta atrás se o servidor recusar.
    setCurtido(proximo);
    setCurtidas((n) => Math.max(0, n + (proximo ? 1 : -1)));
    try {
      if (proximo) await interactionsService.like('post', post.id);
      else await interactionsService.unlike('post', post.id);
    } catch {
      setCurtido(!proximo);
      setCurtidas((n) => Math.max(0, n + (proximo ? -1 : 1)));
      toast({ title: 'Não foi possível curtir', description: 'Tente novamente.', variant: 'destructive' });
    }
  };

  const alternarComentarios = async () => {
    if (abertos) { setAbertos(false); return; }
    setAbertos(true);
    if (comentarios.length > 0) return;
    setCarregando(true);
    try {
      const r = await interactionsService.getComments('post', post.id);
      const lista = Array.isArray(r) ? r : (r?.comments ?? []);
      setComentarios(lista);
      setTotalComentarios(lista.length);
    } catch {
      setComentarios([]);
    } finally {
      setCarregando(false);
    }
  };

  // Uma vez só, na montagem: se a pessoa fechar os comentários, não reabre.
  const jaAbriuSozinho = useRef(false);
  useEffect(() => {
    if (!abrirComentarios || jaAbriuSozinho.current) return;
    jaAbriuSozinho.current = true;
    void alternarComentarios();
  }, [abrirComentarios]); // eslint-disable-line react-hooks/exhaustive-deps

  const enviarComentario = async () => {
    const texto = rascunho.trim();
    if (!texto) return;
    if (!podeInteragir) { onPrecisaAssinar?.(); return; }
    setEnviando(true);
    try {
      await interactionsService.comment('post', post.id, texto);
      setRascunho('');
      const r = await interactionsService.getComments('post', post.id);
      const lista = Array.isArray(r) ? r : (r?.comments ?? []);
      setComentarios(lista);
      setTotalComentarios(lista.length);
    } catch {
      toast({ title: 'Não foi possível comentar', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <article className="glass rounded-2xl p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{dataLabel}</p>
        {podeGerenciar && !editando && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="-my-2 -mr-2 h-9 w-9 rounded-full" aria-label="Opções da publicação">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setRascunhoTexto(texto); setEditando(true); }}>
                <Pencil className="h-4 w-4" />
                Editar texto
              </DropdownMenuItem>
              {/* Confirmação desenhada na página, não window.confirm: navegador
                  de app (Instagram etc.) bloqueia a janela nativa em silêncio. */}
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setConfirmarExclusao(true)}
              >
                <Trash2 className="h-4 w-4" />
                Remover publicação
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {editando ? (
        <div className="mb-3 space-y-2">
          <textarea
            value={rascunhoTexto}
            onChange={(e) => setRascunhoTexto(e.target.value.slice(0, 5000))}
            rows={4}
            autoFocus
            placeholder={temMidia ? 'Escreva uma legenda (opcional)' : 'Escreva sua publicação'}
            className="w-full resize-y rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditando(false)} disabled={salvandoTexto}>Cancelar</Button>
            <Button size="sm" onClick={() => void salvarTexto()} disabled={salvandoTexto}>
              {salvandoTexto ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
            </Button>
          </div>
        </div>
      ) : texto.trim() ? (
        <p className="mb-3 whitespace-pre-wrap break-words text-sm leading-6">
          <PostContent content={texto} />
        </p>
      ) : null}

      <AlertDialog open={confirmarExclusao} onOpenChange={(aberto) => { if (!excluindo) setConfirmarExclusao(aberto); }}>
        <AlertDialogContent className="max-w-[92vw] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Remover esta publicação?</AlertDialogTitle>
            <AlertDialogDescription>
              Ela sai do seu perfil e do feed, junto com curtidas e comentários. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); void excluir(); }}
              disabled={excluindo}
            >
              {excluindo ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Remover'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {fotos.length > 0 ? (
        <div className={cn('grid gap-2', fotos.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
          {fotos.map((m) => (
            <img key={m.id} src={resolveServerUrl(m.url || '')} alt="" loading="lazy" className="w-full rounded-xl object-cover" />
          ))}
        </div>
      ) : null}

      {videos.map((m) => (
        <video key={m.id} src={resolveServerUrl(m.url || '')} controls playsInline className="mt-2 w-full rounded-xl" />
      ))}

      {/* Ações — as mesmas do feed */}
      <div className="mt-3 flex items-center gap-4 border-t pt-3">
        <button
          type="button"
          onClick={() => void alternarCurtida()}
          aria-label={curtido ? 'Remover curtida' : 'Curtir publicação'}
          className="flex items-center gap-1.5 text-sm transition-colors"
        >
          <Heart className={cn('h-5 w-5', curtido ? 'fill-current text-primary' : 'text-muted-foreground')} />
          <span className={cn('font-medium', curtido ? 'text-brand-pink' : 'text-muted-foreground')}>{curtidas}</span>
        </button>

        <button
          type="button"
          onClick={() => void alternarComentarios()}
          aria-label={abertos ? 'Fechar comentários' : 'Ver comentários'}
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <MessageCircle className="h-5 w-5" />
          <span className="font-medium">{totalComentarios}</span>
        </button>

        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Eye className="h-5 w-5" />
          <span className="font-medium">{Number(post.viewsCount ?? 0)}</span>
        </span>
      </div>

      {abertos ? (
        <div className="mt-3 space-y-3 border-t pt-3">
          {carregando ? (
            <div className="flex justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : comentarios.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum comentário ainda. Seja o primeiro.</p>
          ) : (
            comentarios.map((c) => (
              <div key={c.id} className="flex gap-2.5">
                {c.user?.avatar ? (
                  <img src={resolveServerUrl(c.user.avatar)} alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold">
                    {c.user?.name?.[0]?.toUpperCase() || 'U'}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <Link to={getUserProfileHref(c.user?.id, viewerId)} className="text-sm font-medium hover:underline">
                    {c.user?.name || 'Alguém'}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    <PostContent content={c.content} />
                  </p>
                </div>
              </div>
            ))
          )}

          <div className="flex gap-2">
            <input
              value={rascunho}
              onChange={(e) => setRascunho(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void enviarComentario(); }}
              placeholder={podeInteragir ? 'Escreva um comentário...' : 'Assine para comentar'}
              readOnly={!podeInteragir}
              onFocus={!podeInteragir ? () => onPrecisaAssinar?.() : undefined}
              className="h-12 flex-1 rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-10 md:text-sm"
            />
            <button
              type="button"
              onClick={() => void enviarComentario()}
              disabled={enviando || !rascunho.trim()}
              className="h-12 shrink-0 rounded-xl bg-gradient-primary px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 md:h-10"
            >
              {enviando ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

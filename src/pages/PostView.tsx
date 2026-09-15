import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ProfilePostCard, { type PostDoPerfil } from '@/components/ProfilePostCard';
import { feedService } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { resolveServerUrl } from '@/utils/serverUrl';
import { getUserProfileHref } from '@/utils/userProfileNavigation';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

type PostComAutor = PostDoPerfil & {
  author: { id: string; name: string; avatar: string | null };
};

function dataLonga(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Uma publicação sozinha, em /post/:postId.
 *
 * É o destino das notificações de post (curtida, comentário, menção, resposta,
 * Top do Dia). Antes elas levavam a /feed?postId= e o app tentava achar o post
 * rolando o feed — o que falhava justamente para os posts da própria pessoa,
 * que muitas vezes não entram no feed dela. Abrir direto não depende de nada
 * disso.
 *
 * ?comments=1 já abre os comentários (notificação de comentário/resposta).
 */
export default function PostView() {
  useDocumentTitle('Publicação');
  const { postId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [post, setPost] = useState<PostComAutor | null>(null);
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'nao_encontrado' | 'erro'>('carregando');

  useEffect(() => {
    let vivo = true;
    setEstado('carregando');
    feedService.getPost(postId)
      .then((res) => {
        if (!vivo) return;
        setPost(res.post);
        setEstado('ok');
      })
      .catch((err) => {
        if (!vivo) return;
        setEstado(err?.response?.status === 404 ? 'nao_encontrado' : 'erro');
      });
    return () => { vivo = false; };
  }, [postId]);

  const voltar = () => {
    // Quem chegou por link direto não tem para onde voltar dentro do app.
    if (window.history.length > 1) navigate(-1);
    else navigate('/notifications');
  };

  return (
    <div className="mx-auto w-full max-w-2xl min-w-0 space-y-4">
      <Button variant="ghost" size="sm" className="gap-2" onClick={voltar}>
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Button>

      {estado === 'carregando' && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {(estado === 'nao_encontrado' || estado === 'erro') && (
        <div className="glass rounded-2xl p-8 text-center">
          <p className="font-medium">
            {estado === 'nao_encontrado' ? 'Esta publicação não está mais disponível' : 'Não foi possível abrir a publicação'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {estado === 'nao_encontrado'
              ? 'Ela pode ter sido apagada pelo autor.'
              : 'Verifique sua conexão e tente de novo.'}
          </p>
        </div>
      )}

      {estado === 'ok' && post && (
        <>
          <Link
            to={getUserProfileHref(post.author.id, user?.id, `/post/${post.id}`)}
            className="flex items-center gap-3"
          >
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-secondary">
              {post.author.avatar ? (
                <img src={resolveServerUrl(post.author.avatar)} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm font-bold">
                  {post.author.name.charAt(0)}
                </div>
              )}
            </div>
            <span className="font-semibold hover:underline">
              {post.author.id === user?.id ? 'Sua publicação' : post.author.name}
            </span>
          </Link>

          <ProfilePostCard
            post={post}
            viewerId={user?.id}
            dataLabel={dataLonga(post.createdAt)}
            abrirComentarios={searchParams.get('comments') === '1'}
            podeGerenciar={post.author.id === user?.id}
            onRemovido={() => navigate('/profile', { replace: true })}
          />
        </>
      )}
    </div>
  );
}

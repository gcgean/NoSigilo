import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getUserProfileHref } from '@/utils/userProfileNavigation';
import { cn } from '@/lib/utils';

/**
 * Nome de uma pessoa que leva ao perfil dela. Use em qualquer lugar que mostre
 * o nome de alguém: lista, comentário, convite, ranking...
 *
 * - O próprio usuário vai para /profile; os outros, para /users/:id.
 * - O clique não "vaza" para o card em volta (um card que abre o vídeo, uma
 *   linha que abre a conversa): só o nome leva ao perfil.
 * - `dentroDeBotao`: quando o nome está dentro de um <button> (link dentro de
 *   botão não é HTML válido), vira um <span role="link"> que navega igual.
 * - `aoNavegar`: para fechar o modal/menu em que o nome está.
 */
export default function NomePerfil({
  id,
  nome,
  className,
  children,
  dentroDeBotao = false,
  aoNavegar,
}: {
  id: string | number | null | undefined;
  nome?: string | null;
  className?: string;
  children?: ReactNode;
  dentroDeBotao?: boolean;
  aoNavegar?: () => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const texto = children ?? (nome || 'Alguém');
  if (id === null || id === undefined || String(id) === '') {
    return <span className={className}>{texto}</span>;
  }
  const destino = getUserProfileHref(id, user?.id);
  const estilo = cn('cursor-pointer hover:underline underline-offset-2', className);

  if (dentroDeBotao) {
    const ir = (e: MouseEvent | KeyboardEvent) => {
      e.stopPropagation();
      e.preventDefault();
      aoNavegar?.();
      navigate(destino);
    };
    return (
      <span
        role="link"
        tabIndex={0}
        className={estilo}
        onClick={ir}
        onKeyDown={(e) => { if (e.key === 'Enter') ir(e); }}
      >
        {texto}
      </span>
    );
  }

  return (
    <Link
      to={destino}
      className={estilo}
      onClick={(e) => { e.stopPropagation(); aoNavegar?.(); }}
    >
      {texto}
    </Link>
  );
}

import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import TextoComLinks from '@/components/TextoComLinks';

/**
 * Renderiza o texto de uma publicação transformando @menções em links.
 *
 * A regra de reconhecimento é a MESMA do backend (extractMentionNames em
 * backend/src/app.ts) — se uma mudar, a outra precisa mudar junto, senão o
 * texto vira link para alguém que não foi notificado (ou o contrário).
 *
 * O link aponta para /users/:nome — o backend resolve por nome, que é único.
 */
const MENTION_RE = /(?<![\p{L}\p{N}._-])@([\p{L}\p{N}._-]{2,30})/gu;

type PostContentProps = {
  content: string;
  className?: string;
  /** Endereços viram link (texto da publicação). Comentários ficam sem: é onde mais vem spam. */
  links?: boolean;
};

export default function PostContent({ content, className, links = false }: PostContentProps) {
  const texto = String(content ?? '');
  if (!texto) return null;

  const pedacos: Array<string | { nome: string; bruto: string }> = [];
  let ultimo = 0;

  for (const m of texto.matchAll(MENTION_RE)) {
    const inicio = m.index ?? 0;
    // Pontuação final não faz parte do nome — fica no texto normal.
    const nome = m[1].replace(/[._-]+$/, '');
    if (nome.length < 2) continue;

    if (inicio > ultimo) pedacos.push(texto.slice(ultimo, inicio));
    pedacos.push({ nome, bruto: `@${nome}` });
    ultimo = inicio + 1 + nome.length;
  }
  if (ultimo < texto.length) pedacos.push(texto.slice(ultimo));

  return (
    <span className={className}>
      {pedacos.map((p, i) =>
        typeof p === 'string' ? (
          <Fragment key={i}>{links ? <TextoComLinks texto={p} /> : p}</Fragment>
        ) : (
          <Link
            key={i}
            to={`/users/${encodeURIComponent(p.nome)}`}
            className="font-medium text-brand-pink hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {p.bruto}
          </Link>
        )
      )}
    </span>
  );
}

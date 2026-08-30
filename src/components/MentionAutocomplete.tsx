import { useCallback, useEffect, useRef, useState } from 'react';
import { usersService } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { cn } from '@/lib/utils';

/**
 * Autocomplete de @menção para um <textarea>.
 *
 * Olha o texto ANTES do cursor: se terminar num @token, sugere perfis. O
 * padrão do token é o mesmo do parser de menções (backend
 * extractMentionNames e src/components/PostContent.tsx) — os três precisam
 * andar juntos.
 *
 * O componente não controla o textarea; ele recebe o valor e devolve o texto
 * já com a menção inserida, para não brigar com o estado de quem o usa.
 */

// Igual ao parser, mas ancorado no fim (o que está sendo digitado agora).
const TOKEN_NO_CURSOR = /(?<![\p{L}\p{N}._-])@([\p{L}\p{N}._-]{0,30})$/u;

export type PerfilSugerido = {
  id: string;
  name: string;
  avatar: string | null;
  gender: string | null;
  city: string | null;
  state: string | null;
};

type MentionAutocompleteProps = {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (novoValor: string) => void;
  className?: string;
};

/** Extrai o @token que está sendo digitado imediatamente antes do cursor. */
function findMentionToken(texto: string, cursor: number): { query: string; inicio: number } | null {
  const antes = texto.slice(0, cursor);
  const m = antes.match(TOKEN_NO_CURSOR);
  if (!m) return null;
  return { query: m[1], inicio: antes.length - m[0].length };
}

export default function MentionAutocomplete({
  textareaRef,
  value,
  onChange,
  className,
}: MentionAutocompleteProps) {
  const [sugestoes, setSugestoes] = useState<PerfilSugerido[]>([]);
  const [aberto, setAberto] = useState(false);
  const [destacado, setDestacado] = useState(0);
  const tokenRef = useRef<{ query: string; inicio: number } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fechar = useCallback(() => {
    setAberto(false);
    setSugestoes([]);
    tokenRef.current = null;
  }, []);

  // Insere a menção escolhida no lugar do token que estava sendo digitado.
  const escolher = useCallback(
    (perfil: PerfilSugerido) => {
      const token = tokenRef.current;
      const el = textareaRef.current;
      if (!token || !el) return;
      const fim = token.inicio + 1 + token.query.length;
      const depois = value.slice(fim);
      // Só acrescenta espaço se o que vem depois já não começar com espaço ou
      // pontuação — senão "@nub, tudo" viraria "@fulano , tudo".
      const sufixo = /^[\s,.!?;:)\]}]/.test(depois) ? '' : ' ';
      const novo = `${value.slice(0, token.inicio)}@${perfil.name}${sufixo}${depois}`;
      onChange(novo);
      fechar();
      // Devolve o cursor para logo depois da menção inserida.
      const cursorFinal = token.inicio + 1 + perfil.name.length + sufixo.length;
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(cursorFinal, cursorFinal);
      });
    },
    [value, onChange, fechar, textareaRef]
  );

  // Procura o token a cada digitação/movimento de cursor e busca sugestões.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    const avaliar = () => {
      const token = findMentionToken(value, el.selectionStart ?? value.length);
      tokenRef.current = token;
      if (debounceRef.current) clearTimeout(debounceRef.current);

      // O endpoint exige 2 caracteres; abaixo disso não vale disparar busca.
      if (!token || token.query.length < 2) {
        setAberto(false);
        setSugestoes([]);
        return;
      }
      debounceRef.current = setTimeout(() => {
        usersService
          .suggestUsers(token.query)
          .then((r) => {
            // Se o usuário já mudou o token, a resposta antiga não vale.
            if (tokenRef.current?.query !== token.query) return;
            const lista = r.users || [];
            setSugestoes(lista);
            setDestacado(0);
            setAberto(lista.length > 0);
          })
          .catch(() => {
            setSugestoes([]);
            setAberto(false);
          });
      }, 200);
    };

    avaliar();
    // `selectionchange` cobre mover o cursor com seta/clique sem digitar.
    document.addEventListener('selectionchange', avaliar);
    return () => {
      document.removeEventListener('selectionchange', avaliar);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, textareaRef]);

  // Setas/Enter/Escape enquanto a lista está aberta.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el || !aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setDestacado((i) => (i + 1) % sugestoes.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setDestacado((i) => (i - 1 + sugestoes.length) % sugestoes.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        // Enter aqui escolhe a menção em vez de quebrar linha/publicar.
        e.preventDefault();
        e.stopPropagation();
        const escolhido = sugestoes[destacado];
        if (escolhido) escolher(escolhido);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        fechar();
      }
    };
    el.addEventListener('keydown', aoTeclar);
    return () => el.removeEventListener('keydown', aoTeclar);
  }, [aberto, sugestoes, destacado, escolher, fechar, textareaRef]);

  if (!aberto || sugestoes.length === 0) return null;

  return (
    <div
      className={cn(
        'absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg',
        className
      )}
      role="listbox"
      aria-label="Perfis para marcar"
    >
      {sugestoes.map((p, i) => (
        <button
          key={p.id}
          type="button"
          role="option"
          aria-selected={i === destacado}
          // `onMouseDown` em vez de onClick: o clique não tira o foco do
          // textarea antes de inserirmos a menção.
          onMouseDown={(e) => {
            e.preventDefault();
            escolher(p);
          }}
          onMouseEnter={() => setDestacado(i)}
          className={cn(
            'flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
            i === destacado ? 'bg-secondary' : 'hover:bg-secondary/60'
          )}
        >
          {p.avatar ? (
            <img
              src={resolveServerUrl(p.avatar)}
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold">
              {p.name[0]?.toUpperCase() || 'U'}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">@{p.name}</span>
            {[p.gender, [p.city, p.state].filter(Boolean).join('/')].filter(Boolean).length > 0 ? (
              <span className="block truncate text-xs text-muted-foreground">
                {[p.gender, [p.city, p.state].filter(Boolean).join('/')].filter(Boolean).join(' · ')}
              </span>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  );
}

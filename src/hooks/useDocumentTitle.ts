import { useEffect } from 'react';

const SUFIXO = 'NoSigilo.net';

/**
 * Define o título da aba enquanto a tela estiver montada e devolve o anterior
 * ao sair. As 12 rotas do app compartilhavam o título da home, o que deixa o
 * histórico e o seletor de abas do iOS ilegíveis.
 *
 * Passar `null` mantém o título atual (útil enquanto o nome ainda carrega).
 */
export function useDocumentTitle(titulo: string | null | undefined) {
  useEffect(() => {
    if (!titulo) return;
    const anterior = document.title;
    document.title = `${titulo} · ${SUFIXO}`;
    return () => {
      document.title = anterior;
    };
  }, [titulo]);
}

export default useDocumentTitle;

import { useEffect } from 'react';

// ─── Painéis que o Analista IA enxerga ──────────────────────────────────────
//
// Cada dashboard do admin publica aqui os dados que está mostrando (os mesmos
// que desenhou na tela, com os filtros aplicados). O Analista IA lê o que está
// publicado e manda junto com a pergunta. Assim a análise é sobre o que você
// está vendo, sem o servidor refazer consultas pesadas.
//
// Só publique números agregados. Listas de pessoas (usuários, abandonos de PIX
// com nome, promotores) ficam de fora — e o servidor ainda remove campos
// pessoais que escaparem.

export type PainelPublicado = {
  nome: string; // como aparece para o admin, ex.: "Métricas"
  aba: string; // valor da aba do admin, ex.: "metrics"
  filtros?: Record<string, unknown>;
  dados: unknown;
  atualizadoEm: string;
};

const paineis = new Map<string, PainelPublicado>();

export function lerPaineisPublicados(): PainelPublicado[] {
  return Array.from(paineis.values());
}

/**
 * Publica os dados de um painel enquanto o componente está montado. Ao
 * desmontar, o painel sai — a IA não analisa o que já não está na tela.
 */
export function usePublicarPainel(
  nome: string,
  aba: string,
  dados: unknown,
  filtros?: Record<string, unknown>
) {
  const filtrosTexto = JSON.stringify(filtros ?? {});
  useEffect(() => {
    if (dados == null) {
      paineis.delete(nome);
      return;
    }
    paineis.set(nome, {
      nome,
      aba,
      filtros: JSON.parse(filtrosTexto),
      dados,
      atualizadoEm: new Date().toISOString(),
    });
    return () => {
      paineis.delete(nome);
    };
  }, [nome, aba, dados, filtrosTexto]);
}

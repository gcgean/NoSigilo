import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Fila de prioridade para os avisos do topo do feed.
 *
 * Antes, "Deseja instalar o app?", a pílula de assinante, "Ative as
 * notificações" e o card de saudação podiam aparecer todos ao mesmo tempo —
 * o conteúdo real ("TOP DO DIA") só começava depois de ~450px de avisos
 * empilhados. Agora só o de maior prioridade entre os elegíveis é exibido;
 * ao ser dispensado (ou deixar de ser elegível), o próximo da fila aparece.
 *
 * Os avisos vivem em componentes diferentes (alguns em Layout.tsx, outros em
 * Feed.tsx), então a fila precisa ser um estado compartilhado — daqui o
 * Context em vez de coordenar por props.
 */
type Registro = { priority: number; eligible: boolean };

type QueueContextValue = {
  register: (id: string, priority: number, eligible: boolean) => void;
  activeId: string | null;
};

const FeedBannerQueueContext = createContext<QueueContextValue | null>(null);

export function FeedBannerQueueProvider({ children }: { children: ReactNode }) {
  const [registry, setRegistry] = useState<Record<string, Registro>>({});

  const register = useCallback((id: string, priority: number, eligible: boolean) => {
    setRegistry((prev) => {
      const atual = prev[id];
      if (atual && atual.priority === priority && atual.eligible === eligible) return prev;
      return { ...prev, [id]: { priority, eligible } };
    });
  }, []);

  const activeId = useMemo(() => {
    let melhorId: string | null = null;
    let melhorPrioridade = Infinity;
    for (const [id, entrada] of Object.entries(registry)) {
      if (entrada.eligible && entrada.priority < melhorPrioridade) {
        melhorId = id;
        melhorPrioridade = entrada.priority;
      }
    }
    return melhorId;
  }, [registry]);

  const value = useMemo(() => ({ register, activeId }), [register, activeId]);

  return (
    <FeedBannerQueueContext.Provider value={value}>
      {children}
    </FeedBannerQueueContext.Provider>
  );
}

/**
 * Registra um aviso na fila e diz se é a vez dele aparecer.
 *
 * `priority`: menor número vence quando mais de um está elegível.
 * `eligible`: a própria condição que hoje decide "mostrar ou não" o aviso —
 * a fila só decide QUEM aparece entre os elegíveis, não inventa elegibilidade.
 */
export function useBannerSlot(id: string, priority: number, eligible: boolean): boolean {
  const ctx = useContext(FeedBannerQueueContext);

  useEffect(() => {
    ctx?.register(id, priority, eligible);
  }, [ctx, id, priority, eligible]);

  // Sem provider (ex.: um teste isolado do componente), não bloqueia — deixa
  // a própria condição de elegibilidade decidir, como era antes da fila.
  if (!ctx) return eligible;

  return ctx.activeId === id;
}

/**
 * Wrapper de conveniência: chama useBannerSlot e só renderiza `children`
 * quando é a vez deste aviso. Cada aviso continua calculando sua própria
 * elegibilidade (a prop `eligible`) exatamente como antes — a fila só
 * decide quem, entre os elegíveis, tem prioridade.
 */
export function BannerSlot({
  id,
  priority,
  eligible,
  children,
}: {
  id: string;
  priority: number;
  eligible: boolean;
  children: ReactNode;
}) {
  const isActive = useBannerSlot(id, priority, eligible);
  if (!isActive) return null;
  return <>{children}</>;
}

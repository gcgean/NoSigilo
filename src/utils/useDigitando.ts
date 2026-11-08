import { useCallback, useEffect, useRef, useState } from 'react';
import apiClient from '@/utils/apiClient';

/** "Fulano está digitando…", "Fulano e Beltrano estão digitando…", "3 pessoas estão digitando…". */
export function textoDigitando(nomes: string[]): string | null {
  if (nomes.length === 0) return null;
  if (nomes.length === 1) return `${nomes[0]} está digitando…`;
  if (nomes.length === 2) return `${nomes[0]} e ${nomes[1]} estão digitando…`;
  return `${nomes.length} pessoas estão digitando…`;
}

const DURA_MS = 5000;
const AVISA_A_CADA_MS = 3000;

/**
 * Quem está digitando na sala ou na cabine. `chegou` registra o aviso que veio do
 * servidor; `falou` tira a pessoa da lista quando a mensagem dela chega; `digitei`
 * avisa o servidor (no máximo a cada 3 s) enquanto eu digito.
 */
export function useDigitando(rota: string | null, meuId: string | null | undefined) {
  const [lista, setLista] = useState<Record<string, { nome: string; ate: number }>>({});
  const ultimoAviso = useRef(0);

  useEffect(() => {
    if (Object.keys(lista).length === 0) return;
    const t = setInterval(() => {
      const agora = Date.now();
      setLista((l) => {
        const vivos = Object.entries(l).filter(([, v]) => v.ate > agora);
        return vivos.length === Object.keys(l).length ? l : Object.fromEntries(vivos);
      });
    }, 1000);
    return () => clearInterval(t);
  }, [lista]);

  useEffect(() => { setLista({}); }, [rota]);

  const chegou = useCallback((id: string, nome: string) => {
    if (!id || id === meuId) return;
    setLista((l) => ({ ...l, [id]: { nome, ate: Date.now() + DURA_MS } }));
  }, [meuId]);

  const falou = useCallback((id?: string | null) => {
    if (!id) return;
    setLista((l) => {
      if (!(id in l)) return l;
      const { [id]: _, ...resto } = l;
      return resto;
    });
  }, []);

  const digitei = useCallback(() => {
    if (!rota) return;
    const agora = Date.now();
    if (agora - ultimoAviso.current < AVISA_A_CADA_MS) return;
    ultimoAviso.current = agora;
    void apiClient.post(rota).catch(() => {});
  }, [rota]);

  return { texto: textoDigitando(Object.values(lista).map((v) => v.nome)), chegou, falou, digitei };
}

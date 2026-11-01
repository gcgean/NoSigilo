import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/**
 * Rolagem do chat d'A Casa (salas e cabines) no jeito dos grupos do WhatsApp:
 * - só desce sozinho se a pessoa já está no fim (ou se a mensagem é dela);
 * - se ela subiu para ler, conta as novas e mostra o botão "⬇ N novas";
 * - resposta a uma mensagem dela, ou @Nome dela no texto, vira "@ falaram com você" (toque leva até ela);
 * - tocar na citação leva até a mensagem original e ela pisca;
 * - ao voltar para a sala/cabine, marca "Mensagens não lidas" onde parou.
 *
 * Cada mensagem renderizada precisa de `data-msg-id={m.id}` dentro da lista.
 */
type MsgBase = { id: string; autor?: { id: string } | null; resposta?: { id: string } | null; texto?: string };

const PERTO_DO_FIM = 120; // px
const chaveLida = (chave: string) => `nosigilo:casa-lida:${chave}`;

export function useRolagemDoChat<T extends MsgBase>(opts: {
  /** Sala ou cabine atual (null = nada aberto). */
  chave: string | null;
  mensagens: T[] | undefined;
  meuId: string;
  /** Meu nome na sala/cabine: quem escrever @Nome me chama. */
  meuNome?: string;
}) {
  const { chave, mensagens, meuId, meuNome } = opts;
  const listaRef = useRef<HTMLDivElement | null>(null);
  const noFimRef = useRef(true);
  const [noFim, setNoFim] = useState(true);
  const [novas, setNovas] = useState(0);
  const [mencao, setMencao] = useState<string | null>(null);
  const [marcador, setMarcador] = useState<string | null>(null);
  const [destacada, setDestacada] = useState<string | null>(null);
  const ultimaVista = useRef<string | null>(null);
  const chaveCarregada = useRef<string | null>(null);
  const chaveAtual = useRef<string | null | undefined>(undefined);

  const elDaMsg = (id: string) =>
    listaRef.current?.querySelector<HTMLElement>(`[data-msg-id="${id.replace(/["\\]/g, '\\$&')}"]`) ?? null;

  const guardarLida = useCallback((id: string | undefined) => {
    if (!chave || !id) return;
    try { sessionStorage.setItem(chaveLida(chave), id); } catch { /* modo restrito */ }
  }, [chave]);

  const irParaFim = useCallback((suave = false) => {
    const el = listaRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: suave ? 'smooth' : 'auto' });
    noFimRef.current = true;
    setNoFim(true);
    setNovas(0);
    setMencao(null);
  }, []);

  /** Leva até a mensagem e faz ela piscar. Devolve false se ela já saiu do histórico. */
  const irPara = useCallback((id: string) => {
    const el = elDaMsg(id);
    if (!el) return false;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setDestacada(id);
    window.setTimeout(() => setDestacada((d) => (d === id ? null : d)), 1800);
    return true;
  }, []);

  const aoRolar = useCallback(() => {
    const el = listaRef.current;
    if (!el) return;
    const perto = el.scrollHeight - el.scrollTop - el.clientHeight < PERTO_DO_FIM;
    if (perto !== noFimRef.current) { noFimRef.current = perto; setNoFim(perto); }
    if (perto) {
      setNovas(0);
      setMencao(null);
      guardarLida(mensagens?.[mensagens.length - 1]?.id);
    }
  }, [guardarLida, mensagens]);

  // Mensagens mudaram (chegou, carregou, foi apagada) ou trocou de sala/cabine.
  useLayoutEffect(() => {
    // Trocou de sala/cabine: zera tudo (aqui mesmo, antes de posicionar; um
    // useEffect separado rodaria depois e apagaria o posicionamento).
    if (chaveAtual.current !== chave) {
      chaveAtual.current = chave;
      chaveCarregada.current = null;
      ultimaVista.current = null;
      noFimRef.current = true;
      setNoFim(true);
      setNovas(0);
      setMencao(null);
      setMarcador(null);
      setDestacada(null);
    }
    if (!chave || !mensagens) return;
    const ultima = mensagens[mensagens.length - 1];

    // Primeira carga desta sala/cabine: volta onde parou, com a linha de não lidas.
    if (chaveCarregada.current !== chave) {
      if (mensagens.length === 0) return;
      chaveCarregada.current = chave;
      ultimaVista.current = ultima.id;
      let lida: string | null = null;
      try { lida = sessionStorage.getItem(chaveLida(chave)); } catch { /* modo restrito */ }
      const i = lida ? mensagens.findIndex((m) => m.id === lida) : -1;
      if (i >= 0 && i < mensagens.length - 1) {
        const primeiraNova = mensagens[i + 1].id;
        setMarcador(primeiraNova);
        requestAnimationFrame(() => {
          const el = elDaMsg(primeiraNova);
          if (el) { el.scrollIntoView({ block: 'start' }); listaRef.current?.scrollBy({ top: -40 }); aoRolarDepois(); }
          else irParaFim();
        });
      } else {
        requestAnimationFrame(() => irParaFim());
        guardarLida(ultima.id);
      }
      return;
    }

    if (!ultima || ultima.id === ultimaVista.current) return;
    // Quais chegaram desde a última que eu tinha (pode ter vindo mais de uma).
    const iAntes = ultimaVista.current ? mensagens.findIndex((m) => m.id === ultimaVista.current) : -1;
    ultimaVista.current = ultima.id;
    // A que eu tinha como última sumiu (foi apagada): não é mensagem nova.
    if (iAntes < 0) return;
    const chegaram = mensagens.slice(iAntes + 1);

    if (ultima.autor?.id === meuId || noFimRef.current) {
      irParaFim();
      guardarLida(ultima.id);
      return;
    }
    const minhas = new Set(mensagens.filter((m) => m.autor?.id === meuId).map((m) => m.id));
    const deFora = chegaram.filter((m) => m.autor?.id !== meuId);
    if (deFora.length === 0) return;
    setNovas((n) => n + deFora.length);
    setMarcador((mk) => mk ?? deFora[0].id);
    const marcaMeu = meuNome ? `@${meuNome.toLowerCase()}` : null;
    const resposta = deFora.find((m) => (m.resposta && minhas.has(m.resposta.id)) || (!!marcaMeu && !!m.texto && m.texto.toLowerCase().includes(marcaMeu)));
    if (resposta) setMencao((x) => x ?? resposta.id);
  }, [chave, mensagens, meuId, meuNome]); // eslint-disable-line react-hooks/exhaustive-deps

  // Depois de posicionar na primeira carga, confere se ficou no fim.
  const aoRolarDepois = () => requestAnimationFrame(() => aoRolar());

  return { listaRef, aoRolar, noFim, novas, mencao, marcador, destacada, irParaFim, irPara, setMencao };
}

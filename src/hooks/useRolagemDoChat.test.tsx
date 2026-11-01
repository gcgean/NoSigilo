import { Fragment, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ArrastaParaResponder, BotoesDeNovas, Citacao, LinhaNaoLidas } from '@/components/ChatDaCasaUi';
import { useRolagemDoChat } from '@/hooks/useRolagemDoChat';

type M = { id: string; autor: { id: string }; texto: string; resposta?: { id: string; nome: string; trecho: string } };
const msg = (id: string, autor: string, resposta?: string): M => ({
  id, autor: { id: autor }, texto: `texto ${id}`, resposta: resposta ? { id: resposta, nome: 'alguém', trecho: 'trecho' } : undefined,
});
const iniciais = Array.from({ length: 30 }, (_, i) => msg(`m${i}`, i % 3 === 0 ? 'eu' : 'outro'));

let api: { add: (...m: M[]) => void } = { add: () => {} };
function Chat({ chave = 'sala', inicio = iniciais }: { chave?: string; inicio?: M[] }) {
  const [msgs, setMsgs] = useState(inicio);
  const [resp, setResp] = useState('');
  const [aviso, setAviso] = useState('');
  api = { add: (...m) => setMsgs((l) => [...l, ...m]) };
  const r = useRolagemDoChat({ chave, mensagens: msgs, meuId: 'eu', meuNome: 'Pablo&Nina' });
  const ir = (id: string) => { if (!r.irPara(id)) setAviso('sumiu'); };
  return (
    <div>
      <div data-testid="lista" ref={r.listaRef} onScroll={r.aoRolar}>
        {msgs.map((m) => (
          <Fragment key={m.id}>
            {r.marcador === m.id && <LinhaNaoLidas />}
            <ArrastaParaResponder data-msg-id={m.id} ativo destacada={r.destacada === m.id} onResponder={() => setResp(m.id)}>
              {m.resposta && <Citacao nome={m.resposta.nome} trecho={m.resposta.trecho} onIr={() => ir(m.resposta!.id)} />}
              <p>{m.texto}</p>
            </ArrastaParaResponder>
          </Fragment>
        ))}
      </div>
      <BotoesDeNovas noFim={r.noFim} novas={r.novas} mencao={r.mencao} onFim={() => r.irParaFim()}
        onMencao={() => { const id = r.mencao; r.setMencao(null); if (id) ir(id); }} />
      <span data-testid="resp">{resp}</span>
      <span data-testid="aviso">{aviso}</span>
    </div>
  );
}

// jsdom não tem layout: lista de 3000px numa janela de 500px.
let topo = 0;
const rolados: string[] = [];
beforeEach(() => {
  topo = 0;
  rolados.length = 0;
  sessionStorage.clear();
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 3000 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 500 });
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', { configurable: true, get: () => topo, set: (v: number) => { topo = v; } });
  HTMLElement.prototype.scrollTo = function (this: HTMLElement, o: any) { topo = o.top; } as any;
  HTMLElement.prototype.scrollBy = function () {} as any;
  HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) { rolados.push(this.dataset.msgId ?? ''); };
});
const quadro = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
const subir = () => { topo = 0; fireEvent.scroll(screen.getByTestId('lista')); };
const descer = () => { topo = 2500; fireEvent.scroll(screen.getByTestId('lista')); };

describe('rolagem do chat d\'A Casa', () => {
  it('no fim, mensagem nova desce sozinha e não mostra botão', async () => {
    render(<Chat />);
    await quadro();
    expect(topo).toBe(3000);
    act(() => api.add(msg('n1', 'outro')));
    expect(topo).toBe(3000);
    expect(screen.queryByText(/nova/)).toBeNull();
  });

  it('lendo mais acima: não pula, conta as novas e marca as não lidas', async () => {
    render(<Chat />);
    await quadro();
    subir();
    act(() => api.add(msg('n1', 'outro'), msg('n2', 'outro'), msg('n3', 'outro')));
    expect(topo).toBe(0);
    expect(screen.getByText('3 novas')).toBeTruthy();
    expect(screen.getByText('Mensagens não lidas')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '3 mensagens novas' }));
    expect(topo).toBe(3000);
    expect(screen.queryByText('3 novas')).toBeNull();
  });

  it('mensagem minha sempre leva ao fim', async () => {
    render(<Chat />);
    await quadro();
    subir();
    act(() => api.add(msg('n1', 'eu')));
    expect(topo).toBe(3000);
  });

  it('resposta a mim mostra "@ falaram com você" e leva até ela', async () => {
    render(<Chat />);
    await quadro();
    subir();
    act(() => api.add(msg('r1', 'outro', 'm3'))); // m3 é minha
    fireEvent.click(screen.getByText('@ falaram com você'));
    expect(rolados).toContain('r1');
    expect(screen.queryByText('@ falaram com você')).toBeNull();
  });

  it('@Nome no texto também mostra "@ falaram com você"', async () => {
    render(<Chat />);
    await quadro();
    subir();
    act(() => api.add({ id: 'n1', autor: { id: 'outro' }, texto: 'oi @pablo&nina, bora?' }));
    fireEvent.click(screen.getByText('@ falaram com você'));
    expect(rolados).toContain('n1');
  });

  it('tocar na citação vai até a original e ela pisca; citação sumida avisa', async () => {
    render(<Chat />);
    await quadro();
    act(() => api.add(msg('c1', 'outro', 'm1'), msg('c2', 'outro', 'velha')));
    const citacoes = screen.getAllByTitle('Ir para a mensagem');
    fireEvent.click(citacoes[0]);
    expect(rolados).toContain('m1');
    expect(document.querySelector('[data-msg-id="m1"]')!.className).toMatch(/bg-amber/);
    fireEvent.click(citacoes[1]);
    expect(screen.getByTestId('aviso').textContent).toBe('sumiu');
  });

  it('arrastar para a direita responde; arrastar na vertical não', async () => {
    render(<Chat />);
    const el = document.querySelector('[data-msg-id="m5"]')!;
    fireEvent.touchStart(el, { touches: [{ clientX: 10, clientY: 100 }] });
    fireEvent.touchMove(el, { touches: [{ clientX: 12, clientY: 160 }] });
    fireEvent.touchMove(el, { touches: [{ clientX: 90, clientY: 160 }] });
    fireEvent.touchEnd(el);
    expect(screen.getByTestId('resp').textContent).toBe('');
    fireEvent.touchStart(el, { touches: [{ clientX: 10, clientY: 100 }] });
    fireEvent.touchMove(el, { touches: [{ clientX: 40, clientY: 102 }] });
    fireEvent.touchMove(el, { touches: [{ clientX: 90, clientY: 104 }] });
    fireEvent.touchEnd(el);
    expect(screen.getByTestId('resp').textContent).toBe('m5');
  });

  it('voltando para a sala, abre onde parou com a linha de não lidas', async () => {
    sessionStorage.setItem('nosigilo:casa-lida:sala', 'm20');
    render(<Chat />);
    await quadro();
    expect(rolados).toContain('m21');
    expect(screen.getByText('Mensagens não lidas')).toBeTruthy();
    descer();
    expect(sessionStorage.getItem('nosigilo:casa-lida:sala')).toBe('m29');
  });
});

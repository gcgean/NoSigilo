import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import apiClient from '@/utils/apiClient';
import CabineDaCasa from './CabineDaCasa';

vi.mock('@/utils/apiClient', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/utils/somDaCasa', async (orig) => ({ ...(await orig<any>()), tocarSomDaCasa: vi.fn() }));
const ouvintes = new Map<string, (d: any) => void>();
vi.mock('@/contexts/SocketContext', () => ({
  useSocket: () => ({ on: (ev: string, fn: (d: any) => void) => ouvintes.set(ev, fn), off: vi.fn() }),
}));

const eu = { id: 'eu', nome: 'Casal A', avatar: null, cat: 'casal' };
const ela = { id: 'ela', nome: 'Bia', avatar: null, cat: 'mulher' };
const lola = (id: string, texto: string, convite?: string) => ({ id, tipo: 'lola', texto, criadoEm: new Date().toISOString(), convite });
const cabine = (extra: Record<string, unknown>) => ({
  id: 'c1', membros: [eu, ela], aberta: false, votosPorta: 0, voteiPorta: false, espectadores: 0, eu: 'eu', decido: true,
  souMembro: true, souEspectador: false, entradas: [], pedi: false, quente: false, votosQuente: 0, voteiQuente: false,
  nivel: 0, calor: 0, nivelLiberado: 0, mensagens: [], ...extra,
});

const abrir = async (cab: Record<string, unknown>) => {
  vi.mocked(apiClient.post).mockImplementation(async (url: string) => (url.endsWith('/estado') ? { data: { cabine: cab } } : { data: { ok: true } }) as any);
  render(<MemoryRouter><CabineDaCasa cabineId="c1" modo="membro" meuIdPublico="eu" convidaveis={[]} onVoltar={() => {}} onSaiu={() => {}} /></MemoryRouter>);
  await screen.findByText(/Lola · anfitriã IA/i, undefined, { timeout: 3000 }).catch(() => null);
};

beforeEach(() => {
  vi.mocked(apiClient.post).mockReset(); ouvintes.clear();
  Element.prototype.scrollTo = vi.fn() as any; Element.prototype.scrollBy = vi.fn() as any; Element.prototype.scrollIntoView = vi.fn();
});

describe('Convites da Lola dentro da cabine', () => {
  it('convite "brincar" mostra as 3 ações leves e faz a ação direto (sem abrir o painel)', async () => {
    await abrir(cabine({ mensagens: [lola('m1', 'Querem esquentar?', 'brincar')] }));
    const beijo = await screen.findByRole('button', { name: /Beijar/i });
    expect(screen.getAllByRole('button').filter((b) => /Beijar|Pescoço|Passar a mão/i.test(b.textContent || ''))).toHaveLength(3);
    fireEvent.click(beijo);
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/casa/cabine/c1/acao', { acao: 'beijo', alvo: 'ela' }));
    expect(screen.queryByText(/Tesão/)).toBeNull();
  });

  it('as ações leves somem quando a Lola já liberou o próximo nível', async () => {
    await abrir(cabine({ nivelLiberado: 1, calor: 30, mensagens: [lola('m1', 'Querem esquentar?', 'brincar')] }));
    await screen.findByText('Querem esquentar?');
    expect(screen.queryByRole('button', { name: /Beijar/i })).toBeNull();
  });

  it('convite "liberar" mostra o botão de topar só na última mensagem desse tipo', async () => {
    await abrir(cabine({ nivelLiberado: 2, calor: 60, mensagens: [lola('m1', 'liberei as PRELIMINARES', 'liberar'), lola('m2', 'liberei a TRANSA', 'liberar')] }));
    const botoes = await screen.findAllByRole('button', { name: /Topo esquentar/i });
    expect(botoes).toHaveLength(1);
    fireEvent.click(botoes[0]);
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/casa/cabine/c1/esquentar', { quer: true }));
  });

  it('convite "jogos" mostra dado e provocação com a cabine quente', async () => {
    await abrir(cabine({ quente: true, mensagens: [lola('m1', 'Todos toparam', 'jogos')] }));
    fireEvent.click(await screen.findByRole('button', { name: /Jogar o dado/i }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/casa/cabine/c1/provocacao', { dado: true }));
    // Dado/provocação não ficam mais na barra do topo.
    expect(screen.getAllByRole('button', { name: /Provocação/i })).toHaveLength(1);
  });

  it('pedido para esquentar aparece como faixa compacta, sem abrir o painel por cima do chat', async () => {
    await abrir(cabine({}));
    await waitFor(() => expect(ouvintes.has('casa.cabine.esquentar')).toBe(true));
    act(() => ouvintes.get('casa.cabine.esquentar')!({ cabineId: 'c1', nome: 'Bia' }));
    expect(await screen.findByText(/quer esquentar\. Topa\?/)).toBeTruthy();
    expect(screen.queryByText(/Tesão/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Topo 🔥/ }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/casa/cabine/c1/esquentar', { quer: true }));
    expect(screen.queryByText(/quer esquentar\. Topa\?/)).toBeNull();
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import EfeitoDaCasa, { useFilaDeEfeitos } from './EfeitoDaCasa';
import { ligarEfeitos } from '@/utils/efeitosDaCasa';

vi.mock('@/utils/somDaCasa', () => ({ tocarSomDaCasa: vi.fn(async () => {}) }));
import { tocarSomDaCasa } from '@/utils/somDaCasa';

describe('animações d\'A Casa (27/11/2026)', () => {
  beforeEach(() => { ligarEfeitos(true); vi.mocked(tocarSomDaCasa).mockClear(); });

  it('fila: um efeito de cada vez, sem cortar o que está na tela', () => {
    const { result } = renderHook(() => useFilaDeEfeitos());
    act(() => { result.current.adicionar({ id: '1', efeito: 'gin', modo: 'cheio' }); });
    act(() => { result.current.adicionar({ id: '2', efeito: 'cerveja', modo: 'mini' }); });
    expect(result.current.atual?.id).toBe('1');
    act(() => { result.current.terminar(); });
    expect(result.current.atual?.id).toBe('2');
    act(() => { result.current.terminar(); });
    expect(result.current.atual).toBeNull();
  });

  it('fila cheia descarta primeiro o efeito pequeno de outras pessoas', () => {
    const { result } = renderHook(() => useFilaDeEfeitos(3));
    act(() => {
      result.current.adicionar({ id: 'a', efeito: 'gin', modo: 'cheio' });
      result.current.adicionar({ id: 'b', efeito: 'cerveja', modo: 'mini' });
      result.current.adicionar({ id: 'c', efeito: 'champanhe', modo: 'cheio' });
      result.current.adicionar({ id: 'd', efeito: 'brinde', modo: 'cheio' });
    });
    const ordem: string[] = [];
    for (let i = 0; i < 4 && result.current.atual; i++) { ordem.push(result.current.atual.id); act(() => { result.current.terminar(); }); }
    expect(ordem).toEqual(['a', 'c', 'd']);
  });

  it('animações desligadas: nada na tela, mas o som de quem recebeu continua', () => {
    ligarEfeitos(false);
    const { result } = renderHook(() => useFilaDeEfeitos());
    act(() => { result.current.adicionar({ id: '1', efeito: 'champanhe', modo: 'cheio' }); });
    expect(result.current.atual).toBeNull();
    expect(tocarSomDaCasa).toHaveBeenCalledWith('champanhe');
  });

  it('versão pequena não toca som e mostra o texto numa pílula', () => {
    render(<EfeitoDaCasa efeito="champanhe" texto="Ana pagou champanhe pra Bia" modo="mini" onFim={() => {}} />);
    expect(screen.getByTestId('efeito-casa-mini')).toBeTruthy();
    expect(screen.getByText('Ana pagou champanhe pra Bia')).toBeTruthy();
    expect(tocarSomDaCasa).not.toHaveBeenCalled();
  });

  it('versão grande toca o som do efeito', () => {
    render(<EfeitoDaCasa efeito="champanhe" texto="Ana pagou champanhe pra você!" onFim={() => {}} />);
    expect(screen.getByTestId('efeito-casa-cheio')).toBeTruthy();
    expect(tocarSomDaCasa).toHaveBeenCalledWith('champanhe');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import FiltrosContos from './FiltrosContos';
import { minutosDeLeitura } from '@/utils/tempoDeLeitura';

const base = {
  categorias: [{ slug: 'swing', nome: 'Swing e troca de casais', total: 5, naoLidos: 2 }],
  total: 5, naoLidos: 2, categoria: '', busca: '',
  onCategoria: vi.fn(), onBusca: vi.fn(),
};

describe('filtros dos contos', () => {
  it('três abas no topo: recentes, mais curtidos e não lidos', () => {
    const onOrdem = vi.fn(); const onLeitura = vi.fn();
    render(<FiltrosContos {...base} ordem="recentes" leitura="todos" onOrdem={onOrdem} onLeitura={onLeitura} />);
    expect(screen.getByRole('tab', { name: '🕒 Recentes' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: '🔥 Mais curtidos' }));
    expect(onOrdem).toHaveBeenLastCalledWith('votados');
    expect(onLeitura).toHaveBeenLastCalledWith('todos');
    fireEvent.click(screen.getByRole('tab', { name: '🆕 Não lidos (2)' }));
    expect(onLeitura).toHaveBeenLastCalledWith('nao_lidos');
  });

  it('"Não lidos" fica marcada quando é o filtro ativo', () => {
    render(<FiltrosContos {...base} ordem="recentes" leitura="nao_lidos" onOrdem={vi.fn()} onLeitura={vi.fn()} />);
    expect(screen.getByRole('tab', { name: '🆕 Não lidos (2)' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: '🕒 Recentes' }).getAttribute('aria-selected')).toBe('false');
  });

  it('tempo de leitura: 200 palavras por minuto, mínimo 1', () => {
    expect(minutosDeLeitura('')).toBe(1);
    expect(minutosDeLeitura('palavra '.repeat(1000))).toBe(5);
  });
});

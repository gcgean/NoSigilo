import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BarraDasSalas, ResumoDasCabines, contarCabines, type SalaNaBarra } from './NavegacaoDaCasa';

const salas: SalaNaBarra[] = [
  { id: 'salao', nome: 'Salão', emoji: '🔥', total: 32, cabines: [{ id: 'c1', aberta: true }, { id: 'c2', aberta: false }] },
  { id: 'cuckold', nome: 'Cuckold', emoji: '😈', total: 45, cabines: [{ id: 'c3', aberta: true }] },
  { id: 'glory', nome: 'Glory', emoji: '🕳️', total: 0, trancada: true, faltamParaAbrir: 4 },
  { id: 'casais', nome: 'Casais', emoji: '💑', total: 3, bloqueadaParaMim: true },
];

describe('navegação dentro d\'A Casa (27/11/2026)', () => {
  it('barra mostra as salas com quantas pessoas e troca em 1 toque', () => {
    const onEntrar = vi.fn();
    render(<BarraDasSalas salas={salas} atual="salao" onEntrar={onEntrar} />);
    expect(screen.getByText('45')).toBeTruthy();
    expect(screen.queryByText('Casais')).toBeNull(); // bloqueada para o meu perfil
    fireEvent.click(screen.getByText('Cuckold'));
    expect(onEntrar).toHaveBeenCalledWith('cuckold');
    // A sala atual e a trancada não trocam.
    fireEvent.click(screen.getByText('Salão'));
    fireEvent.click(screen.getByText('Glory'));
    expect(onEntrar).toHaveBeenCalledTimes(1);
  });

  it('conta cabines rolando: abertas de todas as salas + fechadas com conversa, sem as minhas', () => {
    expect(contarCabines(salas, [{ id: 'c2' }], [])).toEqual({ total: 3, abertas: 2 });
    expect(contarCabines(salas, [{ id: 'c2' }], ['c1', 'c2'])).toEqual({ total: 1, abertas: 1 });
  });

  it('faixa das cabines só aparece com cabine rolando e abre a lista', () => {
    const { rerender } = render(<ResumoDasCabines total={0} abertas={0} onAbrir={() => {}} />);
    expect(screen.queryByTestId('resumo-das-cabines')).toBeNull();
    const onAbrir = vi.fn();
    rerender(<ResumoDasCabines total={3} abertas={1} onAbrir={onAbrir} />);
    expect(screen.getByTestId('resumo-das-cabines').textContent).toContain('3 cabines rolando agora');
    expect(screen.getByTestId('resumo-das-cabines').textContent).toContain('1 de porta aberta');
    fireEvent.click(screen.getByTestId('resumo-das-cabines'));
    expect(onAbrir).toHaveBeenCalled();
  });
});

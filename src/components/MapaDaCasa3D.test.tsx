import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import MapaDaCasa3D, { vagasDasCabines } from './MapaDaCasa3D';
import type { CabineDoMapa, SalaDoMapa } from './MapaDaCasa';

const cabine = (id: string, aberta = false): CabineDoMapa => ({ id, aberta, pessoas: 2, espiando: 0, tipos: [] });
const sala = (cabines: CabineDoMapa[], extra: Partial<SalaDoMapa> = {}): SalaDoMapa => ({ id: 'salao', nome: 'Salão Principal', emoji: '🍸', total: 3, espiando: 0, pessoas: ['casal', 'homem'], cabines, ...extra });

describe('mapa 3D d\'A Casa', () => {
  it('a cabine aparece quando abre e some quando fecha', () => {
    const props = { onEntrar: vi.fn(), onEspiar: vi.fn() };
    const { rerender, container } = render(<MapaDaCasa3D salas={[sala([])]} {...props} />);
    expect(container.querySelector('[data-cabine]')).toBeNull();
    rerender(<MapaDaCasa3D salas={[sala([cabine('c1'), cabine('c2', true)])]} {...props} />);
    expect(container.querySelectorAll('[data-cabine]')).toHaveLength(2);
    expect(screen.getByText(/2 cabines montadas/)).toBeTruthy();
    rerender(<MapaDaCasa3D salas={[sala([cabine('c2', true)])]} {...props} />);
    expect(container.querySelector('[data-cabine="c1"]')).toBeNull();
    expect(container.querySelector('[data-cabine="c2"]')).not.toBeNull();
    expect(screen.getByText(/1 cabine montada/)).toBeTruthy();
    rerender(<MapaDaCasa3D salas={[sala([])]} {...props} />);
    expect(container.querySelector('[data-cabine]')).toBeNull();
  });

  it('porta aberta: tocar mostra o painel e o botão espia, sem entrar na sala', () => {
    const onEntrar = vi.fn();
    const onEspiar = vi.fn();
    const { container } = render(<MapaDaCasa3D salas={[sala([{ ...cabine('aberta', true), tipos: ['casal', 'homem'] }])]} onEntrar={onEntrar} onEspiar={onEspiar} />);
    fireEvent.click(container.querySelector('[data-cabine="aberta"]')!);
    expect(onEspiar).not.toHaveBeenCalled();
    expect(screen.getByText(/casal \+ .*homem/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Espiar' }));
    expect(onEspiar).toHaveBeenCalledWith('salao', 'aberta');
    expect(onEntrar).not.toHaveBeenCalled();
  });

  it('porta fechada: pede para entrar; sem receber pedidos, avisa; e o painel some se a cabine fechar', () => {
    const onPedir = vi.fn();
    const props = { onEntrar: vi.fn(), onEspiar: vi.fn(), onPedir };
    const fechadas = [{ id: 'recebe', tipos: ['mulher'], pedi: false }];
    const salas = [sala([cabine('recebe'), cabine('sem-pedidos')])];
    const { container, rerender } = render(<MapaDaCasa3D salas={salas} fechadas={fechadas} {...props} />);
    fireEvent.click(container.querySelector('[data-cabine="recebe"]')!);
    fireEvent.click(screen.getByRole('button', { name: /Pedir para entrar/ }));
    expect(onPedir).toHaveBeenCalledWith('recebe');
    rerender(<MapaDaCasa3D salas={salas} fechadas={[{ ...fechadas[0], pedi: true }]} {...props} />);
    expect((screen.getByRole('button', { name: 'Pedido enviado' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(container.querySelector('[data-cabine="sem-pedidos"]')!);
    expect(screen.getByText(/não está recebendo pedidos/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Pedir para entrar/ })).toBeNull();
    rerender(<MapaDaCasa3D salas={[sala([cabine('recebe')])]} fechadas={fechadas} {...props} />);
    expect(screen.queryByText(/não está recebendo pedidos/)).toBeNull();
  });

  it('mostra a foto e o destaque de quem está na sala e, sem foto, a bolinha do perfil', () => {
    const presentes = [{ id: 'a', nome: 'Ana', avatar: '/uploads/a.jpg', cat: 'mulher' as const, destaque: true }, { id: 'b', nome: 'Bia', avatar: null, cat: 'mulher' as const }];
    const { container, rerender } = render(<MapaDaCasa3D salas={[sala([], { presentes })]} onEntrar={vi.fn()} onEspiar={vi.fn()} />);
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(screen.getByText('🔥')).toBeTruthy();
    rerender(<MapaDaCasa3D salas={[sala([], { presentes: undefined })]} onEntrar={vi.fn()} onEspiar={vi.fn()} />);
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  it('tocar na sala entra, sala trancada não, e arrastar para girar não entra', () => {
    const onEntrar = vi.fn();
    const { container, rerender } = render(<MapaDaCasa3D salas={[sala([])]} onEntrar={onEntrar} onEspiar={vi.fn()} />);
    const salao = () => container.querySelector('[data-sala="salao"]')!;
    fireEvent.click(salao());
    expect(onEntrar).toHaveBeenCalledWith('salao');
    onEntrar.mockClear();
    fireEvent(salao(), new MouseEvent('pointerdown', { bubbles: true, clientX: 10 }));
    fireEvent(salao(), new MouseEvent('pointermove', { bubbles: true, clientX: 120 }));
    fireEvent(salao(), new MouseEvent('pointerup', { bubbles: true, clientX: 120 }));
    fireEvent.click(salao());
    expect(onEntrar).not.toHaveBeenCalled();
    rerender(<MapaDaCasa3D salas={[sala([], { trancada: true, faltamParaAbrir: 4 })]} onEntrar={onEntrar} onEspiar={vi.fn()} />);
    fireEvent.click(salao());
    expect(onEntrar).not.toHaveBeenCalled();
  });

  it('a cabine não muda de lugar quando outra fecha, e o excesso vira contador', () => {
    const lista = ['a', 'b', 'c', 'd'].map((id) => cabine(id));
    const ondeEsta = (cs: CabineDoMapa[], id: string) => [...vagasDasCabines(cs).ocupadas.entries()].find(([, c]) => c.id === id)?.[0];
    const antes = ondeEsta(lista, 'a');
    expect(ondeEsta(lista.filter((c) => c.id !== 'd'), 'a')).toBe(antes);
    const muitas = Array.from({ length: 9 }, (_, i) => cabine(`c${i}`));
    const { ocupadas, fora } = vagasDasCabines(muitas);
    expect(ocupadas.size).toBe(6);
    expect(fora).toHaveLength(3);
  });
});

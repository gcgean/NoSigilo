import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CabinesFechadas, { quemEstaDentro } from './CabinesFechadas';

describe('cabines fechadas na entrada da Casa', () => {
  it('descreve quem está dentro só pelo tipo de perfil', () => {
    expect(quemEstaDentro(['casal', 'mulher', 'mulher'])).toBe('👫 casal + 👩 2 mulheres');
    expect(quemEstaDentro(['homem', 'casal'])).toBe('👨 homem + 👫 casal');
  });

  it('pede para entrar e trava o botão depois do pedido', () => {
    const onPedir = vi.fn();
    const cab = { id: 'c1', sala: 'salao', salaNome: 'Salão Principal', salaEmoji: '🍸', tipos: ['casal', 'mulher'], desde: new Date().toISOString(), pedi: false };
    const { rerender } = render(<CabinesFechadas cabines={[cab]} pedindo={null} onPedir={onPedir} />);
    fireEvent.click(screen.getByText('🙋 Pedir para entrar'));
    expect(onPedir).toHaveBeenCalledWith(cab);
    rerender(<CabinesFechadas cabines={[{ ...cab, pedi: true }]} pedindo={null} onPedir={onPedir} />);
    expect((screen.getByText('Pedido enviado') as HTMLButtonElement).disabled).toBe(true);
  });

  it('sem cabine rolando, não mostra nada', () => {
    const { container } = render(<CabinesFechadas cabines={[]} pedindo={null} onPedir={() => {}} />);
    expect(container.textContent).toBe('');
  });
});

import { describe, expect, it } from 'vitest';
import { textoDigitando } from './useDigitando';

describe('quem está digitando', () => {
  it('um, dois ou mais nomes', () => {
    expect(textoDigitando([])).toBeNull();
    expect(textoDigitando(['Ana'])).toBe('Ana está digitando…');
    expect(textoDigitando(['Ana', 'Casal SP'])).toBe('Ana e Casal SP estão digitando…');
    expect(textoDigitando(['Ana', 'Bia', 'Caio'])).toBe('3 pessoas estão digitando…');
  });
});

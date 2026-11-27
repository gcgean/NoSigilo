import { describe, expect, it } from 'vitest';
import { situacaoSemSinal } from './casa.js';

describe('presença na Casa com o celular bloqueado (27/11/2026)', () => {
  it('até 75 s sem sinal continua normal', () => {
    expect(situacaoSemSinal(10_000)).toBe('presente');
    expect(situacaoSemSinal(75_000)).toBe('presente');
  });
  it('de 75 s a 5 min fica como "volta já", sem sair da sala', () => {
    expect(situacaoSemSinal(76_000)).toBe('ausente');
    expect(situacaoSemSinal(4 * 60_000)).toBe('ausente');
  });
  it('mais de 5 min sem sinal sai de verdade', () => {
    expect(situacaoSemSinal(5 * 60_000 + 1)).toBe('sair');
  });
});

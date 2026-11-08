import { beforeEach, describe, expect, it } from 'vitest';
import { cartaoContatosLiberadoHoje, contarNovosNaRegiao, marcarRegiaoVista, registrarCartaoContatosHoje } from './avisosDoChat';

describe('avisos do Chat', () => {
  beforeEach(() => localStorage.clear());

  it('cartão "Novos contatos" aparece uma vez por dia', () => {
    const manha = new Date(2026, 10, 8, 9, 0);
    const noite = new Date(2026, 10, 8, 22, 0);
    const amanha = new Date(2026, 10, 9, 8, 0);
    expect(cartaoContatosLiberadoHoje('u1', manha)).toBe(true);
    registrarCartaoContatosHoje('u1', manha);
    expect(cartaoContatosLiberadoHoje('u1', noite)).toBe(false);
    expect(cartaoContatosLiberadoHoje('u1', amanha)).toBe(true);
    expect(cartaoContatosLiberadoHoje('outro', noite)).toBe(true);
  });

  it('"Na região" conta só os perfis que a pessoa ainda não viu', () => {
    expect(contarNovosNaRegiao('u1', ['a', 'b', 'c'])).toBe(3);
    marcarRegiaoVista('u1', ['a', 'b', 'c']);
    expect(contarNovosNaRegiao('u1', ['a', 'b', 'c'])).toBe(0);
    expect(contarNovosNaRegiao('u1', ['b', 'c', 'd', 'e'])).toBe(2);
  });
});

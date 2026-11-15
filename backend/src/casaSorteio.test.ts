import { describe, expect, it } from 'vitest';
import { fechamentoDaNoite, quemSugerirParaDrink, sortearGanhadores } from './casa.js';

describe('sorteio da Casa', () => {
  it('sorteia pessoas diferentes, nunca mais que o pedido', () => {
    const lista = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < 50; i++) {
      const g = sortearGanhadores(lista, 2);
      expect(g).toHaveLength(2);
      expect(new Set(g).size).toBe(2);
      expect(g.every((x) => lista.includes(x))).toBe(true);
    }
    expect(sortearGanhadores(['a'], 2)).toEqual(['a']);
    expect(sortearGanhadores([], 2)).toEqual([]);
    expect(lista).toEqual(['a', 'b', 'c', 'd']); // não mexe na lista original
  });
});

describe('quebra-gelo: sugestão de drink', () => {
  const agora = Date.now();
  const p = (id: string, cat: string, falouHaMin: number | null, extra: Record<string, unknown> = {}) => ({
    id, cat, ultimaMsg: falouHaMin === null ? 0 : agora - falouHaMin * 60_000, podeFalar: true, querBrincar: false, pulseira: null as string | null, ...extra,
  });

  it('homem recebe sugestão de casal ou mulher ativo, quem quer brincar primeiro', () => {
    const eu = p('eu', 'homem', null);
    const sala = [eu, p('h2', 'homem', 1), p('c1', 'casal', 2), p('m1', 'mulher', 3, { querBrincar: true })];
    expect(quemSugerirParaDrink(eu, sala, agora)?.id).toBe('m1');
  });

  it('ignora quem está calado há mais de 10 min, de pulseira vermelha ou só olhando', () => {
    const eu = p('eu', 'homem', null);
    const sala = [eu, p('c1', 'casal', 15), p('c2', 'casal', 1, { pulseira: 'vermelha' }), p('m1', 'mulher', 1, { podeFalar: false }), p('h2', 'homem', 1)];
    expect(quemSugerirParaDrink(eu, sala, agora)).toBeNull();
  });

  it('casal pode receber sugestão de qualquer um, o mais recente primeiro', () => {
    const eu = p('eu', 'casal', null);
    const sala = [eu, p('h1', 'homem', 5), p('h2', 'homem', 1)];
    expect(quemSugerirParaDrink(eu, sala, agora)?.id).toBe('h2');
  });
});

describe('fechamento da rádio', () => {
  const uma = { titulo: 'Fechamento – uma da manhã' };
  const duas = { titulo: 'Fechamento – duas da manhã' };
  const neutro = { titulo: 'Fechamento – a Casa vai fechar' };
  it('escolhe pela hora que a Lola fala', () => {
    expect(fechamentoDaNoite([uma, duas], 1)).toBe(uma);
    expect(fechamentoDaNoite([uma, duas], 2)).toBe(duas);
  });
  it('sem o da hora certa usa o neutro; só com o da outra hora, não toca', () => {
    expect(fechamentoDaNoite([uma, neutro], 2)).toBe(neutro);
    expect(fechamentoDaNoite([uma], 2)).toBeNull();
    expect(fechamentoDaNoite([uma, neutro], null)).toBe(neutro);
  });
});

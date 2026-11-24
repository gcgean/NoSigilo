import { describe, expect, it } from 'vitest';
import { montarCrescimento, paisDaConta } from './crescimentoBase.js';

describe('crescimento da base por país (24/11/2026)', () => {
  it('país: UF PT é Portugal; sem UF usa o país dos acessos; sem nada é Brasil', () => {
    expect(paisDaConta('PT', 'BR')).toBe('PT');
    expect(paisDaConta('SP', 'PT')).toBe('BR');
    expect(paisDaConta('', 'PT')).toBe('PT');
    expect(paisDaConta(null, 'US')).toBe('OUTROS');
    expect(paisDaConta('', '')).toBe('BR');
  });

  it('separa cadastros, saídas e assinantes por país, e assinante novo só no 1º pagamento', () => {
    const contas = [
      { id: 'b1', criadoEm: '2020-01-10T12:00:00.000Z', pais: 'BR' as const, contaNaBase: true },
      { id: 'b2', criadoEm: '2020-02-10T12:00:00.000Z', pais: 'BR' as const, contaNaBase: true },
      { id: 'p1', criadoEm: '2020-02-01T02:30:00.000Z', pais: 'PT' as const, contaNaBase: true }, // 31/01 em Brasília
      { id: 'v1', criadoEm: '2020-01-10T12:00:00.000Z', pais: 'BR' as const, contaNaBase: false },
    ];
    const r = montarCrescimento({
      contas,
      saidas: [{ userId: 'b1', em: '2020-02-15T12:00:00.000Z' }],
      pagamentos: [
        { userId: 'p1', em: '2020-01-31T12:00:00.000Z' },
        { userId: 'p1', em: '2020-02-28T12:00:00.000Z' },
        { userId: 'b2', em: '2020-02-20T12:00:00.000Z' },
      ],
      assinantesAtivos: new Map([['PT', 1], ['BR', 1]]),
      agoraIso: '2020-03-05T12:00:00.000Z',
    });
    expect(r.meses.map((m) => [m.mes, m.novos, m.saidas, m.base, m.novosAssinantes, m.pagantes])).toEqual([
      ['2020-01', 2, 0, 2, 1, 1], ['2020-02', 1, 1, 2, 1, 2], ['2020-03', 0, 0, 2, 0, 0],
    ]);
    const br = r.paises.find((p) => p.pais === 'BR')!;
    const pt = r.paises.find((p) => p.pais === 'PT')!;
    expect(br.meses.map((m) => [m.novos, m.saidas, m.base, m.novosAssinantes])).toEqual([[1, 0, 1, 0], [1, 1, 1, 1], [0, 0, 1, 0]]);
    expect(pt.meses.map((m) => [m.novos, m.base, m.novosAssinantes, m.pagantes])).toEqual([[1, 1, 1, 1], [0, 1, 0, 1], [0, 1, 0, 0]]);
    expect(pt.assinantesAtivos).toBe(1);
    expect(r.assinantesAtivos).toBe(2);
    expect(r.paises.some((p) => p.pais === 'OUTROS')).toBe(false);
    expect(r.assinantesDisponivel).toBe(true);
  });

  it('sem Hub: assinantes indisponíveis, cadastros continuam', () => {
    const r = montarCrescimento({
      contas: [{ id: 'a', criadoEm: '2020-01-10T12:00:00.000Z', pais: 'BR', contaNaBase: true }],
      saidas: [], pagamentos: null, assinantesAtivos: new Map(), agoraIso: '2020-01-20T12:00:00.000Z',
    });
    expect(r.assinantesDisponivel).toBe(false);
    expect(r.meses[0]).toMatchObject({ novos: 1, base: 1, parcial: true });
  });
});

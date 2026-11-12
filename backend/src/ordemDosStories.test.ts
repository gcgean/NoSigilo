import { describe, expect, it } from 'vitest';
import { faixaDeInteresse, ordenarStories } from './ordemDosStories.js';

const AGORA = '2026-11-11T12:00:00.000Z';
const s = (user_id: string, gender: string, state: string, extra: Record<string, unknown> = {}) => ({ user_id, gender, state, is_viewed: 0, is_pinned: 0, is_showcase_autor: 0, destaque_ate: null, ...extra });

describe('faixaDeInteresse', () => {
  it('sem preferência: mulher e casal primeiro, homem por último', () => {
    expect(faixaDeInteresse('Mulher', [])).toBe(0);
    expect(faixaDeInteresse('Casal (Ele/Ela)', [])).toBe(0);
    expect(faixaDeInteresse('Travesti', [])).toBe(1);
    expect(faixaDeInteresse('Homem', [])).toBe(2);
  });
  it('quem busca homem vê homem na frente', () => {
    expect(faixaDeInteresse('Homem', ['Homem', 'Casal (Ele/Ela)'])).toBe(0);
    expect(faixaDeInteresse('Mulher', ['Homem'])).toBe(1);
  });
});

describe('ordenarStories', () => {
  it('mesmo estado primeiro; dentro do estado, mulher/casal antes de homem', () => {
    const fila = [
      s('h-ce', 'Homem', 'CE'),
      s('m-sp', 'Mulher', 'SP'),
      s('c-ce', 'Casal (Ele/Ela)', 'CE'),
      s('h-sp', 'Homem', 'SP'),
      s('m-ce', 'Mulher', 'CE'),
    ];
    const ordem = ordenarStories(fila, { estado: 'ce', busco: [], curti: new Set(), agoraIso: AGORA }).map((r: { user_id: string }) => r.user_id);
    expect(ordem).toEqual(['c-ce', 'm-ce', 'h-ce', 'm-sp', 'h-sp']);
  });

  it('não vistos antes de vistos, fixados e curtidos continuam na frente', () => {
    const fila = [
      s('visto', 'Mulher', 'CE', { is_viewed: 1 }),
      s('homem-curtido', 'Homem', 'SP'),
      s('novo', 'Mulher', 'CE'),
      s('fixado', 'Homem', 'RJ', { is_pinned: 1, is_viewed: 1 }),
    ];
    const ordem = ordenarStories(fila, { estado: 'CE', busco: [], curti: new Set(['homem-curtido']), agoraIso: AGORA }).map((r: { user_id: string }) => r.user_id);
    expect(ordem).toEqual(['fixado', 'homem-curtido', 'novo', 'visto']);
  });
});

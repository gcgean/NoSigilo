import { describe, expect, it } from 'vitest';
import { semanaDoStory, textoIncentivoMulher, textoStoriesNovos } from './avisosDeStories.js';

describe('avisos de stories', () => {
  it('textos', () => {
    expect(textoStoriesNovos(12, 'ce').body).toBe('Tem 12 stories novos de gente de CE. Veja antes que sumam!');
    expect(textoStoriesNovos(1, null).body).toContain('1 story novo de gente perto de você');
    expect(textoIncentivoMulher(170).title).toBe('🔥 Seu story teve 170 visualizações');
  });

  it('semana vira na segunda (horário de Brasília)', () => {
    // Domingo 15/11/2026 23h BRT = segunda 02h UTC: ainda é a semana do domingo.
    const domingoNoite = semanaDoStory(Date.parse('2026-11-16T02:00:00Z'));
    const segunda = semanaDoStory(Date.parse('2026-11-16T04:00:00Z'));
    expect(domingoNoite).toBe(semanaDoStory(Date.parse('2026-11-11T12:00:00Z')));
    expect(segunda).not.toBe(domingoNoite);
  });
});

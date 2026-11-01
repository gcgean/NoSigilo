import { describe, it, expect } from 'vitest';
import { BRINCADEIRAS_DA_SALA, CHAMADAS_PARA_SALA, PERFIL_DA_SALA } from './casaBrincadeiras.js';

describe('brincadeiras próprias de cada sala', () => {
  for (const [sala, pacote] of Object.entries(BRINCADEIRAS_DA_SALA)) {
    it(`${sala}: pacote completo e no formato que a Lola usa`, () => {
      for (const [tema, lista] of Object.entries(pacote)) expect(lista.length, `${sala}.${tema}`).toBeGreaterThan(0);
      for (const it of pacote.euNunca) expect(it.t).toMatch(/^Eu nunca/);
      // {nome} só onde a Lola aponta para alguém (verdade, desafio, foto).
      for (const it of [...pacote.euNunca, ...pacote.perguntas, ...pacote.relampago]) expect(it.t).not.toContain('{nome}');
      for (const it of [...pacote.verdades, ...pacote.desafios, ...pacote.foto]) expect(it.t).toContain('{nome}');
      for (const e of pacote.enquetes) expect(e.o.length).toBeGreaterThanOrEqual(2);
      // Nada de quantidade de pessoas nem contato de fora no texto.
      for (const it of [...pacote.perguntas, ...pacote.desafios]) expect(it.t).not.toMatch(/whats|zap|telegram|pix/i);
      expect(PERFIL_DA_SALA[sala]).toBeTruthy();
      expect(CHAMADAS_PARA_SALA[sala as keyof typeof CHAMADAS_PARA_SALA].length).toBeGreaterThan(0);
    });
  }

  it('cuckold: quem decide é ela e as falas ao marido só saem para casal', () => {
    const { verdades, desafios } = BRINCADEIRAS_DA_SALA.cuckold;
    const aoMarido = [...verdades, ...desafios].filter((it) => /marido:|o marido gosta|ela escolhe/i.test(it.t));
    expect(aoMarido.length).toBeGreaterThan(0);
    for (const it of aoMarido) expect(it.c).toEqual(['casal']);
    expect([...BRINCADEIRAS_DA_SALA.cuckold.perguntas, ...desafios].some((it) => /ela escolhe|quem decide se gostou é ela/i.test(it.t))).toBe(true);
  });
});

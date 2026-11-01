import { describe, it, expect } from 'vitest';
import { BRINCADEIRAS_DA_SALA, CHAMADAS_PARA_SALA, PERFIL_DA_SALA, TEMAS_DE_FESTA, temaAutomatico } from './casaBrincadeiras.js';

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

describe('tema de cada noite', () => {
  it('gira sexta, sábado, sexta… sem repetir antes de passar por todos', () => {
    expect(temaAutomatico('2026-11-06', 'sexta').id).toBe(TEMAS_DE_FESTA[0].id);
    expect(temaAutomatico('2026-11-07', 'sabado').id).toBe(TEMAS_DE_FESTA[1].id);
    expect(temaAutomatico('2026-11-13', 'sexta').id).toBe(TEMAS_DE_FESTA[2].id);
    const datas: string[] = [];
    for (let s = 0; s < TEMAS_DE_FESTA.length / 2; s++) {
      const sexta = new Date(Date.UTC(2026, 10, 6 + 7 * s));
      datas.push(temaAutomatico(sexta.toISOString().slice(0, 10), 'sexta').id);
      datas.push(temaAutomatico(new Date(sexta.getTime() + 86_400_000).toISOString().slice(0, 10), 'sabado').id);
    }
    expect(new Set(datas).size).toBe(TEMAS_DE_FESTA.length);
    // Antes da primeira noite da rotação também funciona (volta na lista).
    expect(TEMAS_DE_FESTA.map((t) => t.id)).toContain(temaAutomatico('2026-10-31', 'sabado').id);
  });

  it('cada tema tem o que a Lola usa', () => {
    expect(new Set(TEMAS_DE_FESTA.map((t) => t.id)).size).toBe(TEMAS_DE_FESTA.length);
    for (const t of TEMAS_DE_FESTA) {
      expect(t.boasVindas.length, t.id).toBeGreaterThan(0);
      for (const it of t.euNunca) expect(it.t).toMatch(/^Eu nunca/);
      for (const it of t.foto) expect(it.t).toContain('{nome}');
      for (const it of t.perguntas) expect(it.t).not.toContain('{nome}');
      expect(t.perfil.length).toBeGreaterThan(20);
    }
  });
});

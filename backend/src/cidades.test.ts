import { describe, expect, it } from 'vitest';
import { candidatosDaCidade } from './cidades.js';

const tem = (cidade: string, uf: string | null, nome: string, ufEsperada: string | null) =>
  candidatosDaCidade(cidade, uf).some((c) => c.nome === nome && c.uf === ufEsperada);

describe('candidatosDaCidade', () => {
  it('mantém a cidade como digitada em primeiro lugar', () => {
    expect(candidatosDaCidade('João Pessoa', 'pb')[0]).toEqual({ nome: 'joao pessoa', uf: 'PB' });
  });

  it('tira a UF colada no fim e usa ela', () => {
    expect(tem('Fortaleza ce', 'CE', 'fortaleza', 'CE')).toBe(true);
    expect(tem('Belém-PA', 'PA', 'belem', 'PA')).toBe(true);
    expect(tem('Natal/RN', '', 'natal', 'RN')).toBe(true);
    // UF digitada vence a do cadastro: "Praia Grande sp" com estado SC.
    expect(tem('Praia Grande sp', 'SC', 'praia grande', 'SP')).toBe(true);
  });

  it('tira o nome do estado colado no fim', () => {
    expect(tem('Fortaleza  Ceará', 'CE', 'fortaleza', 'CE')).toBe(true);
    expect(tem('Sobral Ceará', 'CE', 'sobral', 'CE')).toBe(true);
  });

  it('troca bairro conhecido pela cidade', () => {
    expect(tem('sabiaguaba', 'CE', 'fortaleza', 'CE')).toBe(true);
    expect(tem('Tatuapé', 'SP', 'sao paulo', 'SP')).toBe(true);
  });

  it('regiões do DF viram Brasília', () => {
    expect(tem('Taguatinga', 'DF', 'brasilia', 'DF')).toBe(true);
    expect(tem('Gama df', 'DF', 'brasilia', 'DF')).toBe(true);
  });

  it('não inventa nada para texto vazio', () => {
    expect(candidatosDaCidade('', 'SP')).toEqual([]);
  });
});

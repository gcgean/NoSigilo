import { describe, expect, it } from 'vitest';
import { gruposDoPerfil, listaDosGrupos, resumoDoQueProcuro } from './grupoQueProcuro';

describe('o que procuro em grupos', () => {
  it('lê os grupos do perfil (casal Braga: Casal, Trans e Mulher)', () => {
    const g = gruposDoPerfil(['Casal (Ele/Ela)', 'Transexual', 'Mulher']);
    expect([...g].sort()).toEqual(['casal', 'mulher', 'trans']);
    expect(resumoDoQueProcuro(['Casal (Ele/Ela)', 'Transexual', 'Mulher'])).toBe('Mulheres, Casais e Trans e CD');
  });

  it('desligar Casal e Trans deixa só Mulher', () => {
    expect(listaDosGrupos(new Set(['mulher']), ['Casal (Ele/Ela)', 'Transexual', 'Mulher'])).toEqual(['Mulher']);
    expect(resumoDoQueProcuro(['Mulher'])).toBe('Mulheres');
  });

  it('ligar Casal sem nada antes marca o casal hetero; mantém a escolha antiga', () => {
    expect(listaDosGrupos(new Set(['casal']), [])).toEqual(['Casal (Ele/Ela)']);
    expect(listaDosGrupos(new Set(['casal']), ['Casal (Ela/Ela)'])).toEqual(['Casal (Ela/Ela)']);
  });

  it('nada ou tudo = todos os perfis', () => {
    expect(resumoDoQueProcuro([])).toBe('Todos os perfis');
    expect(resumoDoQueProcuro(['Mulher', 'Homem', 'Casal (Ele/Ela)', 'Transexual'])).toBe('Todos os perfis');
  });
});

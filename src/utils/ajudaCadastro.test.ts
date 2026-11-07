import { describe, expect, it } from 'vitest';
import { apelidoSugerido, sugestaoDeEmail } from './ajudaCadastro';

describe('correção do e-mail', () => {
  it('corrige os erros comuns de digitação', () => {
    expect(sugestaoDeEmail('ana@gmial.com')).toBe('ana@gmail.com');
    expect(sugestaoDeEmail('ana@gmail.con')).toBe('ana@gmail.com');
    expect(sugestaoDeEmail('Ana@Hotmal.com')).toBe('ana@hotmail.com');
    expect(sugestaoDeEmail('ana@outlok.com')).toBe('ana@outlook.com');
    expect(sugestaoDeEmail(' ana@yahoo.com.b ')).toBe('ana@yahoo.com.br');
  });
  it('não mexe em e-mail certo, incompleto ou de domínio próprio', () => {
    for (const email of ['ana@gmail.com', 'ana@yahoo.com.br', 'ana', 'ana@', '@gmail.com', 'ana@minhaempresa.com.br', 'ana@nosigilo.net']) {
      expect(sugestaoDeEmail(email)).toBeNull();
    }
  });
});

describe('apelido sugerido', () => {
  it('combina com o perfil e não tem espaço', () => {
    expect(apelidoSugerido('Casal (Ele/Ela)', () => 0)).toBe('CasalDiscreto100');
    expect(apelidoSugerido('Mulher', () => 0)).toBe('Misteriosa100');
    expect(apelidoSugerido('Homem', () => 0)).toBe('Discreto100');
    expect(apelidoSugerido('Travesti', () => 0)).toBe('Liberal100');
    expect(apelidoSugerido('Homem', () => 0.999)).toMatch(/^[A-Za-z]+\d{3,4}$/);
  });
});

import { describe, expect, it } from 'vitest';
import { sugestaoDeEmail } from './ajudaCadastro';

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

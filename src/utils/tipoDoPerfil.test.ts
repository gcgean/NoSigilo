import { describe, expect, it } from 'vitest';
import { inicialDoNome, tipoDoPerfil } from './tipoDoPerfil';

describe('silhueta do tipo de perfil', () => {
  it('cada tipo tem a sua forma', () => {
    expect(tipoDoPerfil('Casal (Ele/Ela)')?.forma).toBe('fm');
    expect(tipoDoPerfil('Casal (Ela/Ela)')?.forma).toBe('ff');
    expect(tipoDoPerfil('Casal (Ele/Ele)')?.forma).toBe('mm');
    expect(tipoDoPerfil('Mulher')?.forma).toBe('f');
    expect(tipoDoPerfil('Homem')?.forma).toBe('m');
    expect(tipoDoPerfil('Crossdresser (CD)')?.forma).toBe('f');
    expect(tipoDoPerfil('')).toBeNull();
  });
  it('sem tipo conhecido, usa a inicial do nome', () => {
    expect(inicialDoNome('ana')).toBe('A');
    expect(inicialDoNome('')).toBe('U');
  });
});

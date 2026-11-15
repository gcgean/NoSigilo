import { describe, expect, it } from 'vitest';
import { soCumprimento } from './supportAi.js';

describe('suporte: cumprimento não conta como assunto', () => {
  it('reconhece só cumprimentos', () => {
    for (const t of ['Oii', 'oi', 'Olá 😊', 'Boa noite!', 'oi, tudo bem?', 'Oie gente', 'bom dia lola', '  ', '😊']) {
      expect(soCumprimento(t), t).toBe(true);
    }
  });
  it('qualquer assunto já é contexto', () => {
    for (const t of ['Oi, não consigo pagar', 'boa noite, meu pix não caiu', 'Gostaria de alterar o nome', 'as mensagens somem']) {
      expect(soCumprimento(t), t).toBe(false);
    }
  });
});

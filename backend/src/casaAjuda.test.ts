import { describe, expect, it } from 'vitest';
import { ehCobrancaDeNude, respostaDeAjuda } from './casaAjuda.js';

// Frases tiradas dos chats d'A Casa de 20 e 21/11/2026.
describe('ajuda da Lola para quem está perdido (27/11/2026)', () => {
  it('responde a quem diz que está perdido ou não entendeu', () => {
    for (const t of [
      'Perdido não entendi ainda rs', 'Primeira vez aqui , estamos perdidos', 'Tô mas perdido q cego kk',
      'Boa noite a todos. Nao entendi como funciona kkkk', 'Primeira vez aqui não sei vomo funciona',
      'Nunca participei estou igual cego em tiroteio', 'Estou perdida aqui kkkk', 'Primeira vez aqui, como funciona esse trem heim rs',
      'To perdido sem saber responder ou interagir', 'Olhar amor , ainda estou aprendendo a mexer no app',
    ]) expect(respostaDeAjuda(t), t).toBeTruthy();
  });

  it('explica cabine, quem convida e pulseira com a resposta certa', () => {
    expect(respostaDeAjuda('O que e essa cabine ??')).toContain('Cabine é um cantinho');
    expect(respostaDeAjuda('Mas quem convida casal no caso?')).toContain('Qualquer um pode chamar');
    expect(respostaDeAjuda('Erramos a pulseira')).toContain('pulseira');
    expect(respostaDeAjuda('Como faço pra ver?')).toContain('abrir');
  });

  it('não se mete em conversa normal', () => {
    for (const t of ['Boa noite 🔥', 'Alguém de Fortaleza?', 'Que delícia', 'Somos de minas Congonhas iniciante', 'Gostei das músicas 🥰😍']) {
      expect(respostaDeAjuda(t), t).toBeNull();
    }
  });
});

describe('cobrança de foto/nude na sala (27/11/2026)', () => {
  it('pega quem cobra foto das mulheres e dos casais', () => {
    for (const t of [
      'Manda a foto da buceta fudida', 'Mandes fotos as casadinhas pra movimentar, estão muito vergonhosas',
      '@Casal novo mostra ela pra nós hehe', '@Casal_90 bota a bctinha pra jogo haha', 'Linda, quero ver pelada',
      'Tem que começar mandar foto da bucetinha pra animar', '@Vinicius Santos deliciosa ela, manda foto da xotinha',
    ]) expect(ehCobrancaDeNude(t), t).toBe(true);
  });

  it('não pega elogio, conversa ou quem conta que mandou', () => {
    for (const t of ['Que buceta linda', 'Parabéns pelo conteúdo', 'Eu mandei foto e ninguém viu', 'Boa noite casal', '@CASALSLZ098 a foto veio branca', 'Chama no meu perfil']) {
      expect(ehCobrancaDeNude(t), t).toBe(false);
    }
  });
});

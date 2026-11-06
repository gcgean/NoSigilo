import { describe, expect, it } from 'vitest';
import { separarLinks } from './linksDoSuporte';

describe('links no chat de suporte', () => {
  it('transforma o endereço da página de instalar em link, sem levar a pontuação', () => {
    expect(separarLinks('Assista aqui: https://nosigilo.net/instalar. Qualquer dúvida, me chame.')).toEqual([
      { texto: 'Assista aqui: ' },
      { texto: 'https://nosigilo.net/instalar', href: 'https://nosigilo.net/instalar' },
      { texto: '. Qualquer dúvida, me chame.' },
    ]);
  });

  it('aceita o endereço sem https e o domínio sozinho', () => {
    expect(separarLinks('veja nosigilo.net/instalar')[1]).toEqual({ texto: 'nosigilo.net/instalar', href: 'https://nosigilo.net/instalar' });
    expect(separarLinks('abra nosigilo.net no Safari')[1]).toEqual({ texto: 'nosigilo.net', href: 'https://nosigilo.net' });
  });

  it('não cria link para outros sites nem para e-mail', () => {
    for (const texto of ['entre em https://golpe.com/nosigilo.net', 'https://nosigilo.net.golpe.com/x', 'escreva para contato@nosigilo.net', 'falsonosigilo.net']) {
      expect(separarLinks(texto).filter((parte) => parte.href)).toEqual([]);
    }
  });

  it('texto sem link fica como está', () => {
    expect(separarLinks('oi, tudo bem?')).toEqual([{ texto: 'oi, tudo bem?' }]);
    expect(separarLinks('')).toEqual([]);
  });
});

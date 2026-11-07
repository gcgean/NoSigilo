import { beforeEach, describe, expect, it } from 'vitest';
import { capturaPrimeiroToque, lePrimeiroToque } from './primeiroToque';

const ir = (caminho: string) => window.history.replaceState({}, '', caminho);

describe('origem do primeiro toque', () => {
  beforeEach(() => { localStorage.clear(); ir('/'); });

  it('a página do Instagram marca a campanha', () => {
    ir('/vem');
    capturaPrimeiroToque();
    expect(lePrimeiroToque()).toMatchObject({ utmSource: 'instagram', utmCampaign: 'instagram-vem' });
    ir('/vem/?fbclid=abc');
    localStorage.clear();
    capturaPrimeiroToque();
    expect(lePrimeiroToque()?.utmCampaign).toBe('instagram-vem');
  });

  it('a página do Instagram vale mesmo para quem já tinha outra origem guardada', () => {
    ir('/?utm_source=google');
    capturaPrimeiroToque();
    expect(lePrimeiroToque()?.utmSource).toBe('google');
    ir('/vem');
    capturaPrimeiroToque();
    expect(lePrimeiroToque()?.utmCampaign).toBe('instagram-vem');
    // Depois disso, navegar por outras páginas não apaga a marca.
    ir('/register?profile=Homem');
    capturaPrimeiroToque();
    expect(lePrimeiroToque()?.utmCampaign).toBe('instagram-vem');
  });

  it('as outras páginas continuam sem sobrescrever a primeira origem', () => {
    ir('/?utm_source=google');
    capturaPrimeiroToque();
    ir('/?utm_source=tiktok');
    capturaPrimeiroToque();
    expect(lePrimeiroToque()?.utmSource).toBe('google');
  });
});

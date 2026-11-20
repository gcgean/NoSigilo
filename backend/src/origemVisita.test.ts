import { describe, expect, it } from 'vitest';
import { appPeloUserAgent, redeSocialDaVisita, rotuloDaRede } from './origemVisita.js';

const UA_FB = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/450.0.0.0;]';
const UA_IG = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0.0 (iPhone14,5)';

describe('redes sociais das visitas', () => {
  it('reconhece o app pelo User-Agent', () => {
    expect(appPeloUserAgent(UA_FB)).toBe('facebook');
    expect(appPeloUserAgent(UA_IG)).toBe('instagram');
    expect(appPeloUserAgent('Mozilla/5.0 Chrome/120')).toBeNull();
  });

  it('Facebook por UTM, por domínio e pelo app sem referência', () => {
    expect(redeSocialDaVisita({ utmSource: 'facebook' })?.rede).toBe('Facebook');
    expect(redeSocialDaVisita({ utmSource: 'fb' })?.rede).toBe('Facebook');
    expect(redeSocialDaVisita({ dominio: 'm.facebook.com' })?.rede).toBe('Facebook');
    expect(redeSocialDaVisita({ dominio: 'l.facebook.com' })?.rede).toBe('Facebook');
    expect(redeSocialDaVisita({ dominio: 'lm.facebook.com' })?.rede).toBe('Facebook');
    expect(redeSocialDaVisita({ userAgent: UA_FB })?.rede).toBe('Facebook');
  });

  it('utm_source=ig é Instagram (antes caía em "referral")', () => {
    expect(redeSocialDaVisita({ utmSource: 'ig', dominio: 'l.instagram.com' })?.rede).toBe('Instagram');
    expect(redeSocialDaVisita({ dominio: 'l.instagram.com' })?.rede).toBe('Instagram');
  });

  it('separa anúncio de postagem pelo utm_medium', () => {
    const anuncio = redeSocialDaVisita({ utmSource: 'facebook', utmMedium: 'cpc' })!;
    expect(rotuloDaRede(anuncio)).toBe('Facebook (anúncio)');
    expect(rotuloDaRede(redeSocialDaVisita({ utmSource: 'facebook', utmMedium: 'paid_social' })!)).toBe('Facebook (anúncio)');
    expect(rotuloDaRede(redeSocialDaVisita({ utmSource: 'facebook', utmMedium: 'social' })!)).toBe('Facebook');
  });

  it('não confunde com busca, site próprio ou palavras que contêm "fb"/"ig"', () => {
    expect(redeSocialDaVisita({ dominio: 'google.com' })).toBeNull();
    expect(redeSocialDaVisita({ utmSource: 'google', userAgent: UA_FB })).toBeNull();
    expect(redeSocialDaVisita({ dominio: 'nosigilo.net' })).toBeNull();
    expect(redeSocialDaVisita({ utmSource: 'bigdeals' })).toBeNull();
    expect(redeSocialDaVisita({})).toBeNull();
  });
});

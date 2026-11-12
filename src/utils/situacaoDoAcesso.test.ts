import { describe, expect, it } from 'vitest';
import { situacaoDoAcesso } from './situacaoDoAcesso';

const AGORA = new Date('2026-11-11T12:00:00Z').getTime();

describe('situacaoDoAcesso', () => {
  it('assinatura vencida + dias grátis valendo: grátis até a data, avisando o vencimento', () => {
    const s = situacaoDoAcesso({ isPremium: false, hubLicenseEndAt: '2026-11-10T09:33:35Z', trialEndsAt: '2026-11-20T14:33:41Z' }, AGORA)!;
    expect(s.tipo).toBe('gratis');
    expect(s.ate?.toISOString()).toBe('2026-11-20T14:33:41.000Z');
    expect(s.dias).toBe(10);
    expect(s.assinaturaVencidaEm?.toISOString()).toBe('2026-11-10T09:33:35.000Z');
  });

  it('assinatura em dia vale mais que os dias grátis', () => {
    const s = situacaoDoAcesso({ isPremium: true, hubLicenseEndAt: '2026-12-10T00:00:00Z', trialEndsAt: '2026-11-20T00:00:00Z' }, AGORA)!;
    expect(s.tipo).toBe('pago');
    expect(s.assinaturaVencidaEm).toBeNull();
  });

  it('tudo vencido', () => {
    const s = situacaoDoAcesso({ hubLicenseEndAt: '2026-11-01T00:00:00Z', trialEndsAt: '2026-10-01T00:00:00Z' }, AGORA)!;
    expect(s.tipo).toBe('vencido');
    expect(s.dias).toBe(0);
  });

  it('acesso sem prazo (2099) e conta sem nada: não mostra quadro', () => {
    expect(situacaoDoAcesso({ trialEndsAt: '2099-01-01T00:00:00Z' }, AGORA)).toBeNull();
    expect(situacaoDoAcesso({}, AGORA)).toBeNull();
  });
});

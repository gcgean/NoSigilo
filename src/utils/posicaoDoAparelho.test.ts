import { describe, expect, it, vi } from 'vitest';
import { mensagemDeFalhaDoGps, pegarPosicaoDoAparelho } from './posicaoDoAparelho';

const posicao = { coords: { latitude: -5.18, longitude: -37.34 } } as GeolocationPosition;

describe('GPS do aparelho (28/11/2026)', () => {
  it('se a alta precisão demora, tenta de novo pela rede e aceita posição recente', async () => {
    const pegar = vi.fn()
      .mockImplementationOnce((_ok, erro) => erro({ code: 3 }))
      .mockImplementationOnce((ok) => ok(posicao));
    await expect(pegarPosicaoDoAparelho(pegar)).resolves.toBe(posicao);
    expect(pegar).toHaveBeenCalledTimes(2);
    expect(pegar.mock.calls[1][2]).toMatchObject({ enableHighAccuracy: false });
    expect(pegar.mock.calls[1][2].maximumAge).toBeGreaterThan(0);
  });

  it('sem sinal também tenta de novo', async () => {
    const pegar = vi.fn()
      .mockImplementationOnce((_ok, erro) => erro({ code: 2 }))
      .mockImplementationOnce((ok) => ok(posicao));
    await expect(pegarPosicaoDoAparelho(pegar)).resolves.toBe(posicao);
  });

  it('bloqueado não tenta de novo', async () => {
    const pegar = vi.fn((_ok, erro) => erro({ code: 1 }));
    await expect(pegarPosicaoDoAparelho(pegar)).rejects.toMatchObject({ code: 1 });
    expect(pegar).toHaveBeenCalledTimes(1);
  });

  it('sem GPS no navegador avisa que é indisponível', async () => {
    await expect(pegarPosicaoDoAparelho(undefined)).rejects.toMatchObject({ code: -1 });
  });

  it('só pede para permitir quando a permissão foi mesmo negada', () => {
    expect(mensagemDeFalhaDoGps({ code: 1 }).description).toContain('Permitir');
    for (const erro of [{ code: 2 }, { code: 3 }, new Error('Network Error')]) {
      expect(mensagemDeFalhaDoGps(erro).description).not.toContain('Permit');
    }
    expect(mensagemDeFalhaDoGps({ code: 2 }).title).toContain('desligado');
    expect(mensagemDeFalhaDoGps(new Error('x')).title).toContain('salvar');
  });
});

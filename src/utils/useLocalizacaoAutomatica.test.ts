import { describe, expect, it } from 'vitest';
import { distanciaKm, precisaEnviar } from './useLocalizacaoAutomatica';

const TABOAO = { lat: -23.6, lon: -46.79 };
const SANTO_AMARO = { lat: -23.65, lon: -46.71 };
const AGORA = Date.parse('2026-11-12T12:00:00Z');

describe('localização automática', () => {
  it('Taboão → Santo Amaro passa de 1 km e é enviada', () => {
    expect(distanciaKm(TABOAO, SANTO_AMARO)).toBeGreaterThan(5);
    expect(precisaEnviar({ tentativa: 0, enviado: AGORA - 60_000, lat: TABOAO.lat, lon: TABOAO.lon }, SANTO_AMARO.lat, SANTO_AMARO.lon, AGORA)).toBe(true);
  });

  it('parado no mesmo lugar não reenvia antes de 6 h', () => {
    const g = { tentativa: 0, enviado: AGORA - 60 * 60_000, lat: TABOAO.lat, lon: TABOAO.lon };
    expect(precisaEnviar(g, TABOAO.lat + 0.001, TABOAO.lon, AGORA)).toBe(false);
    expect(precisaEnviar({ ...g, enviado: AGORA - 7 * 60 * 60_000 }, TABOAO.lat, TABOAO.lon, AGORA)).toBe(true);
  });

  it('primeira vez sempre envia', () => {
    expect(precisaEnviar({ tentativa: 0, enviado: 0, lat: null, lon: null }, TABOAO.lat, TABOAO.lon, AGORA)).toBe(true);
  });
});

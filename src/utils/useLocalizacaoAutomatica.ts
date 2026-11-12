import { useEffect } from 'react';
import { locationService } from '@/services/api';

// Atualiza a localização sozinho para quem JÁ autorizou o GPS (12/11/2026).
// Antes ela só mudava ao tocar em "Ativar localização": um casal ativou em
// Taboão da Serra e, dias depois em Santo Amaro, o app ainda dizia Taboão.
// Nunca pede permissão (só roda com a permissão já "granted"), no máximo uma
// tentativa a cada 30 min, e só envia se mudou mais de 1 km ou faz 6 h.

const CHAVE = 'nosigilo:localizacao-auto';
const INTERVALO_MS = 30 * 60 * 1000;
const REENVIO_MS = 6 * 60 * 60 * 1000;
const MUDOU_KM = 1;

type Guardado = { tentativa: number; enviado: number; lat: number | null; lon: number | null };

function ler(): Guardado {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) || '{}');
    return { tentativa: Number(v.tentativa) || 0, enviado: Number(v.enviado) || 0, lat: v.lat ?? null, lon: v.lon ?? null };
  } catch {
    return { tentativa: 0, enviado: 0, lat: null, lon: null };
  }
}

function guardar(g: Guardado) {
  try { localStorage.setItem(CHAVE, JSON.stringify(g)); } catch { /* sem storage: tenta de novo na próxima */ }
}

export function distanciaKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = (x: number) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLon = r(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Decide se a posição nova vale um envio ao servidor. */
export function precisaEnviar(g: Guardado, lat: number, lon: number, agora: number) {
  if (g.lat == null || g.lon == null) return true;
  if (agora - g.enviado >= REENVIO_MS) return true;
  return distanciaKm({ lat: g.lat, lon: g.lon }, { lat, lon }) >= MUDOU_KM;
}

export function useLocalizacaoAutomatica(
  logado: boolean,
  aoAtualizar?: (r: { city: string | null; state: string | null }) => void,
) {
  useEffect(() => {
    if (!logado || typeof navigator === 'undefined' || !navigator.geolocation || !navigator.permissions?.query) return;
    let cancelado = false;

    const tentar = async () => {
      if (cancelado || document.visibilityState !== 'visible') return;
      const g = ler();
      const agora = Date.now();
      if (agora - g.tentativa < INTERVALO_MS) return;
      try {
        const permissao = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        if (permissao.state !== 'granted') return;
        guardar({ ...g, tentativa: agora });
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 }));
        if (cancelado) return;
        const { latitude: lat, longitude: lon } = pos.coords;
        if (!precisaEnviar(g, lat, lon, agora)) return;
        const r = await locationService.updateLocation(lat, lon);
        guardar({ tentativa: agora, enviado: Date.now(), lat, lon });
        aoAtualizar?.({ city: r?.city ?? null, state: r?.state ?? null });
      } catch {
        /* sem GPS agora: tenta de novo daqui a 30 min */
      }
    };

    void tentar();
    const relogio = window.setInterval(() => void tentar(), INTERVALO_MS);
    const aoVoltar = () => { if (document.visibilityState === 'visible') void tentar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      cancelado = true;
      window.clearInterval(relogio);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [logado, aoAtualizar]);
}

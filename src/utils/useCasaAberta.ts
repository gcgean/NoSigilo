import { useEffect, useState } from 'react';
import apiClient from '@/utils/apiClient';

/**
 * Situação d'A Casa para trocar atalhos e avisos na tela (rota pública: o modo
 * teste do admin não conta). Consulta a cada minuto.
 * - aberta: a noite está rolando agora;
 * - proxima: quando abre a próxima noite (ms), se estiver fechada.
 */
export function useCasaStatus() {
  const [status, setStatus] = useState<{ aberta: boolean; proxima: number | null }>({ aberta: false, proxima: null });
  useEffect(() => {
    let vivo = true;
    const carregar = () => {
      apiClient.get('/casa/publico')
        .then((r) => {
          if (!vivo) return;
          const proxima = r.data?.proximaAbertura ? Date.parse(String(r.data.proximaAbertura)) : NaN;
          setStatus({ aberta: !!r.data?.aberta, proxima: Number.isFinite(proxima) ? proxima : null });
        })
        .catch(() => {});
    };
    carregar();
    const t = setInterval(carregar, 60_000);
    return () => { vivo = false; clearInterval(t); };
  }, []);
  return status;
}

export function useCasaAberta() {
  return useCasaStatus().aberta;
}

import { useEffect, useState } from 'react';
import apiClient from '@/utils/apiClient';

/**
 * A Casa está aberta de verdade agora? (rota pública: o modo teste do admin não
 * conta). Consulta a cada minuto; serve para trocar atalhos e avisos na tela.
 */
export function useCasaAberta() {
  const [aberta, setAberta] = useState(false);
  useEffect(() => {
    let vivo = true;
    const carregar = () => {
      apiClient.get('/casa/publico')
        .then((r) => { if (vivo) setAberta(!!r.data?.aberta); })
        .catch(() => {});
    };
    carregar();
    const t = setInterval(carregar, 60_000);
    return () => { vivo = false; clearInterval(t); };
  }, []);
  return aberta;
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '@/utils/apiClient';

/** Faixa no topo do feed enquanto A Casa está aberta (sex/sáb 21h–1h). */
export default function CasaAbertaBanner() {
  const navigate = useNavigate();
  const [info, setInfo] = useState<{ aberta: boolean; tema: { nome: string } | null; total: number } | null>(null);
  useEffect(() => {
    let vivo = true;
    const carregar = async () => {
      try {
        const { data } = await apiClient.get('/casa');
        const total = (data?.salas ?? []).reduce((s: number, x: any) => s + Number(x.total || 0) + Number(x.espiando || 0), 0);
        if (vivo) setInfo({ aberta: !!data?.aberta, tema: data?.tema ?? null, total });
      } catch { /* sem faixa */ }
    };
    void carregar();
    const t = setInterval(carregar, 60_000);
    return () => { vivo = false; clearInterval(t); };
  }, []);
  if (!info?.aberta) return null;
  return (
    <button
      type="button"
      onClick={() => navigate('/casa')}
      className="mb-3 flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-zinc-950 via-fuchsia-900 to-rose-700 px-4 py-3 text-left text-white shadow-lg active:scale-[0.99]"
    >
      <span className="text-2xl">🔥</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">A Casa está aberta{info.tema ? `: ${info.tema.nome}` : ''}</span>
        <span className="block text-xs text-white/80">{info.total > 0 ? `${info.total} pessoa(s) lá dentro agora` : 'Seja o primeiro a chegar'} · brincadeiras quentes até 1h</span>
      </span>
      <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">Entrar</span>
    </button>
  );
}

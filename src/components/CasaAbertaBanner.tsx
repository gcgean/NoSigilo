import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import apiClient from '@/utils/apiClient';

/**
 * Aviso em todas as telas enquanto A Casa está aberta de verdade (sex/sáb 22h–1h
 * ou noite extra). Usa a rota pública, que esconde o modo teste do admin, e é
 * leve para consultar a cada minuto. Fechar o aviso vale só para aquela noite.
 */
const CHAVE_FECHADO = 'nosigilo:casa-aviso-fechado';

export default function CasaAbertaBanner() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [info, setInfo] = useState<{ aberta: boolean; tema: { nome: string } | null; pessoas: number } | null>(null);
  const [fechadoEm, setFechadoEm] = useState<string | null>(() => {
    try { return sessionStorage.getItem(CHAVE_FECHADO); } catch { return null; }
  });

  useEffect(() => {
    let vivo = true;
    const carregar = async () => {
      try {
        const { data } = await apiClient.get('/casa/publico');
        if (vivo) setInfo({ aberta: !!data?.aberta, tema: data?.tema ?? null, pessoas: Number(data?.pessoas || 0) });
      } catch { /* sem aviso */ }
    };
    void carregar();
    const t = setInterval(carregar, 60_000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  // A noite vai das 22h à 1h: a data "da noite" é a de 3h atrás.
  const noite = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  if (!info?.aberta || pathname.startsWith('/casa') || fechadoEm === noite) return null;

  const fechar = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFechadoEm(noite);
    try { sessionStorage.setItem(CHAVE_FECHADO, noite); } catch { /* modo restrito */ }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate('/casa')}
      onKeyDown={(e) => { if (e.key === 'Enter') navigate('/casa'); }}
      className="relative mb-3 flex w-full cursor-pointer items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-zinc-950 via-fuchsia-900 to-rose-700 px-4 py-3 text-left text-white shadow-lg ring-2 ring-rose-500/60 active:scale-[0.99]"
    >
      <span className="pointer-events-none absolute inset-0 animate-pulse bg-rose-500/10" />
      <span className="relative text-2xl">🔥</span>
      <span className="relative min-w-0 flex-1">
        <span className="block text-sm font-bold">A Casa está aberta agora{info.tema ? `: ${info.tema.nome}` : ''}</span>
        <span className="block text-xs text-white/80">{info.pessoas > 0 ? 'Várias pessoas lá dentro' : 'A festa está começando'} · brincadeiras quentes até 1h</span>
      </span>
      <span className="relative rounded-full bg-white px-3 py-1 text-xs font-bold text-rose-700">Entrar</span>
      <button type="button" onClick={fechar} className="relative rounded-full p-1 text-white/70 hover:bg-white/10" aria-label="Fechar aviso">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import apiClient from '@/utils/apiClient';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

/**
 * Quem entra na plataforma enquanto A Casa está aberta de verdade recebe, uma
 * vez por noite, o convite "A Casa está ao vivo agora: quer entrar?".
 * Usa a rota pública (o modo teste do admin não dispara o convite).
 */
const CHAVE = 'nosigilo:casa-ao-vivo-convite';

export default function CasaAoVivoConvite() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [aberto, setAberto] = useState(false);
  const [info, setInfo] = useState<{ tema: string | null; pessoas: number } | null>(null);

  useEffect(() => {
    if (pathname.startsWith('/casa') || pathname.startsWith('/admin')) return;
    // A noite vai das 21h à 1h: a "data da noite" é a de 3h atrás.
    const noite = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
    try { if (localStorage.getItem(CHAVE) === noite) return; } catch { /* sem storage: segue */ }
    const t = setTimeout(async () => {
      try {
        const { data } = await apiClient.get('/casa/publico');
        if (!data?.aberta) return;
        setInfo({ tema: data?.tema?.nome ?? null, pessoas: Number(data?.pessoas || 0) });
        setAberto(true);
        try { localStorage.setItem(CHAVE, noite); } catch { /* ok */ }
      } catch { /* sem convite */ }
    }, 2500);
    return () => clearTimeout(t);
    // Só no primeiro carregamento da noite.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogContent className="max-w-sm overflow-hidden border-rose-500/50 bg-gradient-to-br from-zinc-950 via-fuchsia-950 to-rose-900 p-0 text-white">
        <div className="space-y-3 p-6 text-center">
          <p className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.25em] text-rose-200">
            <span className="relative flex h-2.5 w-2.5"><span className="absolute inset-0 animate-ping rounded-full bg-rose-400" /><span className="relative h-2.5 w-2.5 rounded-full bg-rose-500" /></span>
            Ao vivo agora
          </p>
          <DialogTitle className="text-3xl font-black">A Casa está aberta 🔥</DialogTitle>
          <p className="text-sm text-white/85">
            {info?.tema ? `${info.tema}: ` : ''}salas ao vivo com casais, mulheres e singles, a Lola puxando as brincadeiras e cabines a dois até 1h.
          </p>
          {info && info.pessoas > 0 && <p className="text-sm font-semibold text-rose-200">Várias pessoas lá dentro agora 👀</p>}
          <Button size="lg" className="w-full bg-gradient-to-r from-rose-600 to-fuchsia-600 text-lg font-bold" onClick={() => { setAberto(false); navigate('/casa'); }}>
            🔥 Entrar na Casa agora
          </Button>
          <Button variant="ghost" className="w-full text-white/60 hover:bg-white/10 hover:text-white" onClick={() => setAberto(false)}>
            Agora não
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

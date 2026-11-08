import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import apiClient from '@/utils/apiClient';

/**
 * A Casa abriu e a pessoa reservou: um chamado em destaque, uma vez por noite, em
 * qualquer tela do app. Em 07/11/2026, 52 pessoas que reservaram abriram o app
 * durante a noite e não entraram n'A Casa.
 */
export default function ChamadaDaReserva({ casaAberta, pathname }: { casaAberta: boolean; pathname: string }) {
  const navigate = useNavigate();
  const [chamado, setChamado] = useState<{ noite: string; pessoas: number } | null>(null);
  const naCasa = pathname.startsWith('/casa');

  useEffect(() => {
    if (!casaAberta || naCasa) { setChamado(null); return; }
    let vivo = true;
    apiClient.get('/casa/minha-reserva')
      .then(({ data }) => {
        if (!vivo || !data?.aberta || !data.reservado || data.naCasa) return;
        let visto = false;
        try { visto = localStorage.getItem('nosigilo:chamada-reserva') === String(data.noite); } catch { /* sem armazenamento */ }
        if (!visto) setChamado({ noite: String(data.noite), pessoas: Number(data.pessoas || 0) });
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [casaAberta, naCasa]);

  if (!chamado) return null;
  const fechar = () => {
    try { localStorage.setItem('nosigilo:chamada-reserva', chamado.noite); } catch { /* sem armazenamento */ }
    setChamado(null);
  };

  return (
    <div className="fixed inset-x-3 bottom-24 z-[60] mx-auto max-w-md rounded-2xl border border-rose-500/40 bg-gradient-to-br from-rose-950 via-neutral-950 to-fuchsia-950 p-4 text-white shadow-[0_0_30px_rgba(225,29,72,0.45)] md:bottom-6" role="dialog" aria-label="A Casa abriu">
      <p className="text-base font-bold">🔥 A Casa abriu e seu lugar está guardado!</p>
      <p className="mt-1 text-sm text-white/75">
        {chamado.pessoas >= 5 ? `Já tem ${chamado.pessoas} pessoas lá dentro. ` : 'A Lola já está puxando as brincadeiras. '}
        Você reservou: é só entrar.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="ghost" className="text-white/70 hover:bg-white/10 hover:text-white" onClick={fechar}>Agora não</Button>
        <Button className="bg-gradient-to-r from-rose-600 to-fuchsia-600 font-bold" onClick={() => { fechar(); navigate('/casa'); }}>Entrar agora</Button>
      </div>
    </div>
  );
}

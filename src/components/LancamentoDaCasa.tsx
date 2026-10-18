import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import apiClient from '@/utils/apiClient';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

/**
 * Campanha de inauguração d'A Casa (até sexta, 23/10/2026, 21h).
 * Aparece uma vez por dia, só para quem ainda não reservou lugar nem está na fila.
 */
const FIM_DA_CAMPANHA = Date.parse('2026-10-24T00:00:00Z'); // sexta 23/10, 21h em Brasília
const CHAVE = 'nosigilo:casa-lancamento-visto';

export default function LancamentoDaCasa() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { toast } = useToast();
  const [aberto, setAberto] = useState(false);
  const [reservas, setReservas] = useState(0);

  useEffect(() => {
    if (Date.now() >= FIM_DA_CAMPANHA || pathname.startsWith('/casa')) return;
    const hoje = new Date().toLocaleDateString('pt-BR');
    try { if (localStorage.getItem(CHAVE) === hoje) return; } catch { /* sem storage: mostra */ }
    const t = setTimeout(async () => {
      try {
        const { data } = await apiClient.get('/casa');
        const naFila = (data?.salas ?? []).some((s: any) => s.posicaoNaFila);
        if (data?.reservado || naFila || data?.aberta) return;
        setReservas(Number(data?.reservas || 0));
        setAberto(true);
        try { localStorage.setItem(CHAVE, hoje); } catch { /* ok */ }
      } catch { /* sem aviso */ }
    }, 4000); // deixa a tela carregar antes
    return () => clearTimeout(t);
    // Só na primeira tela do dia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reservar = async () => {
    setAberto(false);
    try {
      await apiClient.post('/casa/reservar', { reservar: true });
      toast({ title: '🎟️ Lugar reservado para a inauguração!', description: 'Sexta, 23/10, às 21h a gente avisa no seu celular.' });
    } catch {
      toast({ title: 'Não foi possível reservar agora.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogContent className="max-w-sm overflow-hidden border-fuchsia-500/40 bg-gradient-to-br from-zinc-950 via-fuchsia-950 to-rose-900 p-0 text-white">
        <div className="space-y-3 p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-fuchsia-200">Inauguração · sexta 23/10 · 21h</p>
          <h2 className="text-3xl font-black">A Casa 🔥</h2>
          <p className="text-sm text-white/85">
            A casa de swing virtual do NoSigilo abre nesta sexta! Salas ao vivo com casais, mulheres e singles,
            pulseiras, bar, desafios quentes com a Lola, cabine a dois (de porta aberta, se quiserem 👀) e Glory Hole.
          </p>
          <ul className="space-y-1 text-left text-xs text-white/75">
            <li>🎟️ Reserve e seja avisado no celular assim que abrir</li>
            <li>🎁 +5 tokens só por entrar na noite</li>
            <li>🏆 Ranking dos casais desde a primeira noite</li>
          </ul>
          {reservas > 0 && <p className="text-xs text-fuchsia-200">{reservas} pessoa(s) já reservaram lugar</p>}
          <Button size="lg" className="w-full bg-gradient-to-r from-rose-600 to-fuchsia-600 font-bold" onClick={() => void reservar()}>
            🎟️ Reservar meu lugar
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1 text-white/70 hover:bg-white/10 hover:text-white" onClick={() => { setAberto(false); navigate('/casa'); }}>
              Como funciona
            </Button>
            <Button variant="ghost" className="flex-1 text-white/50 hover:bg-white/10 hover:text-white" onClick={() => setAberto(false)}>
              Agora não
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

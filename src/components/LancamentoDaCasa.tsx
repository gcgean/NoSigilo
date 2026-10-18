import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import apiClient from '@/utils/apiClient';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { enablePushNotifications } from '@/utils/pushNotifications';

/**
 * Convite para reservar lugar n'A Casa.
 * - Até a inauguração (sexta, 23/10/2026, 21h): uma vez por dia para todos que
 *   ainda não reservaram nem estão na fila (campanha de lançamento).
 * - Depois: só para contas novas (até 7 dias), uma única vez, chamando para a
 *   próxima noite — todo cadastro novo já conhece A Casa logo no começo.
 */
const FIM_DA_CAMPANHA = Date.parse('2026-10-24T00:00:00Z'); // sexta 23/10, 21h em Brasília
const CHAVE = 'nosigilo:casa-lancamento-visto';
const CHAVE_CONTA_NOVA = 'nosigilo:casa-convite-conta-nova';
const CONTA_NOVA_MS = 7 * 86_400_000;

function diaDaNoite(iso: string | null) {
  if (!iso) return 'sexta, às 21h';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' })}, ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })}, às 21h`;
}

export default function LancamentoDaCasa() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { toast } = useToast();
  const [aberto, setAberto] = useState(false);
  const [reservas, setReservas] = useState(0);
  const [lancamento, setLancamento] = useState(true);
  const [quando, setQuando] = useState<string>('sexta 23/10 · 21h');

  useEffect(() => {
    if (pathname.startsWith('/casa') || pathname.startsWith('/admin')) return;
    const emCampanha = Date.now() < FIM_DA_CAMPANHA;
    const hoje = new Date().toLocaleDateString('pt-BR');
    try {
      if (emCampanha && localStorage.getItem(CHAVE) === hoje) return;
      if (!emCampanha && localStorage.getItem(CHAVE_CONTA_NOVA)) return;
    } catch { /* sem storage: mostra */ }
    const t = setTimeout(async () => {
      try {
        const { data } = await apiClient.get('/casa');
        const naFila = (data?.salas ?? []).some((s: any) => s.posicaoNaFila);
        if (data?.reservado || naFila || data?.aberta) return;
        if (!emCampanha) {
          const criada = Date.parse(String(data?.contaCriadaEm || ''));
          if (!criada || Date.now() - criada > CONTA_NOVA_MS) return;
        }
        setLancamento(emCampanha);
        if (!emCampanha) setQuando(diaDaNoite(data?.proximaAbertura ?? null));
        setReservas(Number(data?.reservas || 0));
        setAberto(true);
        try { localStorage.setItem(emCampanha ? CHAVE : CHAVE_CONTA_NOVA, emCampanha ? hoje : '1'); } catch { /* ok */ }
      } catch { /* sem aviso */ }
    }, 4000); // deixa a tela carregar antes
    return () => clearTimeout(t);
    // Só na primeira tela do dia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reservar = async () => {
    setAberto(false);
    // O aviso de "abriu" chega por notificação: pede a permissão no mesmo toque.
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') void enablePushNotifications().catch(() => {});
    try {
      await apiClient.post('/casa/reservar', { reservar: true });
      toast({ title: lancamento ? '🎟️ Lugar reservado para a inauguração!' : '🎟️ Lugar reservado!', description: lancamento ? 'Sexta, 23/10, às 21h a gente avisa no seu celular.' : `Quando abrir (${quando}), a gente avisa no seu celular.` });
    } catch {
      toast({ title: 'Não foi possível reservar agora.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogContent className="max-w-sm overflow-hidden border-fuchsia-500/40 bg-gradient-to-br from-zinc-950 via-fuchsia-950 to-rose-900 p-0 text-white">
        <div className="space-y-3 p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-fuchsia-200">{lancamento ? 'Inauguração · sexta 23/10 · 21h' : `Próxima noite · ${quando}`}</p>
          <h2 className="text-3xl font-black">A Casa 🔥</h2>
          <p className="text-sm text-white/85">
            {lancamento ? 'A casa de swing virtual do NoSigilo abre nesta sexta!' : 'Bem-vindo(a)! Toda sexta e sábado, das 21h à 1h, acontece A Casa: a casa de swing virtual do NoSigilo.'} Salas ao vivo com casais, mulheres e singles,
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

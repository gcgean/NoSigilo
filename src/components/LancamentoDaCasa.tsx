import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import apiClient from '@/utils/apiClient';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { enablePushNotifications } from '@/utils/pushNotifications';

/**
 * Convite para reservar lugar n'A Casa, no primeiro acesso de cada dia, para
 * quem ainda não reservou a próxima noite nem está na fila.
 * - Sexta e sábado: "é hoje, às 22h".
 * - Segunda a quinta: chama para a sexta que vem.
 * - Domingo: não pergunta.
 * - Até a inauguração (sexta, 23/10/2026, 21h) o texto fala da inauguração.
 */
const FIM_DA_CAMPANHA = Date.parse('2026-10-24T00:00:00Z'); // sexta 23/10, 21h em Brasília
const CHAVE = 'nosigilo:casa-convite-dia';

function hojeEmBrasilia() {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const v = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? '';
  return { dia: `${v('year')}-${v('month')}-${v('day')}`, semana: v('weekday') };
}

function diaDaNoite(iso: string | null) {
  if (!iso) return 'sexta, às 22h';
  const d = new Date(iso);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }).slice(0, 2);
  return `${d.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' })}, ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })}, às ${Number(hora)}h`;
}

export default function LancamentoDaCasa() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { toast } = useToast();
  const [aberto, setAberto] = useState(false);
  const [reservas, setReservas] = useState(0);
  const [lancamento, setLancamento] = useState(true);
  const [quando, setQuando] = useState<string>('sexta 23/10 · 21h');
  const [ehHoje, setEhHoje] = useState(false);
  // Sexta e sábado abrem às 22h.
  const horaHoje = '22h';

  useEffect(() => {
    if (pathname.startsWith('/casa') || pathname.startsWith('/admin')) return;
    const emCampanha = Date.now() < FIM_DA_CAMPANHA;
    const { dia: hoje, semana } = hojeEmBrasilia();
    if (semana === 'Sun') return;
    try {
      if (localStorage.getItem(CHAVE) === hoje) return;
    } catch { /* sem storage: mostra */ }
    const t = setTimeout(async () => {
      try {
        const { data } = await apiClient.get('/casa');
        const naFila = (data?.salas ?? []).some((s: any) => s.posicaoNaFila);
        if (data?.reservado || naFila || data?.aberta) return;
        setLancamento(emCampanha);
        setEhHoje(semana === 'Fri' || semana === 'Sat');
        if (!emCampanha) setQuando(diaDaNoite(data?.proximaAbertura ?? null));
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
    // O aviso de "abriu" chega por notificação: pede a permissão no mesmo toque.
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') void enablePushNotifications().catch(() => {});
    try {
      await apiClient.post('/casa/reservar', { reservar: true });
      toast({ title: lancamento ? '🎟️ Lugar reservado para a inauguração!' : '🎟️ Lugar reservado!', description: lancamento ? 'Sexta, 23/10, às 21h a gente avisa no seu celular.' : ehHoje ? `Hoje às ${horaHoje} a gente avisa no seu celular.` : `Quando abrir (${quando}), a gente avisa no seu celular.` });
    } catch {
      toast({ title: 'Não foi possível reservar agora.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogContent className="max-w-sm overflow-hidden border-fuchsia-500/40 bg-gradient-to-br from-zinc-950 via-fuchsia-950 to-rose-900 p-0 text-white">
        <div className="space-y-3 p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-fuchsia-200">{lancamento ? (ehHoje ? 'É hoje! Inauguração às 21h' : 'Inauguração · sexta 23/10 · 21h') : ehHoje ? `É hoje · às ${horaHoje}` : `Próxima noite · ${quando}`}</p>
          <h2 className="text-3xl font-black">A Casa 🔥</h2>
          <p className="text-sm text-white/85">
            {lancamento ? (ehHoje ? 'A casa de swing virtual do NoSigilo abre HOJE, às 21h!' : 'A casa de swing virtual do NoSigilo abre nesta sexta!') : ehHoje ? `Hoje tem A Casa, das ${horaHoje} à 1h: a casa de swing virtual do NoSigilo. Vai participar?` : 'Toda sexta e sábado às 22h, até 1h, acontece A Casa: a casa de swing virtual do NoSigilo.'} Salas ao vivo com casais, mulheres e singles,
            pulseiras, bar, desafios quentes com a Lola, cabine a dois (de porta aberta, se quiserem 👀) e o Quarto Cuckold.
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
            <Button variant="ghost" className="flex-1 text-white/70 hover:bg-white/10 hover:text-white" onClick={() => { setAberto(false); navigate('/acasa'); }}>
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

import { useEffect, useState } from 'react';
import { Coins, Heart, Radio, Images, Eye, Calendar, Lock, Flame, ArrowRight } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// Aparece UMA única vez por dispositivo (localStorage), logo após o cadastro /
// primeiro acesso. Quem já viu nunca mais vê.
const WELCOME_KEY = 'nosigilo:welcome-seen-v1';

const FEATURES: Array<{ icon: typeof Coins; title: string; desc: string }> = [
  { icon: Heart, title: 'Matches com química', desc: 'Curta casais, mulheres e homens e dê match com quem desperta seu desejo.' },
  { icon: Radio, title: 'Marque encontros — "Estou Aqui"', desc: 'Avise que você está disponível agora e encontre gente quente na sua região.' },
  { icon: Eye, title: 'Se exiba para quem você curte', desc: 'Apareça para o gênero e a região que você quer — do seu jeito, sem julgamento.' },
  { icon: Images, title: 'Divulgue suas experiências', desc: 'Poste fotos, vídeos e stories picantes. Tem fotos privadas pro que é mais íntimo.' },
  { icon: Flame, title: 'Acompanhe os outros', desc: 'Veja as experiências, fantasias e fetiches de casais e singles da comunidade.' },
  { icon: Calendar, title: 'Crie e participe de eventos', desc: 'Divulgue encontros, festas e viagens liberais para a comunidade.' },
  { icon: Coins, title: 'Ganhe tokens interagindo', desc: 'Acumule pontos, vire dias grátis, presenteie perfis e suba no ranking.' },
  { icon: Lock, title: 'Sigilo de verdade', desc: 'Mensagens que somem, controle total de privacidade e total discrição.' },
];

export default function WelcomeModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(WELCOME_KEY)) setOpen(true);
    } catch { /* ignora indisponibilidade do storage */ }

    // Abertura manual pelo menu "Atalhos rápidos"
    const openHandler = () => setOpen(true);
    window.addEventListener('nosigilo:open-welcome', openHandler);
    return () => window.removeEventListener('nosigilo:open-welcome', openHandler);
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(WELCOME_KEY, new Date().toISOString()); } catch { /* noop */ }
    setOpen(false);
    // Encadeia o interstitial do sinal (alguém já curtiu/mandou mensagem).
    try { window.dispatchEvent(new Event('nosigilo:open-welcome-signal')); } catch { /* noop */ }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
        {/* Hero sensual */}
        <div className="relative overflow-hidden bg-gradient-to-br from-primary via-rose-600 to-[#2a0a18] px-6 pb-6 pt-8 text-center text-white">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-12 -left-8 h-40 w-40 rounded-full bg-rose-400/20 blur-3xl" />
          <span className="relative inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider backdrop-blur">
            <Flame className="h-3.5 w-3.5" /> Comunidade liberal +18
          </span>
          <h2 className="relative mt-3 text-2xl font-extrabold leading-tight">
            Bem-vindo(a) ao prazer sem rótulos 🔥
          </h2>
          <p className="relative mt-2 text-sm text-white/90">
            Aqui é o seu espaço pra <strong>liberar todos os desejos e fetiches</strong> — casais, mulheres e homens
            do meio liberal se conectam com sigilo, liberdade e muita intensidade.
          </p>
        </div>

        {/* Features */}
        <div className="max-h-[46vh] space-y-2.5 overflow-y-auto px-5 py-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex items-start gap-3 rounded-xl border border-border/50 bg-secondary/30 p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <f.icon className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{f.title}</p>
                <p className="text-xs text-muted-foreground">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="border-t border-border/50 p-4">
          <Button
            className="w-full gap-2 bg-gradient-to-r from-primary to-rose-600 text-white hover:opacity-90"
            onClick={dismiss}
          >
            Começar a explorar
            <ArrowRight className="h-4 w-4" />
          </Button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Conteúdo adulto. Respeito, consentimento e discrição sempre. 18+
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

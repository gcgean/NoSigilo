import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Heart, Users, Shield, ArrowRight, MessageCircle, Star, BadgeAlert, EyeOff, HeartHandshake, Radio, Images, LockKeyhole, ChevronDown, Zap, Lock } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { appService } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { getLastAuthRoute } from '@/utils/sessionNavigation';

function useCountUp(target: number, duration = 1400) {
  const [value, setValue] = useState(0);
  const started = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (target === 0) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const tick = (now: number) => {
            const progress = Math.min((now - start) / duration, 1);
            setValue(Math.floor(progress * target));
            if (progress < 1) requestAnimationFrame(tick);
            else setValue(target);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration]);

  return { value, ref };
}

const TESTIMONIALS = [
  {
    text: 'Finalmente uma plataforma feita pra quem é do meio. Discreta, funcional e com pessoas reais.',
    profile: 'Casal • SP',
    initial: 'C',
  },
  {
    text: 'Adorei a função "Estou Aqui". Consegui marcar encontros de última hora com muito mais facilidade.',
    profile: 'Mulher solteira • RJ',
    initial: 'M',
  },
  {
    text: 'As fotos privadas mudam tudo. Você controla quem vê o quê, sem exposição desnecessária.',
    profile: 'Homem solteiro • MG',
    initial: 'H',
  },
];

export default function Landing() {
  // Age gate is no longer shown on landing — it's confirmed automatically after registration
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [subscriptionsEnabled, setSubscriptionsEnabled] = useState(true);
  const [stats, setStats] = useState<{ totalUsers: number; onlineNow: number } | null>(null);
  const [seoOpen, setSeoOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    appService
      .getSettings()
      .then((settings) => {
        if (!cancelled) setSubscriptionsEnabled(settings?.subscriptionsEnabled !== false);
      })
      .catch(() => {
        if (!cancelled) setSubscriptionsEnabled(true);
      });

    appService
      .getStats()
      .then((s) => { if (!cancelled) setStats(s); })
      .catch(() => {});

    return () => { cancelled = true; };
  }, []);

  if (isAuthenticated) {
    return <Navigate to={getLastAuthRoute('/feed')} replace />;
  }

  const handleEnter = () => {
    if (isAuthenticated) {
      navigate(getLastAuthRoute('/feed'));
      return;
    }
    navigate('/login');
  };

  const displayTotal = stats?.totalUsers ?? 0;
  const displayOnline = stats?.onlineNow ?? 0;

  return (
    <div className="min-h-screen bg-background">

      {/* Hero Section */}
      <section className="relative min-h-screen overflow-hidden">
        <div className="absolute inset-0 pointer-events-none bg-gradient-hero" />

        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-float" />
          <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-rose/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '-2s' }} />
        </div>

        {/* Navigation */}
        <nav className="absolute top-0 left-0 right-0 z-30 p-3 sm:p-4">
          <div className="container mx-auto flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex justify-center sm:justify-start">
              <BrandLogo size="md" className="gap-2" textClassName="hidden min-[430px]:block text-xl sm:text-2xl" />
            </div>

            <div className="flex w-full items-center gap-2 sm:w-auto sm:justify-end sm:gap-4">
              <Button
                type="button"
                variant="outline"
                className="h-10 flex-1 px-3 text-sm sm:h-10 sm:w-auto sm:flex-none sm:px-4 bg-white text-black border-primary/60 hover:bg-white/90 hover:border-primary shadow-glow"
                onClick={handleEnter}
              >
                Entrar
              </Button>
              <Button asChild className="h-10 flex-[1.35] px-3 text-sm sm:h-10 sm:w-auto sm:flex-none sm:px-4 bg-gradient-primary hover:opacity-90 shadow-glow">
                <Link to="/register">
                  Cadastrar
                </Link>
              </Button>
            </div>
          </div>
        </nav>

        {/* Hero Content */}
        <div className="relative z-10 container mx-auto flex min-h-screen items-center px-4 pb-14 pt-32 text-center sm:justify-center sm:pt-24">
          <div className="mx-auto w-full max-w-4xl">
            <div className="inline-flex max-w-full items-center justify-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-center border border-primary/20 mb-6 animate-fade-in">
              <Zap className="w-4 h-4 text-gold" />
              <span className="text-sm text-primary">Entrada gratuita por tempo limitado — cadastre-se agora</span>
            </div>

            <h1 className="text-3xl sm:text-5xl md:text-7xl font-bold mb-6 animate-slide-up leading-tight">
              Entre em um ambiente onde
              <br />
              <span className="text-gradient">o desejo encontra sigilo e sintonia</span>
            </h1>

            <p className="text-base sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 animate-slide-up" style={{ animationDelay: '0.1s' }}>
              O NoSigilo foi criado para casais, mulheres e homens solteiros do meio liberal em <strong className="text-foreground/80">todo o Brasil</strong> que querem provocar novas conexões, explorar possibilidades
              e viver encontros com mais sigilo, liberdade e intensidade do que nos apps comuns.
            </p>

            <div className="mb-8 flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground animate-slide-up" style={{ animationDelay: '0.15s' }}>
              <span className="rounded-full border border-border/70 bg-black/15 px-3 py-1">Cadastro gratuito</span>
              <span className="rounded-full border border-border/70 bg-black/15 px-3 py-1">Fotos públicas e privadas</span>
              <span className="rounded-full border border-border/70 bg-black/15 px-3 py-1">Mensagens com visualização única</span>
              <span className="rounded-full border border-border/70 bg-black/15 px-3 py-1">Função Estou Aqui</span>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
              <Button asChild size="lg" className="w-full sm:w-auto bg-gradient-primary hover:opacity-90 shadow-glow text-base sm:text-lg px-6 sm:px-8 py-6 gap-2">
                <Link to="/register">
                  Criar conta grátis
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </Button>
              {subscriptionsEnabled ? (
                <Button asChild size="lg" variant="outline" className="w-full sm:w-auto text-base sm:text-lg px-6 sm:px-8 py-6 border-primary/30 hover:border-primary hover:bg-primary/10">
                  <Link to="/subscriptions">
                    Ver Planos
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof — Stats Bar */}
      <StatsBar totalUsers={displayTotal} onlineNow={displayOnline} />

      {/* App Preview Mockup */}
      <AppPreviewSection />

      {/* Testimonials */}
      <section className="py-20 bg-secondary/20">
        <div className="container mx-auto px-4 max-w-5xl">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-2">
            O que dizem quem já entrou
          </h2>
          <p className="text-muted-foreground text-center mb-10 text-sm">Depoimentos reais, perfis preservados.</p>
          <div className="grid gap-5 md:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className="glass rounded-2xl p-6 flex flex-col gap-4">
                <p className="text-sm text-muted-foreground leading-relaxed italic">"{t.text}"</p>
                <div className="flex items-center gap-3 mt-auto pt-2 border-t border-border/40">
                  <div className="w-9 h-9 rounded-full bg-gradient-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
                    {t.initial}
                  </div>
                  <div>
                    <p className="text-xs font-medium">{t.profile}</p>
                    <div className="flex gap-0.5 mt-0.5">
                      {[...Array(5)].map((_, s) => <Star key={s} className="w-3 h-3 text-gold fill-gold" />)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-secondary/30">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            O que faz o <span className="text-gradient">NoSigilo</span> ser diferente
          </h2>
          <p className="text-muted-foreground text-center max-w-2xl mx-auto mb-16">
            Aqui cada detalhe foi pensado para despertar curiosidade, aumentar a química e transformar interesse em conexão real.
          </p>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            <FeatureCard
              icon={Users}
              title="Matchs com química de verdade"
              description="Perfis voltados para casais, mulheres e homens solteiros do meio liberal, com mais atração, afinidade e intenção real."
            />
            <FeatureCard
              icon={Radio}
              title="Função Estou Aqui"
              description="Mostre quando você está disponível e aumente as chances de encontros rápidos com quem entrou na mesma vibração."
            />
            <FeatureCard
              icon={Heart}
              title="Favoritos e interesse seletivo"
              description="Salve os perfis que chamaram sua atenção, organize seus interesses e volte neles no momento certo."
            />
            <FeatureCard
              icon={Images}
              title="Fotos públicas e privadas"
              description="Mostre o suficiente para acender a curiosidade e proteja o que é mais íntimo com controle total sobre as fotos privadas."
            />
            <FeatureCard
              icon={MessageCircle}
              title="Mensagens privadas e visualização única"
              description="Converse com mais liberdade e envie conteúdos que desaparecem depois de vistos, preservando o clima, o mistério e o sigilo."
            />
            <FeatureCard
              icon={Shield}
              title="Ambiente selecionado e discreto"
              description="A rede é voltada para quem realmente é do meio liberal, tornando o ambiente mais seleto, desejado e interessante."
            />
            <FeatureCard
              icon={HeartHandshake}
              title="Liberdade com respeito"
              description="Consentimento, moderação e discrição fazem parte da experiência para que o desejo aconteça com segurança e naturalidade."
            />
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-6">
            <TrustCard icon={BadgeAlert} title="Ambiente adulto e selecionado" description="A rede é focada em casais e singles do meio liberal, tornando o ambiente mais seleto, desejado e interessante." />
            <TrustCard icon={EyeOff} title="Privacidade de verdade" description="Fotos privadas, conteúdos de visualização única e controle total sobre o que cada pessoa pode ver." />
            <TrustCard icon={LockKeyhole} title="Mais sigilo, menos exposição" description="Uma rede pensada para viver curiosidade, provocação e liberdade sem abrir mão da discrição e do controle." />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="container mx-auto px-4 text-center">
          <div className="glass-strong rounded-3xl p-12 max-w-3xl mx-auto shadow-glow">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 border border-primary/20 px-4 py-1.5 text-sm text-primary mb-6">
              <Lock className="w-3.5 h-3.5" />
              Rede por convite — entrada gratuita por tempo limitado
            </div>
            <h2 className="text-3xl font-bold mb-4">
              Entre cedo em uma rede nova, reservada e feita para despertar conexões
            </h2>
            <p className="text-muted-foreground mb-8">
              Se você busca matchs mais envolventes, favoritos, radar "Estou Aqui", fotos privadas, mensagens reservadas e um ambiente feito para o meio liberal,
              esse é o melhor momento para entrar e sentir o clima desde o começo.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button asChild size="lg" className="bg-gradient-primary hover:opacity-90 shadow-glow text-lg px-8 gap-2">
                <Link to="/register">
                  Criar conta grátis
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="text-lg px-8">
                <Link to="/guidelines">
                  Ver Diretrizes
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* SEO Section — collapsible */}
      <section className="py-10 bg-secondary/20 border-t border-border/40">
        <div className="container mx-auto px-4 max-w-4xl">
          <button
            onClick={() => setSeoOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-3 text-left text-muted-foreground/60 hover:text-muted-foreground transition-colors text-xs"
          >
            <span>Swing, troca de casais e encontros liberais no Brasil</span>
            <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${seoOpen ? 'rotate-180' : ''}`} />
          </button>

          {seoOpen && (
            <div className="mt-6">
              <div className="grid md:grid-cols-2 gap-8 text-sm text-muted-foreground leading-relaxed">
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-foreground">Swing e troca de casais em todo o Brasil</h3>
                  <p>
                    O Brasil tem comunidades de <strong className="text-foreground/80">swing</strong> ativas em várias regiões. Casais liberais e singles do meio buscam espaços discretos para conexões reais, longe da exposição das redes sociais comuns. O NoSigilo foi construído exatamente para isso: um lugar onde a <strong className="text-foreground/80">troca de casais no Brasil</strong> acontece com privacidade, respeito e intensidade.
                  </p>
                  <p>
                    Se você é um casal ou single que busca <strong className="text-foreground/80">swing no Brasil</strong>, aqui encontra pessoas com os mesmos interesses, sem julgamentos e com total discrição, em uma proposta voltada para conexões reais de alcance nacional.
                  </p>
                </div>

                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-foreground">Ménage, encontros liberais e mais em todo o Brasil</h3>
                  <p>
                    Além do swing e da troca de casais, o NoSigilo acolhe quem busca <strong className="text-foreground/80">ménage no Brasil</strong>, relacionamentos abertos, encontros esporádicos liberais e conexões entre adultos consentidos. A plataforma é voltada para o <strong className="text-foreground/80">meio liberal brasileiro</strong> — casais, mulheres solteiras e homens solteiros.
                  </p>
                  <p>
                    Diferente dos aplicativos genéricos, o NoSigilo foi pensado para o perfil de quem vive o <strong className="text-foreground/80">swing no Brasil</strong>: com mais sigilo, fotos privadas, mensagens que somem e a função "Estou Aqui" para encontros rápidos e discretos em qualquer região do país.
                  </p>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap justify-center gap-2 text-xs text-muted-foreground/60">
                {['Swing Brasil', 'Troca de casais Brasil', 'Ménage Brasil', 'Swing São Paulo', 'Swing Rio de Janeiro', 'Casais liberais Brasil', 'Encontros liberais Brasil', 'Swing Nordeste', 'Rede swing adulta', 'Casais swing Brasil'].map((tag) => (
                  <span key={tag} className="rounded-full border border-border/40 bg-secondary/30 px-3 py-1">{tag}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <BrandLogo size="sm" className="gap-2" textClassName="text-base" />
            </div>

            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link to="/terms" className="hover:text-primary transition-colors">
                Termos de Uso
              </Link>
              <Link to="/privacy" className="hover:text-primary transition-colors">
                Privacidade
              </Link>
              <Link to="/guidelines" className="hover:text-primary transition-colors">
                Diretrizes
              </Link>
              {subscriptionsEnabled ? (
                <Link to="/subscriptions" className="hover:text-primary transition-colors">
                  Planos
                </Link>
              ) : null}
            </div>

            <p className="text-sm text-muted-foreground">
              © 2025 NoSigilo.net. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function StatsBar({ totalUsers, onlineNow }: { totalUsers: number; onlineNow: number }) {
  const total = useCountUp(totalUsers > 0 ? totalUsers : 12000);
  const online = useCountUp(onlineNow > 0 ? onlineNow : 340);

  return (
    <div ref={total.ref} className="bg-secondary/40 border-y border-border/50 py-6">
      <div className="container mx-auto px-4">
        <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16">
          <div className="text-center">
            <p className="text-3xl font-bold text-gradient">
              +{total.value.toLocaleString('pt-BR')}
            </p>
            <p className="text-sm text-muted-foreground mt-1">cadastros</p>
          </div>
          <div className="w-px h-10 bg-border/60 hidden md:block" />
          <div className="text-center">
            <div className="flex items-center gap-2 justify-center">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <p ref={online.ref} className="text-3xl font-bold text-foreground">{online.value.toLocaleString('pt-BR')}</p>
            </div>
            <p className="text-sm text-muted-foreground mt-1">online agora</p>
          </div>
          <div className="w-px h-10 bg-border/60 hidden md:block" />
          <div className="text-center">
            <p className="text-3xl font-bold text-gradient">100%</p>
            <p className="text-sm text-muted-foreground mt-1">gratuito para entrar</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppPreviewSection() {
  return (
    <section className="py-20 overflow-hidden">
      <div className="container mx-auto px-4">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">
            Um ambiente feito para despertar <span className="text-gradient">conexões reais</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm">
            Perfis com fotos públicas e privadas, match por localização, mensagens que somem e muito mais.
          </p>
        </div>

        <div className="flex gap-4 justify-center items-center flex-wrap">
          {/* Phone mockup 1 — feed card */}
          <div className="relative w-52 shrink-0">
            <div className="rounded-[2rem] border-2 border-white/10 bg-[hsl(0_0%_6%)] p-2 shadow-2xl shadow-primary/10">
              <div className="rounded-[1.5rem] overflow-hidden bg-[hsl(0_0%_9%)] aspect-[9/19]">
                {/* status bar */}
                <div className="flex justify-between px-4 pt-2 pb-1 text-[9px] text-white/40">
                  <span>9:41</span><span>●●●</span>
                </div>
                {/* mock profile card */}
                <div className="mx-2 rounded-xl overflow-hidden bg-gradient-to-b from-primary/20 to-background/80 border border-white/5">
                  <div className="h-28 bg-gradient-to-br from-primary/30 via-rose/20 to-transparent flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-gradient-primary flex items-center justify-center text-white text-xl font-bold shadow-glow">C</div>
                  </div>
                  <div className="p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-white">Casal Ana &amp; Bruno</span>
                      <span className="text-[9px] text-green-400">● online</span>
                    </div>
                    <div className="text-[9px] text-white/50">São Paulo, SP • 3,2 km</div>
                    <div className="flex gap-1 mt-2">
                      <div className="rounded-full bg-primary/20 border border-primary/30 px-2 py-0.5 text-[8px] text-primary">Swing</div>
                      <div className="rounded-full bg-secondary/60 px-2 py-0.5 text-[8px] text-white/50">Casais</div>
                    </div>
                  </div>
                </div>
                {/* mock action buttons */}
                <div className="flex gap-2 justify-center mt-3 px-4">
                  <div className="flex-1 rounded-lg bg-secondary/50 h-8 flex items-center justify-center">
                    <Heart className="w-4 h-4 text-primary/70" />
                  </div>
                  <div className="flex-1 rounded-lg bg-primary/20 h-8 flex items-center justify-center border border-primary/30">
                    <MessageCircle className="w-4 h-4 text-primary" />
                  </div>
                </div>
                {/* mock feed posts */}
                <div className="mx-2 mt-3 space-y-1.5">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="rounded-lg bg-secondary/30 h-12 flex items-center px-2 gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-primary/40 shrink-0" />
                      <div className="space-y-1 flex-1">
                        <div className="h-1.5 bg-white/10 rounded w-3/4" />
                        <div className="h-1.5 bg-white/5 rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-center text-xs text-muted-foreground mt-3">Perfis &amp; Feed</p>
          </div>

          {/* Phone mockup 2 — chat */}
          <div className="relative w-52 shrink-0 mt-6 md:mt-0">
            <div className="rounded-[2rem] border-2 border-white/10 bg-[hsl(0_0%_6%)] p-2 shadow-2xl shadow-rose/10">
              <div className="rounded-[1.5rem] overflow-hidden bg-[hsl(0_0%_9%)] aspect-[9/19]">
                <div className="flex justify-between px-4 pt-2 pb-1 text-[9px] text-white/40">
                  <span>9:41</span><span>●●●</span>
                </div>
                {/* chat header */}
                <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
                  <div className="w-7 h-7 rounded-full bg-gradient-primary flex items-center justify-center text-[10px] font-bold text-white shrink-0">M</div>
                  <div>
                    <p className="text-[10px] font-medium text-white">Marina</p>
                    <p className="text-[8px] text-green-400">online agora</p>
                  </div>
                  <LockKeyhole className="w-3 h-3 text-primary/60 ml-auto" />
                </div>
                {/* chat messages */}
                <div className="px-2 py-2 space-y-2">
                  <div className="flex justify-start">
                    <div className="rounded-xl rounded-tl-none bg-secondary/60 px-2.5 py-1.5 max-w-[75%]">
                      <p className="text-[9px] text-white/80">Oi! Vi que você está por perto 👀</p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <div className="rounded-xl rounded-tr-none bg-primary/30 border border-primary/20 px-2.5 py-1.5 max-w-[75%]">
                      <p className="text-[9px] text-white/80">Sim! Que coincidência 😏</p>
                    </div>
                  </div>
                  {/* self-destruct message */}
                  <div className="flex justify-start">
                    <div className="rounded-xl rounded-tl-none bg-rose/20 border border-rose/30 px-2.5 py-1.5 max-w-[80%]">
                      <div className="flex items-center gap-1 mb-0.5">
                        <EyeOff className="w-2.5 h-2.5 text-rose/70" />
                        <p className="text-[8px] text-rose/70">Visualização única</p>
                      </div>
                      <div className="h-8 rounded bg-white/5 flex items-center justify-center">
                        <span className="text-[8px] text-white/30">Toque para ver</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <div className="rounded-xl rounded-tr-none bg-primary/30 border border-primary/20 px-2.5 py-1.5 max-w-[75%]">
                      <p className="text-[9px] text-white/80">Vou te responder por lá 🔥</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-center text-xs text-muted-foreground mt-3">Chat privado</p>
          </div>

          {/* Phone mockup 3 — radar */}
          <div className="relative w-52 shrink-0">
            <div className="rounded-[2rem] border-2 border-white/10 bg-[hsl(0_0%_6%)] p-2 shadow-2xl shadow-primary/10">
              <div className="rounded-[1.5rem] overflow-hidden bg-[hsl(0_0%_9%)] aspect-[9/19]">
                <div className="flex justify-between px-4 pt-2 pb-1 text-[9px] text-white/40">
                  <span>9:41</span><span>●●●</span>
                </div>
                {/* radar screen */}
                <div className="mx-2 rounded-xl overflow-hidden bg-gradient-to-b from-primary/5 to-transparent border border-primary/10 p-3">
                  <p className="text-[10px] font-semibold text-primary mb-2 flex items-center gap-1"><Radio className="w-3 h-3" /> Estou Aqui</p>
                  {/* mock radar circle */}
                  <div className="relative aspect-square rounded-full border border-primary/20 bg-primary/5 flex items-center justify-center mx-auto w-28">
                    <div className="absolute inset-0 rounded-full border border-primary/10 animate-ping opacity-30" />
                    <div className="w-3 h-3 rounded-full bg-primary shadow-glow" />
                    {/* dots */}
                    {[
                      { top: '20%', left: '65%', color: 'bg-rose/70' },
                      { top: '55%', left: '15%', color: 'bg-primary/80' },
                      { top: '70%', left: '60%', color: 'bg-gold/70' },
                    ].map((dot, i) => (
                      <div key={i} style={{ top: dot.top, left: dot.left }} className={`absolute w-2.5 h-2.5 rounded-full ${dot.color}`} />
                    ))}
                  </div>
                  <p className="text-[9px] text-muted-foreground text-center mt-2">3 perfis a menos de 5 km</p>
                </div>
                {/* nearby list */}
                <div className="mx-2 mt-2 space-y-1.5">
                  {['Ju', 'Casal', 'Rafa'].map((name, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg bg-secondary/30 p-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-primary/50 shrink-0 flex items-center justify-center text-[8px] font-bold text-white">{name[0]}</div>
                      <div className="flex-1">
                        <div className="h-1.5 bg-white/15 rounded w-16" />
                        <div className="h-1 bg-white/8 rounded w-10 mt-1" />
                      </div>
                      <span className="text-[8px] text-green-400">● {(i + 1) * 1.2}km</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-center text-xs text-muted-foreground mt-3">Radar "Estou Aqui"</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustCard({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="glass rounded-2xl p-6">
      <div className="w-12 h-12 rounded-xl bg-primary/12 flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="glass rounded-2xl p-8 hover:shadow-glow transition-all duration-300 hover:-translate-y-1">
      <div className="w-14 h-14 rounded-xl bg-gradient-primary flex items-center justify-center mb-6 shadow-glow">
        <Icon className="w-7 h-7 text-primary-foreground" />
      </div>
      <h3 className="text-xl font-semibold mb-3">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}

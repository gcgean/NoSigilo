import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Heart, Users, Shield, ArrowRight, MessageCircle, Star, BadgeAlert, EyeOff, HeartHandshake, Radio, Images, LockKeyhole } from 'lucide-react';
import { useAgeGate } from '@/contexts/AgeGateContext';
import BrandLogo from '@/components/BrandLogo';
import { appService } from '@/services/api';

export default function Landing() {
  const { hasConfirmedAge, confirmAge } = useAgeGate();
  const [subscriptionsEnabled, setSubscriptionsEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;

    appService
      .getSettings()
      .then((settings) => {
        if (!cancelled) {
          setSubscriptionsEnabled(settings?.subscriptionsEnabled !== false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSubscriptionsEnabled(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {!hasConfirmedAge && (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md p-4 flex items-center justify-center">
          <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-[hsl(0_0%_8%)] p-6 sm:p-8 shadow-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm text-primary mb-4">
              <BadgeAlert className="w-4 h-4" />
              Acesso restrito para maiores de 18 anos
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">Ambiente adulto, discreto e consensual</h2>
            <p className="text-muted-foreground mb-6">
              O NoSigilo é uma rede social adulta voltada principalmente para casais e singles femininos e masculinos.
              Ao entrar, você confirma que tem 18 anos ou mais e concorda com nossas regras de consentimento, privacidade e conduta.
            </p>
            <div className="grid gap-3 text-sm text-muted-foreground mb-6">
              <div>Conteúdo e interações apenas entre adultos.</div>
              <div>Privacidade, discrição e respeito são obrigatórios.</div>
              <div>Perfis falsos, assédio, exposição indevida e conteúdo ilegal resultam em bloqueio.</div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button className="bg-gradient-primary hover:opacity-90" onClick={confirmAge}>
                Tenho 18 anos ou mais
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link to="/terms">Ler termos</Link>
              </Button>
              <Button asChild variant="ghost" className="w-full">
                <Link to="/guidelines">Diretrizes</Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <section className="relative min-h-screen overflow-hidden">
        <div className="absolute inset-0 bg-gradient-hero" />
        
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-float" />
          <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-rose/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '-2s' }} />
        </div>

        {/* Navigation */}
        <nav className="absolute top-0 left-0 right-0 z-10 p-3 sm:p-4">
          <div className="container mx-auto flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex justify-center sm:justify-start">
              <BrandLogo size="md" className="gap-2" textClassName="hidden min-[430px]:block text-xl sm:text-2xl" />
            </div>
            
            <div className="flex w-full items-center gap-2 sm:w-auto sm:justify-end sm:gap-4">
              <Button
                asChild
                variant="outline"
                className="h-10 flex-1 px-3 text-sm sm:h-10 sm:w-auto sm:flex-none sm:px-4 bg-white text-black border-primary/60 hover:bg-white/90 hover:border-primary shadow-glow"
              >
                <Link to="/login">
                  Entrar
                </Link>
              </Button>
              <Button asChild className="h-10 flex-[1.35] px-3 text-sm sm:h-10 sm:w-auto sm:flex-none sm:px-4 bg-gradient-primary hover:opacity-90 shadow-glow">
                <Link to="/register">
                  Entrar com convite
                </Link>
              </Button>
            </div>
          </div>
        </nav>

        {/* Hero Content */}
        <div className="relative z-10 container mx-auto flex min-h-screen items-center px-4 pb-14 pt-32 text-center sm:justify-center sm:pt-24">
          <div className="mx-auto w-full max-w-4xl">
          <div className="inline-flex max-w-full items-center justify-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-center border border-primary/20 mb-6 animate-fade-in">
            <Star className="w-4 h-4 text-gold" />
            <span className="text-sm text-primary">+18 • Rede adulta com foco em casais e singles</span>
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-7xl font-bold mb-6 animate-slide-up leading-tight">
            Uma rede liberal para
            <br />
            <span className="text-gradient">desejo, discrição e conexão real</span>
          </h1>

          <p className="text-base sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            O NoSigilo foi criado para casais, mulheres e homens solteiros do meio liberal que querem conhecer pessoas com a mesma sintonia,
            mais privacidade, mais liberdade e menos exposição do que nos apps comuns.
          </p>

          <div className="mb-8 flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground animate-slide-up" style={{ animationDelay: '0.15s' }}>
            <span className="rounded-full border border-border/70 bg-black/15 px-3 py-1">Acesso por convite</span>
            <span className="rounded-full border border-border/70 bg-black/15 px-3 py-1">Fotos públicas e privadas</span>
            <span className="rounded-full border border-border/70 bg-black/15 px-3 py-1">Mensagens com visualização única</span>
            <span className="rounded-full border border-border/70 bg-black/15 px-3 py-1">Função Estou Aqui</span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <Button asChild size="lg" className="w-full sm:w-auto bg-gradient-primary hover:opacity-90 shadow-glow text-base sm:text-lg px-6 sm:px-8 py-6 gap-2">
              <Link to="/register">
                Usar meu convite
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

      {/* Features Section */}
      <section className="py-24 bg-secondary/30">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            O que faz o <span className="text-gradient">NoSigilo</span> ser diferente
          </h2>
          <p className="text-muted-foreground text-center max-w-2xl mx-auto mb-16">
            Aqui a experiência é pensada para gerar vontade de entrar, ficar e explorar com mais segurança.
          </p>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            <FeatureCard
              icon={Users}
              title="Matchs com intenção real"
              description="Perfis voltados para casais, mulheres e homens solteiros do meio liberal, com conexões muito mais alinhadas."
            />
            <FeatureCard
              icon={Radio}
              title="Função Estou Aqui"
              description="Mostre quando você está disponível e aumente as chances de encontros rápidos com quem está na mesma vibe."
            />
            <FeatureCard
              icon={Heart}
              title="Favoritos e interesse seletivo"
              description="Salve perfis que despertaram desejo, organize suas preferências e volte neles no momento certo."
            />
            <FeatureCard
              icon={Images}
              title="Fotos públicas e privadas"
              description="Exiba o que quiser para todos e proteja o que é mais íntimo com controle de acesso às fotos privadas."
            />
            <FeatureCard
              icon={MessageCircle}
              title="Mensagens privadas e visualização única"
              description="Converse com mais liberdade e envie conteúdos que desaparecem depois de vistos, preservando o sigilo."
            />
            <FeatureCard
              icon={Shield}
              title="Acesso reservado por convite"
              description="A entrada por convite deixa a rede mais selecionada, reduz perfis sem contexto e melhora a qualidade das conexões."
            />
            <FeatureCard
              icon={HeartHandshake}
              title="Liberdade com respeito"
              description="Consentimento, moderação e discrição fazem parte da experiência para que o desejo aconteça com segurança."
            />
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-6">
            <TrustCard icon={BadgeAlert} title="Só entra quem recebe convite" description="A rede não é aberta para qualquer um, o que torna o ambiente mais seleto e interessante." />
            <TrustCard icon={EyeOff} title="Privacidade de verdade" description="Fotos privadas, conteúdos de visualização única e controle sobre quem vê cada parte do seu perfil." />
            <TrustCard icon={LockKeyhole} title="Mais sigilo, menos exposição" description="Uma rede pensada para quem quer viver desejo, curiosidade e liberdade sem se sentir exposto." />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="container mx-auto px-4 text-center">
          <div className="glass-strong rounded-3xl p-12 max-w-3xl mx-auto shadow-glow">
            <Users className="w-16 h-16 text-primary mx-auto mb-6" />
            <h2 className="text-3xl font-bold mb-4">
              Entre cedo em uma rede nova, selecionada e muito mais envolvente
            </h2>
            <p className="text-muted-foreground mb-8">
              Se você busca matchs melhores, favoritos, radar “Estou Aqui”, fotos privadas, mensagens reservadas e um ambiente feito para o meio liberal,
              esse é o melhor momento para entrar.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button asChild size="lg" className="bg-gradient-primary hover:opacity-90 shadow-glow text-lg px-8">
                <Link to="/register">
                  Usar meu convite
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
              © 2025 NoSigilo. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
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

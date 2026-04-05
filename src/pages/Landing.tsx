import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Heart, Users, Shield, Sparkles, ArrowRight, MessageCircle, Star, BadgeAlert, EyeOff, HeartHandshake } from 'lucide-react';
import { useAgeGate } from '@/contexts/AgeGateContext';

export default function Landing() {
  const { hasConfirmedAge, confirmAge } = useAgeGate();

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
              <Link to="/terms">
                <Button variant="outline" className="w-full">Ler termos</Button>
              </Link>
              <Link to="/guidelines">
                <Button variant="ghost" className="w-full">Diretrizes</Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-hero" />
        
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-float" />
          <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-rose/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '-2s' }} />
        </div>

        {/* Navigation */}
        <nav className="absolute top-0 left-0 right-0 z-10 p-4">
          <div className="container mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
                <Sparkles className="w-6 h-6 text-primary-foreground" />
              </div>
              <span className="text-xl sm:text-2xl font-bold text-gradient">NoSigilo</span>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-4">
              <Link to="/login">
                <Button
                  variant="outline"
                  className="h-10 px-3 sm:px-4 bg-white text-black border-primary/60 hover:bg-white/90 hover:border-primary shadow-glow"
                >
                  Entrar
                </Button>
              </Link>
              <Link to="/register">
                <Button className="h-10 px-3 sm:px-4 bg-gradient-primary hover:opacity-90 shadow-glow">
                  Entrar com convite
                </Button>
              </Link>
            </div>
          </div>
        </nav>

        {/* Hero Content */}
        <div className="relative z-10 container mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6 animate-fade-in">
            <Star className="w-4 h-4 text-gold" />
            <span className="text-sm text-primary">+18 • Rede adulta com foco em casais e singles</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold mb-6 animate-slide-up">
            Encontros adultos com
            <br />
            <span className="text-gradient">discrição, consentimento e segurança</span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            Um ambiente +18 pensado principalmente para casais e singles femininos e masculinos que buscam conexões reais,
            privacidade, controle de acesso e convivência respeitosa.
          </p>

          <div className="mb-8 flex flex-wrap items-center justify-center gap-3 text-xs sm:text-sm text-muted-foreground animate-slide-up" style={{ animationDelay: '0.15s' }}>
            <span className="rounded-full border border-border/70 bg-black/15 px-3 py-1">Confirmação +18</span>
            <span className="rounded-full border border-border/70 bg-black/15 px-3 py-1">Fotos privadas com controle</span>
            <span className="rounded-full border border-border/70 bg-black/15 px-3 py-1">Consentimento e moderação</span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <Link to="/register">
              <Button size="lg" className="bg-gradient-primary hover:opacity-90 shadow-glow text-lg px-8 py-6 gap-2">
                Usar meu convite
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Link to="/plans">
              <Button size="lg" variant="outline" className="text-lg px-8 py-6 border-primary/30 hover:border-primary hover:bg-primary/10">
                Ver Planos
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-secondary/30">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            Por que escolher o <span className="text-gradient">NoSigilo?</span>
          </h2>
          <p className="text-muted-foreground text-center max-w-2xl mx-auto mb-16">
            Uma experiência adulta e responsável, com foco em confiança, discrição e afinidade real.
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon={Users}
              title="Foco em Casais e Singles"
              description="Estrutura pensada para casais e perfis femininos e masculinos solteiros encontrarem conexões compatíveis."
            />
            <FeatureCard
              icon={Shield}
              title="Privacidade com Controle"
              description="Escolha quem pode acessar suas fotos privadas e revogue acessos sempre que quiser."
            />
            <FeatureCard
              icon={HeartHandshake}
              title="Consentimento e Respeito"
              description="O ambiente prioriza consentimento claro, discrição e convivência sem assédio."
            />
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-6">
            <TrustCard icon={BadgeAlert} title="Uso apenas +18" description="Cadastro e uso destinados exclusivamente a adultos." />
            <TrustCard icon={EyeOff} title="Discrição real" description="Fotos privadas, controle de acesso e foco em privacidade." />
            <TrustCard icon={MessageCircle} title="Conduta monitorada" description="Assédio, exposição indevida e conteúdo ilegal não são tolerados." />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="container mx-auto px-4 text-center">
          <div className="glass-strong rounded-3xl p-12 max-w-3xl mx-auto shadow-glow">
            <Users className="w-16 h-16 text-primary mx-auto mb-6" />
            <h2 className="text-3xl font-bold mb-4">
              Entre em uma rede adulta mais segura e madura
            </h2>
            <p className="text-muted-foreground mb-8">
              Leia as diretrizes, confirme sua idade e entre apenas por convite de alguém já aprovado na rede.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to="/register">
                <Button size="lg" className="bg-gradient-primary hover:opacity-90 shadow-glow text-lg px-8">
                  Usar meu convite
                </Button>
              </Link>
              <Link to="/guidelines">
                <Button size="lg" variant="outline" className="text-lg px-8">
                  Ver Diretrizes
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <span className="font-bold text-gradient">NoSigilo</span>
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
              <Link to="/plans" className="hover:text-primary transition-colors">
                Planos
              </Link>
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

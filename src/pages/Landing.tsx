import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Heart, Users, Shield, Sparkles, ArrowRight, MessageCircle, Star } from 'lucide-react';

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
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
          <div className="container mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
                <Sparkles className="w-6 h-6 text-primary-foreground" />
              </div>
              <span className="text-2xl font-bold text-gradient">NoSigilo</span>
            </div>
            
            <div className="flex items-center gap-4">
              <Link to="/login">
                <Button
                  variant="outline"
                  className="bg-white text-black border-primary/60 hover:bg-white/90 hover:border-primary shadow-glow"
                >
                  Entrar
                </Button>
              </Link>
              <Link to="/register">
                <Button className="bg-gradient-primary hover:opacity-90 shadow-glow">
                  Criar Conta
                </Button>
              </Link>
            </div>
          </div>
        </nav>

        {/* Hero Content */}
        <div className="relative z-10 container mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6 animate-fade-in">
            <Star className="w-4 h-4 text-gold" />
            <span className="text-sm text-primary">+18 • Rede Social Adulta</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold mb-6 animate-slide-up">
            Conecte-se com
            <br />
            <span className="text-gradient">quem você deseja</span>
          </h1>

          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            Uma plataforma segura e discreta para encontrar pessoas especiais.
            Matches autênticos, conversas reais.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <Link to="/register">
              <Button size="lg" className="bg-gradient-primary hover:opacity-90 shadow-glow text-lg px-8 py-6 gap-2">
                Começar Agora
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
            Uma experiência única pensada para você encontrar conexões verdadeiras.
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon={Heart}
              title="Matches Inteligentes"
              description="Algoritmo que entende suas preferências e encontra pessoas compatíveis."
            />
            <FeatureCard
              icon={Shield}
              title="Privacidade Garantida"
              description="Controle total sobre quem vê seu perfil e suas fotos privadas."
            />
            <FeatureCard
              icon={MessageCircle}
              title="Chat em Tempo Real"
              description="Converse instantaneamente com seus matches de forma segura."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="container mx-auto px-4 text-center">
          <div className="glass-strong rounded-3xl p-12 max-w-3xl mx-auto shadow-glow">
            <Users className="w-16 h-16 text-primary mx-auto mb-6" />
            <h2 className="text-3xl font-bold mb-4">
              Junte-se a milhares de pessoas
            </h2>
            <p className="text-muted-foreground mb-8">
              Comece gratuitamente e descubra um novo mundo de possibilidades.
            </p>
            <Link to="/register">
              <Button size="lg" className="bg-gradient-primary hover:opacity-90 shadow-glow text-lg px-8">
                Criar Minha Conta Grátis
              </Button>
            </Link>
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

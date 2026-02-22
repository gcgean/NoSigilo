import { useAgeGate } from '@/contexts/AgeGateContext';
import { Button } from '@/components/ui/button';
import { ShieldAlert, Heart } from 'lucide-react';

export default function AgeGateModal() {
  const { confirmAge } = useAgeGate();

  const handleDecline = () => {
    window.location.href = 'https://google.com';
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gradient-hero" />
      
      <div className="relative glass-strong rounded-2xl p-8 max-w-md w-full text-center shadow-glow animate-scale-in">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-primary flex items-center justify-center shadow-glow">
          <ShieldAlert className="w-10 h-10 text-primary-foreground" />
        </div>

        <h1 className="text-2xl font-bold mb-2">
          Verificação de Idade
        </h1>
        
        <div className="flex items-center justify-center gap-2 mb-4">
          <Heart className="w-5 h-5 text-primary" />
          <span className="text-xl font-semibold text-gradient">NoSigilo</span>
        </div>

        <p className="text-muted-foreground mb-6">
          Este site contém conteúdo adulto e é destinado apenas para maiores de 18 anos.
          Ao entrar, você confirma ter idade legal para acessar este tipo de conteúdo.
        </p>

        <div className="space-y-3">
          <Button 
            onClick={confirmAge} 
            className="w-full bg-gradient-primary hover:opacity-90 transition-opacity text-lg py-6"
          >
            Tenho 18 anos ou mais
          </Button>
          
          <Button 
            onClick={handleDecline} 
            variant="ghost" 
            className="w-full text-muted-foreground hover:text-foreground"
          >
            Sou menor de idade
          </Button>
        </div>

        <p className="text-xs text-muted-foreground mt-6">
          Ao continuar, você concorda com nossos{' '}
          <a href="/terms" className="text-primary hover:underline">Termos de Uso</a>
          {' '}e{' '}
          <a href="/privacy" className="text-primary hover:underline">Política de Privacidade</a>
        </p>
      </div>
    </div>
  );
}

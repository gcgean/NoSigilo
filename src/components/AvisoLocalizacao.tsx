import { useState } from 'react';
import { Loader2, MapPin, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { locationService } from '@/services/api';

const FECHADO_KEY = 'nosigilo:aviso-localizacao-fechado';
const SETE_DIAS = 7 * 24 * 60 * 60 * 1000;

/**
 * Aviso para quem está sem GPS (só com a cidade do cadastro): sem ele a
 * distância não aparece em km, nem para ela nem para quem a vê. Pede a
 * permissão do navegador com um toque. "Agora não" esconde por 7 dias.
 */
export default function AvisoLocalizacao({ aoAtivar }: { aoAtivar?: () => void }) {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const [ocupado, setOcupado] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  const [fechado, setFechado] = useState(() => {
    try { return Date.now() - Number(localStorage.getItem(FECHADO_KEY) || 0) < SETE_DIAS; } catch { return false; }
  });

  if (!user || user.localizacaoGps || fechado) return null;

  const fechar = () => {
    try { localStorage.setItem(FECHADO_KEY, String(Date.now())); } catch { /* ok */ }
    setFechado(true);
  };

  const ativar = async () => {
    if (!navigator.geolocation) { setBloqueado(true); return; }
    setOcupado(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 }));
      const r = await locationService.updateLocation(pos.coords.latitude, pos.coords.longitude);
      updateUser({ localizacaoGps: true, ...(r?.city ? { city: r.city } : {}), ...(r?.state ? { state: r.state } : {}) } as any);
      toast({ title: '📍 Localização ativada', description: 'Agora você vê a que distância cada pessoa está.' });
      aoAtivar?.();
    } catch (e: any) {
      // 1 = a pessoa (ou o navegador) negou: explica como liberar.
      if (Number(e?.code) === 1) setBloqueado(true);
      else toast({ title: 'Não conseguimos pegar sua localização', description: 'Tente de novo em um lugar com sinal melhor.', variant: 'destructive' });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="relative mb-4 rounded-xl border border-sky-400/40 bg-sky-500/10 p-3.5 pr-9 text-left">
      <button type="button" onClick={fechar} className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground hover:bg-secondary" aria-label="Fechar">
        <X className="h-4 w-4" />
      </button>
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <MapPin className="h-4 w-4 shrink-0 text-sky-500" />
        Ative sua localização para ver a que distância cada pessoa está
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {bloqueado
          ? 'A localização está bloqueada no navegador. Toque no cadeado ao lado do endereço do site › Localização › Permitir, e depois tente de novo.'
          : 'A distância é aproximada (em km inteiros) e sua localização exata nunca aparece para ninguém.'}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={ocupado} onClick={() => void ativar()} className="bg-sky-600 text-white hover:bg-sky-700">
          {ocupado ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          {bloqueado ? 'Tentar de novo' : 'Ativar localização'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={fechar}>Agora não</Button>
      </div>
    </div>
  );
}

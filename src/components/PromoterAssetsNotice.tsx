import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ImagePlus } from 'lucide-react';
import { promoterService } from '@/services/api';

// Aviso exclusivo desta área: não cria notificação global, push, e-mail ou mensagem.
export default function PromoterAssetsNotice() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (document.visibilityState === 'hidden') return;
      try { const data = await promoterService.assets(); if (active) setCount(data.newCount); } catch { /* A central continua acessível pelo link. */ }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 60000);
    window.addEventListener('focus', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  return <Link to="/promoter/artes" className="flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 p-5 hover:bg-primary/15">
    <ImagePlus className="h-6 w-6 shrink-0 text-primary" />
    <div className="min-w-0"><p className="font-semibold" aria-live="polite">{count ? `${count} ${count === 1 ? 'novo material disponível' : 'novos materiais disponíveis'}` : 'Sua central de divulgação'}</p><p className="text-sm text-muted-foreground">Fotos, vídeos, legendas e seu link para divulgar no Instagram. Toque para acessar.</p></div>
  </Link>;
}

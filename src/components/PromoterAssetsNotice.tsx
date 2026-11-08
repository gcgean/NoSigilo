import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ImagePlus } from 'lucide-react';
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
  return <Link to="/promoter/artes" className="flex flex-wrap items-center gap-3 focus-visible:ring-2 focus-visible:ring-primary rounded-2xl border border-primary/40 bg-primary/10 p-5 hover:bg-primary/15">
    <ImagePlus className="h-6 w-6 shrink-0 text-primary" />
    <div className="min-w-0 flex-1"><p className="font-semibold" aria-live="polite">{count ? `${count} ${count === 1 ? 'novo material disponível' : 'novos materiais disponíveis'}` : 'Sua central de divulgação'}</p><p className="text-sm text-muted-foreground">Fotos, vídeos, legendas e seu link para divulgar no Instagram. </p></div>
    <span className="flex min-h-11 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground">Abrir central <ArrowRight className="h-4 w-4" aria-hidden="true" /></span>
  </Link>;
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ComprarTokens from '@/components/ComprarTokens';
import { useAuth } from '@/contexts/AuthContext';

// Como ganhar tokens de graça (mesmos valores de TOKEN_RULES no backend).
// Pontos por publicar e o Top do Dia só valem para mulher e casal.
const GANHAR_TOKENS = [
  { icon: '📅', texto: 'Entrar todo dia', pontos: '+5', conteudo: false },
  { icon: '❤️', texto: 'Curtir', pontos: '+1', conteudo: false },
  { icon: '💬', texto: 'Comentar', pontos: '+3', conteudo: false },
  { icon: '📝', texto: 'Post', pontos: '+5', conteudo: true },
  { icon: '📸', texto: 'Story', pontos: '+8', conteudo: true },
  { icon: '🖼️', texto: 'Foto', pontos: '+10', conteudo: true },
  { icon: '🏆', texto: 'Top do Dia', pontos: 'até +30', conteudo: true },
];

export function ganhaTokensPorConteudo(gender: unknown) {
  const g = String(gender || '').trim().toLowerCase();
  return g === 'mulher' || g.startsWith('casal');
}

/**
 * "Faltam tokens": primeiro mostra como ganhar de graça e, depois, a compra
 * para quem tem pressa. Usado pelos recursos pagos em tokens (Super Curtida,
 * Disponível hoje, destaques, presentes).
 */
export default function SemTokensDialog({
  open,
  onOpenChange,
  custo,
  recurso,
  aoComprar,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  custo: number;
  recurso: string;
  aoComprar?: () => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mostrarCompra, setMostrarCompra] = useState(false);
  const itens = GANHAR_TOKENS.filter((g) => !g.conteudo || ganhaTokensPorConteudo(user?.gender));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setMostrarCompra(false); onOpenChange(v); }}>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Faltam tokens 🪙</DialogTitle>
          <DialogDescription>{recurso} custa {custo} tokens.</DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">🎁 Ganhe tokens de graça</p>
          <p className="mt-0.5 text-xs text-muted-foreground">É só usar o NoSigilo: cada ação vale tokens.</p>
          <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
            {itens.map((g) => (
              <li key={g.texto} className="flex items-center gap-1.5 text-sm">
                <span aria-hidden="true">{g.icon}</span>
                <span className="min-w-0 flex-1 leading-tight">{g.texto}</span>
                <span className="shrink-0 font-semibold text-emerald-600 dark:text-emerald-400">{g.pontos}</span>
              </li>
            ))}
          </ul>
          <Button type="button" className="mt-3 w-full bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => { onOpenChange(false); navigate('/tokens'); }}>
            Ver como ganhar grátis
          </Button>
        </div>

        {mostrarCompra ? (
          <ComprarTokens aoCreditar={() => { aoComprar?.(); onOpenChange(false); }} />
        ) : (
          <button type="button" onClick={() => setMostrarCompra(true)} className="w-full rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
            Está com pressa? Comprar tokens para agilizar
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}

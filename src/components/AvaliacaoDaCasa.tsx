import { useState } from 'react';
import apiClient from '@/utils/apiClient';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

/**
 * Ao sair d'A Casa, quem nunca avaliou dá uma nota de 1 a 5 e, se quiser, uma
 * sugestão. O admin vê a média e as sugestões na aba A Casa. "Agora não" só
 * adia: pergunta de novo em outra noite, até a pessoa avaliar.
 */
const ROTULOS = ['', 'Não curti', 'Fraca', 'Boa', 'Muito boa', 'Incrível'];

export default function AvaliacaoDaCasa({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const { toast } = useToast();
  const [nota, setNota] = useState(0);
  const [sugestao, setSugestao] = useState('');
  const [enviando, setEnviando] = useState(false);

  const fechar = () => {
    try { localStorage.setItem('nosigilo:avaliacao-casa-perguntada', new Date(Date.now() - 6 * 3600_000).toLocaleDateString('sv-SE')); } catch { /* sem armazenamento */ }
    onFechar();
  };
  const enviar = async () => {
    if (!nota) return;
    setEnviando(true);
    try {
      await apiClient.post('/casa/avaliacao', { nota, sugestao: sugestao.trim() || undefined });
      fechar();
      toast({ title: 'Valeu pela avaliação! 🔥', description: 'A equipe lê todas as sugestões para deixar A Casa melhor.' });
    } catch {
      toast({ title: 'Não foi possível enviar agora.', variant: 'destructive' });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) fechar(); }}>
      <DialogContent className="z-[9996] max-w-sm">
        <DialogHeader>
          <DialogTitle>Como foi A Casa pra você?</DialogTitle>
          <DialogDescription>Leva 10 segundos e ajuda a gente a deixar as próximas noites melhores.</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center gap-1.5" role="radiogroup" aria-label="Nota de 1 a 5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={nota === n} aria-label={`${n} de 5: ${ROTULOS[n]}`}
              onClick={() => setNota(n)}
              className={cn('text-4xl leading-none transition-transform active:scale-90', n <= nota ? 'opacity-100' : 'opacity-30 grayscale')}>
              🔥
            </button>
          ))}
        </div>
        <p className="h-4 text-center text-xs font-semibold text-rose-500">{nota ? ROTULOS[nota] : ''}</p>
        <textarea
          value={sugestao}
          onChange={(e) => setSugestao(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder={nota && nota <= 3 ? 'O que faltou? O que podemos melhorar?' : 'Alguma sugestão? Brincadeira, sala, música… (opcional)'}
          className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-base sm:text-sm"
          aria-label="Sugestão para A Casa"
        />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={fechar}>Agora não</Button>
          <Button disabled={!nota || enviando} onClick={() => void enviar()}>{enviando ? 'Enviando…' : 'Enviar'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

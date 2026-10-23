import { useState } from 'react';
import apiClient from '@/utils/apiClient';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

/**
 * Feedback e sugestões sobre A Casa. Vai para o chat de Suporte (painel do
 * admin), marcado como "A Casa" para a equipe achar fácil; a resposta chega
 * no Suporte da pessoa.
 */
const TIPOS = [
  { id: 'gostei', emoji: '😍', rotulo: 'Adorei' },
  { id: 'ideia', emoji: '💡', rotulo: 'Tenho uma ideia' },
  { id: 'problema', emoji: '🛠️', rotulo: 'Deu problema' },
] as const;

export default function FeedbackDaCasa({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const { toast } = useToast();
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]['id']>('ideia');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    const t = texto.trim();
    if (t.length < 3) { toast({ title: 'Escreva um pouquinho mais 😉' }); return; }
    const rotulo = TIPOS.find((x) => x.id === tipo)!;
    setEnviando(true);
    try {
      await apiClient.post('/promoter/support', { message: `🏠 A Casa · ${rotulo.emoji} ${rotulo.rotulo}\n${t}` });
      setTexto('');
      onFechar();
      toast({ title: 'Valeu! 🔥', description: 'Sua mensagem chegou na equipe. Se precisar, a resposta aparece no Suporte.' });
    } catch {
      toast({ title: 'Não foi possível enviar agora.', variant: 'destructive' });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="z-[9996] max-w-sm">
        <DialogHeader><DialogTitle>💬 Fale com a gente sobre A Casa</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">O que está achando? Sugestões de brincadeiras, salas, músicas ou qualquer coisa que não funcionou. A equipe lê tudo.</p>
        <div className="grid grid-cols-3 gap-2">
          {TIPOS.map((x) => (
            <button key={x.id} type="button" onClick={() => setTipo(x.id)}
              className={cn('rounded-xl border px-2 py-2 text-xs font-semibold', tipo === x.id ? 'border-rose-500 bg-rose-500/15' : 'border-border')}>
              <span className="block text-lg">{x.emoji}</span>{x.rotulo}
            </button>
          ))}
        </div>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={1000}
          rows={4}
          placeholder={tipo === 'problema' ? 'Conta o que aconteceu e em qual sala…' : tipo === 'gostei' ? 'O que você mais curtiu?' : 'Qual a sua ideia para A Casa?'}
          className="w-full rounded-xl border bg-background px-3 py-2 text-base"
        />
        <Button className="w-full bg-gradient-to-r from-rose-600 to-fuchsia-600" disabled={enviando} onClick={() => void enviar()}>
          {enviando ? 'Enviando…' : 'Enviar'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

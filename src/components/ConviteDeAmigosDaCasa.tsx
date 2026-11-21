import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Share2 } from 'lucide-react';
import apiClient from '@/utils/apiClient';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

/**
 * Cartão "Chama a galera pra Casa" (21/11/2026): abre em destaque depois de 5 min
 * na Casa (uma vez por noite) e pelo botão ➕ Convidar. O link /acasa?invite=… não
 * mostra nome nem foto de quem convidou, então dá para postar em grupo e Instagram.
 * Amigo novo que entra na Casa pelo link dá +20 tokens; promotor ganha comissão.
 */
type MeuConvite = { link: string; promotor: boolean; dePortugal: boolean; tokensPorAmigo: number };

export const CHAVE_CONVITE_NUNCA = 'nosigilo:casa-convite-amigos-nunca';

export default function ConviteDeAmigosDaCasa({ aberto, onFechar, automatico }: { aberto: boolean; onFechar: () => void; automatico: boolean }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [dados, setDados] = useState<MeuConvite | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (!aberto || dados) return;
    let vivo = true;
    apiClient.get('/casa/meu-convite')
      .then(({ data }) => { if (vivo) setDados(data as MeuConvite); })
      .catch(() => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, [aberto, dados]);

  const texto = dados ? `Bora pra Casa comigo? 🔥 A festa online do NoSigilo está rolando agora:\n${dados.link}` : '';

  const copiar = async () => {
    if (!dados) return;
    try { await navigator.clipboard.writeText(texto); toast({ title: 'Link copiado! Cola no grupo ou no seu Instagram 😉' }); }
    catch { toast({ title: 'Não foi possível copiar. Segure no link para copiar.', variant: 'destructive' }); }
  };
  const compartilhar = async () => {
    if (!dados) return;
    if (!navigator.share) { await copiar(); return; }
    try { await navigator.share({ text: texto }); }
    catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) await copiar(); }
  };
  const naoMostrarMais = () => {
    try { localStorage.setItem(CHAVE_CONVITE_NUNCA, '1'); } catch { /* modo restrito */ }
    onFechar();
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="z-[9999] max-w-sm border-rose-500/40">
        <DialogHeader>
          <DialogTitle className="text-xl">🔥 Chama a galera pra Casa!</DialogTitle>
          <DialogDescription>
            Manda o seu link no grupo do WhatsApp ou no seu Instagram. <b>O link não mostra seu nome nem sua foto.</b>
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2.5 text-sm">
          🎁 <b>+{dados?.tokensPorAmigo ?? 20} tokens</b> para cada amigo novo que entrar n'A Casa hoje pelo seu link.
        </div>

        {erro && <p className="text-sm text-destructive">Não foi possível gerar o seu link agora. Tente de novo daqui a pouco.</p>}
        {!erro && (
          <div className="space-y-2">
            <p className="truncate rounded-lg bg-secondary/60 px-3 py-2 text-xs text-muted-foreground" aria-label="Seu link">
              {dados ? dados.link : 'Gerando o seu link…'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={!dados} onClick={() => void compartilhar()}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-fuchsia-600 text-sm font-semibold text-white disabled:opacity-50">
                <Share2 className="h-4 w-4" /> Compartilhar
              </button>
              <button type="button" disabled={!dados} onClick={() => void copiar()}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold disabled:opacity-50">
                <Copy className="h-4 w-4" /> Copiar link
              </button>
            </div>
          </div>
        )}

        {dados && !dados.dePortugal && (dados.promotor ? (
          <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
            💰 Você é promotor: quem assinar pelo seu link vira comissão no seu Pix do dia 01.
          </p>
        ) : (
          <button type="button" onClick={() => { onFechar(); navigate('/ganhe'); }}
            className="w-full rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-left text-xs">
            💰 <b>Quer ganhar dinheiro todo mês?</b> Vire promotor: 20% de cada assinatura e renovação de quem você trouxer. <span className="font-semibold underline">Quero ser promotor</span>
          </button>
        ))}

        {automatico && (
          <button type="button" onClick={naoMostrarMais} className="mx-auto block text-[11px] text-muted-foreground underline-offset-2 hover:underline">
            Não mostrar mais este convite
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}

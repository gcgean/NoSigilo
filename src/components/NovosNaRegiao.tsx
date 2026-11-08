import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { chatService, matchService, regiaoService, type PerfilNovoNaRegiao } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { resolveServerUrl } from '@/utils/serverUrl';
import { textoDistancia } from '@/utils/distancia';
import { getUserProfileHref } from '@/utils/userProfileNavigation';
import { cn } from '@/lib/utils';

/**
 * Aba "Na região" do Chat: perfis que entraram nos últimos 7 dias na cidade
 * de quem olha (ou até 50 km). O aviso diário das 19h30 abre aqui.
 *
 * "Dar boas-vindas" abre um texto pronto e editável e manda pelo caminho
 * normal de mensagem (vale plano, pedidos de contato e privacidade de quem
 * recebe), marcado como boas-vindas para o servidor aplicar os limites:
 * 1 por perfil, 5 por dia, e o perfil novo sai da lista depois de 10.
 */
type Props = {
  viewerId?: string;
  premiumAccess: boolean;
  /** Abre a conversa recém-criada (o Chat recarrega a lista antes). */
  onAbrirConversa: (conversationId: string) => void;
};

function textoPronto(p: PerfilNovoNaRegiao, cidade: string | null) {
  const g = String(p.gender || '');
  const saudacao = g === 'Casal (Ela/Ela)'
    ? 'Oi, sejam bem-vindas'
    : g.startsWith('Casal')
    ? 'Oi, sejam bem-vindos'
    : g === 'Mulher'
    ? 'Oi, seja bem-vinda'
    : g === 'Homem'
    ? 'Oi, seja bem-vindo'
    : 'Oi, seja bem-vindo(a)';
  const mesmaCidade = cidade && p.city && cidade.trim().toLowerCase() === p.city.trim().toLowerCase();
  const plural = g.startsWith('Casal');
  const ponte = mesmaCidade
    ? `Vi que ${plural ? 'vocês também são' : 'você também é'} de ${p.city} 😊`
    : `Vi que ${plural ? 'vocês estão' : 'você está'} aqui pertinho 😊`;
  return `${saudacao} ao NoSigilo! ${ponte}`;
}

export default function NovosNaRegiao({ viewerId, premiumAccess, onAbrirConversa }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [perfis, setPerfis] = useState<PerfilNovoNaRegiao[] | null>(null);
  const [cidade, setCidade] = useState<string | null>(null);
  const [restantes, setRestantes] = useState(5);
  const [erro, setErro] = useState(false);
  const [escrevendoPara, setEscrevendoPara] = useState<PerfilNovoNaRegiao | null>(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [curtindo, setCurtindo] = useState<string | null>(null);

  const carregar = () => {
    setErro(false);
    regiaoService
      .novos()
      .then((r) => {
        setPerfis(r.perfis);
        setCidade(r.cidade);
        setRestantes(r.boasVindasRestantesHoje);
      })
      .catch(() => {
        setErro(true);
        setPerfis([]);
      });
  };
  useEffect(carregar, []);

  const marcar = (id: string, campos: Partial<PerfilNovoNaRegiao>) =>
    setPerfis((prev) => (prev ?? []).map((p) => (p.id === id ? { ...p, ...campos } : p)));

  const abrirBoasVindas = (p: PerfilNovoNaRegiao) => {
    if (!premiumAccess) { navigate('/subscriptions'); return; }
    setTexto(textoPronto(p, cidade));
    setEscrevendoPara(p);
  };

  const enviar = async () => {
    const p = escrevendoPara;
    const conteudo = texto.trim();
    if (!p || !conteudo || enviando) return;
    setEnviando(true);
    try {
      const conv = await chatService.createConversation(p.id);
      if (!conv?.id) throw new Error('sem conversa');
      await chatService.sendMessage(conv.id, { content: conteudo, boasVindas: true });
      marcar(p.id, { boasVindasEnviada: true });
      setRestantes((n) => Math.max(0, n - 1));
      setEscrevendoPara(null);
      // Mesma regra de qualquer conversa nova: se o perfil só recebe direto de
      // certos tipos (Configurações › pedidos de mensagem), vai como pedido.
      // Envio normal não avisa nada: a conversa abre e a mensagem já está lá.
      if (conv.pedido) toast({ title: 'Boas-vindas enviada como pedido 👋', description: `${p.name} vê nos Pedidos de mensagem e decide se aceita.` });
      onAbrirConversa(String(conv.id));
    } catch (err: any) {
      const codigo = err?.response?.data?.error;
      if (codigo === 'premium_required') { navigate('/subscriptions'); return; }
      toast({
        title: 'Não deu para enviar',
        description: err?.response?.data?.message || 'Tente novamente em instantes.',
        variant: 'destructive',
      });
      if (codigo === 'boas_vindas_limite') setEscrevendoPara(null);
    } finally {
      setEnviando(false);
    }
  };

  const curtir = async (p: PerfilNovoNaRegiao) => {
    if (curtindo || p.curtido) return;
    setCurtindo(p.id);
    try {
      const r = await matchService.like(p.id);
      marcar(p.id, { curtido: true });
      toast(r?.mutual
        ? { title: '💞 É um match!', description: `Você e ${p.name} se curtiram.` }
        : { title: '💜 Curtida enviada!', description: `${p.name} foi avisado(a).` });
    } catch {
      toast({ title: 'Não foi possível curtir', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setCurtindo(null);
    }
  };

  if (perfis === null) {
    return <div className="flex justify-center py-8"><div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" /></div>;
  }

  return (
    <div className="flex-1 overflow-y-auto overscroll-y-contain p-3" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
      <p className="mb-3 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2.5 text-[13px] leading-snug text-foreground/85">
        Perfis que entraram nos últimos 7 dias {cidade ? `em ${cidade} ou perto` : 'perto de você'} e combinam com o que você procura.
        {' '}Quem chega e é bem recebido fica.{' '}
        <strong className="font-semibold text-primary">{restantes > 0 ? `Você pode dar mais ${restantes} boas-vindas hoje.` : 'Suas boas-vindas de hoje acabaram — amanhã tem mais.'}</strong>
      </p>

      {erro ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          Não deu para carregar agora.
          <div className="mt-3"><Button size="sm" variant="outline" onClick={carregar}>Tentar de novo</Button></div>
        </div>
      ) : perfis.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          Ninguém novo por perto nos últimos 7 dias. Assim que alguém da sua região entrar, aparece aqui.
        </p>
      ) : (
        <ul className="space-y-2">
          {perfis.map((p) => {
            const distancia = textoDistancia(p.distanceKm, { cidade: p.city });
            const entrou = formatDistanceToNowStrict(new Date(p.createdAt), { locale: ptBR, addSuffix: true });
            return (
              <li key={p.id} className="flex items-center gap-3 rounded-2xl border p-2.5">
                <Link to={getUserProfileHref(p.id, viewerId, '/chat?aba=regiao')} className="shrink-0">
                  <img src={resolveServerUrl(p.avatar)} alt="" width={56} height={56} className="h-14 w-14 rounded-full object-cover" />
                </Link>
                <Link to={getUserProfileHref(p.id, viewerId, '/chat?aba=regiao')} className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{[p.gender, distancia].filter(Boolean).join(' · ')}</span>
                  <span className="block text-[11px] text-primary">Entrou {entrou}</span>
                </Link>
                <div className="flex shrink-0 flex-col items-stretch gap-1.5">
                  <Button
                    size="sm"
                    className="h-8 rounded-full px-3 text-xs"
                    variant={p.boasVindasEnviada ? 'outline' : 'default'}
                    disabled={p.boasVindasEnviada || (restantes <= 0 && premiumAccess)}
                    onClick={() => abrirBoasVindas(p)}
                  >
                    {p.boasVindasEnviada ? 'Enviado ✓' : '👋 Boas-vindas'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className={cn('h-8 gap-1 rounded-full px-3 text-xs', p.curtido && 'border-pink-400/40 text-pink-500')}
                    disabled={p.curtido || curtindo === p.id}
                    onClick={() => void curtir(p)}
                  >
                    <Heart className={cn('h-3.5 w-3.5', p.curtido && 'fill-current')} />
                    {p.curtido ? 'Curtido' : 'Curtir'}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!escrevendoPara} onOpenChange={(aberto) => { if (!aberto && !enviando) setEscrevendoPara(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Dar boas-vindas a {escrevendoPara?.name}</DialogTitle>
          <DialogDescription>Pode mudar o texto antes de enviar. A conversa abre em seguida.</DialogDescription>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={500}
            rows={4}
            className="w-full resize-none rounded-xl border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" disabled={enviando} onClick={() => setEscrevendoPara(null)}>Cancelar</Button>
            <Button disabled={enviando || !texto.trim()} onClick={() => void enviar()}>{enviando ? 'Enviando...' : 'Enviar 👋'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

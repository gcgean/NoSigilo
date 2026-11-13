import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { chatService, matchService, regiaoService, type PerfilNovoNaRegiao } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { resolveServerUrl } from '@/utils/serverUrl';
import { textoDistancia } from '@/utils/distancia';
import { getUserProfileHref } from '@/utils/userProfileNavigation';
import { cn } from '@/lib/utils';

/**
 * Aba "Na região" do Chat: perfis que entraram nos últimos 7 dias na cidade
 * de quem olha (ou até 50 km). O aviso diário das 19h30 abre aqui.
 *
 * "Boas-vindas" manda um texto pronto com um toque, sem abrir o chat e sem
 * aviso na tela (pedido do dono, 10/11/2026): o botão vira "Enviado ✓". Vai
 * pelo caminho normal de mensagem (plano, pedidos de contato e privacidade de
 * quem recebe), marcado como boas-vindas para o servidor aplicar as regras:
 * 1 por perfil, sem limite diário, e o perfil novo sai da lista depois de 10.
 * Se o perfil não procura o tipo de quem manda, vai como pedido de mensagem;
 * se ele não aceita esse tipo, o motivo aparece no próprio cartão.
 */
type Props = {
  viewerId?: string;
  premiumAccess: boolean;
  /** Boas-vindas enviada: o Chat recarrega a lista de conversas em silêncio. */
  onEnviada?: () => void;
};

type Situacao = { tipo: 'enviado'; pedido: boolean } | { tipo: 'recusado'; motivo: string };

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

export default function NovosNaRegiao({ viewerId, premiumAccess, onEnviada }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [perfis, setPerfis] = useState<PerfilNovoNaRegiao[] | null>(null);
  const [cidade, setCidade] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  const [enviandoPara, setEnviandoPara] = useState<string | null>(null);
  const [situacao, setSituacao] = useState<Record<string, Situacao>>({});
  const [curtindo, setCurtindo] = useState<string | null>(null);

  const carregar = () => {
    setErro(false);
    regiaoService
      .novos()
      .then((r) => {
        setPerfis(r.perfis);
        setCidade(r.cidade);
      })
      .catch(() => {
        setErro(true);
        setPerfis([]);
      });
  };
  useEffect(carregar, []);

  const marcar = (id: string, campos: Partial<PerfilNovoNaRegiao>) =>
    setPerfis((prev) => (prev ?? []).map((p) => (p.id === id ? { ...p, ...campos } : p)));
  const definirSituacao = (id: string, s: Situacao) => setSituacao((prev) => ({ ...prev, [id]: s }));

  const motivoRecusa = (mensagem: string | undefined) => {
    // "recebe novos contatos apenas dos tipos de perfil selecionados" = o perfil
    // fechou a porta para o tipo de quem manda.
    if (!mensagem || /tipos de perfil/i.test(mensagem)) {
      const meuTipo = String(user?.gender || '').trim();
      return `Esse perfil não aceita mensagens de ${meuTipo || 'seu tipo de perfil'} por não ser o que procura.`;
    }
    return mensagem;
  };

  const darBoasVindas = async (p: PerfilNovoNaRegiao) => {
    if (!premiumAccess) { navigate('/subscriptions'); return; }
    if (enviandoPara || p.boasVindasEnviada || situacao[p.id]) return;
    setEnviandoPara(p.id);
    try {
      const conv = await chatService.createConversation(p.id, { boasVindas: true });
      if (!conv?.id) throw new Error('sem conversa');
      await chatService.sendMessage(conv.id, { content: textoPronto(p, cidade), boasVindas: true });
      marcar(p.id, { boasVindasEnviada: true });
      definirSituacao(p.id, { tipo: 'enviado', pedido: !!conv.pedido });
      onEnviada?.();
    } catch (err: any) {
      const codigo = err?.response?.data?.error;
      const mensagem = err?.response?.data?.message as string | undefined;
      if (codigo === 'premium_required') { navigate('/subscriptions'); return; }
      if (codigo === 'message_not_allowed') {
        definirSituacao(p.id, { tipo: 'recusado', motivo: motivoRecusa(mensagem) });
        return;
      }
      if (codigo === 'boas_vindas_limite') {
        if (mensagem && /já deu boas-vindas/.test(mensagem)) marcar(p.id, { boasVindasEnviada: true });
        else definirSituacao(p.id, { tipo: 'recusado', motivo: mensagem || 'Não dá para dar boas-vindas a esse perfil agora.' });
        return;
      }
      toast({ title: 'Não deu para enviar', description: mensagem || 'Tente novamente em instantes.', variant: 'destructive' });
    } finally {
      setEnviandoPara(null);
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
        Perfis novos (últimos 7 dias) {cidade ? `de ${cidade}, de perto e do seu estado` : 'perto de você'} que combinam com o que você procura e que você ainda não chamou.
        {' '}Quem chega e é bem recebido fica.{' '}
        <strong className="font-semibold text-primary">Toque em Boas-vindas para mandar um oi pronto.</strong>
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
            const sit = situacao[p.id];
            const recusado = sit?.tipo === 'recusado';
            return (
              <li key={p.id} className="rounded-2xl border p-2.5">
               <div className="flex items-center gap-3">
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
                    variant={p.boasVindasEnviada || recusado ? 'outline' : 'default'}
                    disabled={p.boasVindasEnviada || recusado || enviandoPara === p.id}
                    onClick={() => void darBoasVindas(p)}
                  >
                    {p.boasVindasEnviada ? 'Enviado ✓' : recusado ? 'Não aceita' : enviandoPara === p.id ? 'Enviando...' : '👋 Boas-vindas'}
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
               </div>
                {sit?.tipo === 'recusado' && (
                  <p className="mt-2 rounded-lg bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">{sit.motivo}</p>
                )}
                {sit?.tipo === 'enviado' && sit.pedido && (
                  <p className="mt-2 px-1 text-[11px] text-muted-foreground">Foi para os pedidos de mensagem desse perfil.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

    </div>
  );
}

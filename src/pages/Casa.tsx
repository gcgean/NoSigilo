import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Camera, Crown, Lock, Send, Users, X } from 'lucide-react';
import apiClient from '@/utils/apiClient';
import { resolveServerUrl } from '@/utils/serverUrl';
import { useSocket } from '@/contexts/SocketContext';
import { useAuth } from '@/contexts/AuthContext';
import { enablePushNotifications } from '@/utils/pushNotifications';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import BrandLogo from '@/components/BrandLogo';
import { ToastAction } from '@/components/ui/toast';
import RadioDaCasa from '@/components/RadioDaCasa';
import RankingDaCasa from '@/components/RankingDaCasa';
import CabineDaCasa from '@/components/CabineDaCasa';
import EfeitoDaCasa, { temEfeito } from '@/components/EfeitoDaCasa';
import { profileService } from '@/services/api';
import PerfilNaCasa from '@/components/PerfilNaCasa';
import ProtecaoDaCasa from '@/components/ProtecaoDaCasa';
import MapaDaCasa, { type CabineDoMapa } from '@/components/MapaDaCasa';
import TokenBadge from '@/components/TokenBadge';
import ComprarTokens from '@/components/ComprarTokens';
import FeedbackDaCasa from '@/components/FeedbackDaCasa';

/**
 * A Casa — boate virtual de sexta (21h) e sábado (22h), até 1h (backend: casa.ts).
 * Lobby com as salas; dentro da sala: chat ao vivo, quem está lá, brincadeiras
 * da Lola (anfitriã IA) e convite para a cabine (conversa a dois com aceite).
 */

type Categoria = 'homem' | 'mulher' | 'casal' | 'outros';
type SalaResumo = {
  id: string; nome: string; emoji: string; descricao: string; nivel: 'quente' | 'muito_quente';
  total: number; espiando: number; contagem: Record<Categoria, number>;
  bloqueadaParaMim: boolean; lotadaParaMim: boolean; posicaoNaFila: number | null;
  trancada?: boolean; faltamParaAbrir?: number;
  pessoas?: Categoria[]; cabines?: CabineDoMapa[];
};
type Info = {
  aberta: boolean; tema: { nome: string; descricao: string } | null; horario: string;
  souAdmin: boolean; podeFalar: boolean; teste?: boolean; abertaAte: string | null; salas: SalaResumo[];
  reservado: boolean; reservas: number; proximaAbertura: string | null;
};
type DrinkRecebido = { de: { id: string; nome: string; avatar: string | null; cat: Categoria }; drink: string; tokens: number; mensagem?: string };
type Pessoa = { id: string; nome: string; avatar: string | null; cat: Categoria; querBrincar: boolean; rei?: boolean; pulseira?: Pulseira | null; cidade?: string | null };
type Msg = { id: string; tipo: 'pessoa' | 'lola' | 'sistema' | 'midia'; autor?: { id: string; nome: string; avatar: string | null; cat: Categoria }; texto: string; criadoEm: string; midia?: { tipo: 'foto' | 'video'; preco?: number; livre?: boolean }; resposta?: { id: string; nome: string; trecho: string }; reacoes?: Record<string, string[]>; jogoId?: string; efeito?: string };
const REACOES = ['🔥', '😈', '💦', '🍑', '🍆', '😍', '👀', '💋'];
type Jogo = {
  id: string; tipo: 'enquete' | 'eu_nunca' | 'quiz' | 'vd' | 'match' | 'foto' | 'duelo' | 'relampago'; fimEm: string;
  fase?: 'fotos' | 'votacao'; jaEnviei?: boolean; vencedorNome?: string | null; cumpriram?: number; quem?: 'todos' | 'casal';
  texto?: string; opcoes?: string[]; meuVoto?: number | string | null; votos?: number[] | null; total?: number;
  alvoNome?: string; souAlvo?: boolean;
  aNome?: string; bNome?: string; souParte?: boolean; jaRespondi?: boolean;
};
type Estado = {
  sala: { id: string; nome: string; emoji: string; descricao: string; nivel: string };
  mensagens: Msg[]; presentes: Pessoa[]; espiando: number; jogo: Jogo | null;
  eu: { podeFalar: boolean; querBrincar: boolean; espiando: boolean; pulseira: Pulseira | null; idPublico: string | null; revelado: boolean };
  sala_anonima?: boolean;
  midiasVistas: string[];
};
type Convite = { id: string; de: { id: string; nome: string; avatar: string | null; cat: Categoria }; sala: string };

type Pulseira = 'verde' | 'amarela' | 'roxa' | 'vermelha';
// Pulseiras da noite, como nas casas de swing de verdade.
const PULSEIRAS: { cor: Pulseira; emoji: string; titulo: string; descricao: string; classe: string }[] = [
  { cor: 'verde', emoji: '🟢', titulo: 'Aberto(a) a tudo', descricao: 'Troca, ménage, o que rolar com química', classe: 'bg-emerald-500' },
  { cor: 'amarela', emoji: '🟡', titulo: 'Só soft', descricao: 'Beijos, carícias e provocação', classe: 'bg-amber-400' },
  { cor: 'roxa', emoji: '🟣', titulo: 'Single é bem-vindo', descricao: 'Casal ou mulher aberta a um single', classe: 'bg-violet-500' },
  { cor: 'vermelha', emoji: '🔴', titulo: 'Só olhando hoje', descricao: 'Voyeur: curtir o clima sem participar', classe: 'bg-rose-600' },
];
const corDaPulseira = (c?: Pulseira | null) => PULSEIRAS.find((x) => x.cor === c);
const DRINKS = [
  { id: 'cerveja', emoji: '🍺', nome: 'Cerveja', tokens: 3 },
  { id: 'caipirinha', emoji: '🍹', nome: 'Caipirinha', tokens: 5 },
  { id: 'gin', emoji: '🍸', nome: 'Gin tônica', tokens: 8 },
  { id: 'champanhe', emoji: '🍾', nome: 'Champanhe', tokens: 15 },
];

// Cada sala fica mais quente que a anterior: do roxo do salão ao vermelho-sangue do glory hole.
const TEMA_DA_SALA: Record<string, { card: string; botao: string; foco1: string; foco2: string; fundo: string; chamas: string; selo: string }> = {
  salao: { card: 'bg-gradient-to-br from-fuchsia-950/70 to-purple-950/60 ring-fuchsia-500/30', botao: 'bg-gradient-to-r from-fuchsia-600 to-purple-600', foco1: 'bg-fuchsia-600/25', foco2: 'bg-purple-600/20', fundo: 'bg-zinc-950', chamas: '🔥', selo: 'AQUECENDO' },
  casais: { card: 'bg-gradient-to-br from-rose-950/80 to-pink-950/60 ring-rose-500/40', botao: 'bg-gradient-to-r from-rose-600 to-pink-600', foco1: 'bg-rose-600/30', foco2: 'bg-pink-600/25', fundo: 'bg-zinc-950', chamas: '🔥🔥', selo: 'QUENTE' },
  quarto: { card: 'bg-gradient-to-br from-red-950/90 to-rose-950/80 ring-red-600/50', botao: 'bg-gradient-to-r from-red-700 to-rose-700', foco1: 'bg-red-700/35', foco2: 'bg-rose-900/40', fundo: 'bg-black', chamas: '🔥🔥🔥', selo: 'MUITO QUENTE' },
  cuckold: { card: 'bg-gradient-to-br from-amber-950/80 to-red-950/90 ring-amber-500/50 shadow-[0_0_24px_rgba(245,158,11,0.25)]', botao: 'bg-gradient-to-r from-amber-600 to-red-700', foco1: 'bg-amber-600/30', foco2: 'bg-red-800/40', fundo: 'bg-black', chamas: '🔥🔥🔥', selo: 'HOMENS LIBERADOS' },
  glory: { card: 'bg-gradient-to-br from-black to-red-950 ring-red-500/70 shadow-[0_0_30px_rgba(220,38,38,0.35)]', botao: 'bg-gradient-to-r from-red-800 to-black ring-1 ring-red-500', foco1: 'bg-red-600/40', foco2: 'bg-red-900/50', fundo: 'bg-black', chamas: '🔥🔥🔥🔥', selo: 'PROIBIDÃO' },
};
const temaDaSala = (id: string) => TEMA_DA_SALA[id] ?? TEMA_DA_SALA.salao;

const ROTULO_CAT: Record<Categoria, string> = { casal: 'Casal', mulher: 'Mulher', homem: 'Homem', outros: 'Perfil' };
const COR_CAT: Record<Categoria, string> = {
  casal: 'ring-fuchsia-500', mulher: 'ring-rose-500', homem: 'ring-sky-500', outros: 'ring-amber-500',
};

const erroDe = (e: unknown, padrao: string) => (e as any)?.response?.data?.message || padrao;

function Avatar({ p, tamanho = 'h-10 w-10' }: { p: { nome: string; avatar: string | null; cat: Categoria }; tamanho?: string }) {
  // Mulher em destaque: moldura dourada brilhando e um 💋 no canto (é quem mais atrai a sala).
  const destaque = p.cat === 'mulher';
  return (
    <div className={cn('relative shrink-0', tamanho)}>
      <div className={cn('h-full w-full overflow-hidden rounded-full ring-2 ring-offset-2 ring-offset-background',
        destaque ? 'ring-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.75)]' : COR_CAT[p.cat])}>
        {p.avatar
          ? <img src={resolveServerUrl(p.avatar)} alt={p.nome} className="h-full w-full object-cover" />
          : <div className="flex h-full w-full items-center justify-center bg-secondary text-xs font-bold">{p.nome.charAt(0)}</div>}
      </div>
      {destaque && <span className="absolute -right-1 -top-1 text-[0.7em] leading-none drop-shadow">💋</span>}
    </div>
  );
}

// Som curto + vibração para avisos da Casa. Só toca para quem permitiu notificações.
function tocarAviso(forte: boolean) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') return;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      const notas = forte ? [880, 1175, 1568] : [988];
      notas.forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        const t0 = ctx.currentTime + i * 0.12;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(forte ? 0.25 : 0.12, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
        o.connect(g); g.connect(ctx.destination);
        o.start(t0); o.stop(t0 + 0.2);
      });
      setTimeout(() => { void ctx.close().catch(() => {}); }, 1000);
    }
    navigator.vibrate?.(forte ? [120, 60, 120, 60, 200] : 80);
  } catch { /* sem som */ }
}

const chavePulseira = () => `nosigilo:casa-pulseira:${new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10)}`;

function useSegundosAte(iso?: string) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    if (!iso) return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [iso]);
  return iso ? Math.max(0, Math.round((Date.parse(iso) - agora) / 1000)) : 0;
}

function CartaoDoJogo({ jogo, podeFalar, onJogar, onCamera }: { jogo: Jogo; podeFalar: boolean; onJogar: (valor: unknown) => void; onCamera: () => void }) {
  const segundos = useSegundosAte(jogo.fimEm);
  const titulo = {
    enquete: '📊 Enquete', eu_nunca: '🍷 Eu nunca', quiz: '🎓 Quiz liberal', vd: '🎲 Verdade ou desafio', match: '💘 Match às cegas',
    foto: '📸 Desafio da foto', duelo: '🔥 Duelo', relampago: '⚡ Desafio relâmpago',
  }[jogo.tipo];
  const camera = (rotulo: string) => (
    <Button size="sm" className="w-full bg-rose-600 hover:bg-rose-500" disabled={!podeFalar} onClick={onCamera}>
      <Camera className="mr-1.5 h-4 w-4" />{rotulo}
    </Button>
  );
  return (
    <div className="mx-3 my-2 rounded-2xl border border-fuchsia-500/40 bg-gradient-to-br from-fuchsia-950/80 to-rose-950/80 p-3 text-white shadow-lg">
      <div className="mb-1 flex items-center justify-between text-xs font-semibold text-fuchsia-200">
        <span>{titulo}</span>
        <span className="tabular-nums">{segundos}s</span>
      </div>
      {jogo.texto && <p className="mb-2 text-sm font-medium leading-snug">{jogo.texto}</p>}

      {(jogo.tipo === 'enquete' || jogo.tipo === 'eu_nunca' || jogo.tipo === 'quiz') && jogo.opcoes && (
        <div className="grid gap-1.5">
          {jogo.opcoes.map((o, i) => {
            const votos = jogo.votos?.[i] ?? 0;
            const pct = jogo.total ? Math.round((votos / jogo.total) * 100) : 0;
            // Enquete e "eu nunca": o resultado parcial aparece para todos, ao vivo.
            const mostrar = jogo.tipo !== 'quiz' && (jogo.total ?? 0) > 0;
            const escolhido = jogo.meuVoto === i;
            return (
              <button
                key={i}
                type="button"
                disabled={!podeFalar || (jogo.tipo === 'quiz' && jogo.meuVoto != null)}
                onClick={() => onJogar(i)}
                className={cn(
                  'relative overflow-hidden rounded-xl border px-3 py-2 text-left text-sm transition active:scale-[0.98] disabled:opacity-70',
                  escolhido ? 'border-white bg-white/20' : 'border-white/20 bg-white/5 hover:bg-white/10',
                )}
              >
                {mostrar && <span className="absolute inset-y-0 left-0 bg-fuchsia-500/30" style={{ width: `${pct}%` }} />}
                <span className="relative flex justify-between gap-2">
                  <span>{o}</span>
                  {mostrar && <span className="tabular-nums text-white/80">{pct}%</span>}
                </span>
              </button>
            );
          })}
          {jogo.tipo === 'quiz' && jogo.meuVoto != null && <p className="text-xs text-white/70">Resposta enviada! Aguarde o resultado…</p>}
        </div>
      )}

      {jogo.tipo === 'vd' && (jogo.souAlvo ? (
        <div className="grid grid-cols-3 gap-2">
          <Button size="sm" className="bg-sky-600 hover:bg-sky-500" onClick={() => onJogar('verdade')}>Verdade</Button>
          <Button size="sm" className="bg-rose-600 hover:bg-rose-500" onClick={() => onJogar('desafio')}>Desafio</Button>
          <Button size="sm" variant="outline" className="border-white/30 bg-transparent text-white" onClick={() => onJogar('passo')}>Passo</Button>
        </div>
      ) : (
        <p className="text-sm text-white/80">A vez é de <b>{jogo.alvoNome}</b>… verdade, desafio ou passa? 😈</p>
      ))}

      {jogo.tipo === 'foto' && (jogo.souAlvo ? (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          {camera('Abrir câmera e cumprir')}
          <Button size="sm" variant="outline" className="border-white/30 bg-transparent text-white" onClick={() => onJogar('passo')}>Passo</Button>
        </div>
      ) : (
        <p className="text-sm text-white/80">Esperando <b>{jogo.alvoNome}</b> cumprir… a sala torce 🔥</p>
      ))}

      {jogo.tipo === 'duelo' && (jogo.fase === 'fotos' ? (
        jogo.souParte && !jogo.jaEnviei ? camera('Mandar minha foto do duelo') : (
          <p className="text-sm text-white/80"><b>{jogo.aNome}</b> x <b>{jogo.bNome}</b>: esperando as fotos chegarem…</p>
        )
      ) : jogo.souParte ? (
        <p className="text-sm text-white/80">A sala está votando em você 👀 ({jogo.total ?? 0} votos)</p>
      ) : (
        <div>
          <p className="mb-2 text-xs text-white/70">Abra as duas fotos no chat (1 vez cada) e vote:</p>
          <div className="grid grid-cols-2 gap-2">
            {(['a', 'b'] as const).map((lado) => (
              <Button
                key={lado}
                size="sm"
                disabled={!podeFalar}
                onClick={() => onJogar(lado)}
                className={cn(jogo.meuVoto === lado ? 'bg-white text-rose-700 hover:bg-white' : 'bg-rose-600 hover:bg-rose-500')}
              >
                {lado === 'a' ? jogo.aNome : jogo.bNome}
              </Button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-white/60">{jogo.total ?? 0} voto(s)</p>
        </div>
      ))}

      {jogo.tipo === 'relampago' && (
        <div className="space-y-1.5">
          {jogo.vencedorNome && <p className="text-xs text-amber-200">⚡ {jogo.vencedorNome} levou os tokens · {jogo.cumpriram} cumpriram</p>}
          {jogo.jaEnviei ? <p className="text-sm text-white/80">Você cumpriu! 🔥</p> : camera(jogo.quem === 'casal' ? 'Cumprir agora (só casais)' : 'Cumprir agora')}
        </div>
      )}

      {jogo.tipo === 'match' && (jogo.souParte && !jogo.jaRespondi ? (
        <div>
          <p className="mb-2 text-sm">{jogo.aNome} e {jogo.bNome}: topam ir pra cabine?</p>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" className="bg-rose-600 hover:bg-rose-500" onClick={() => onJogar('sim')}>Topo 🔥</Button>
            <Button size="sm" variant="outline" className="border-white/30 bg-transparent text-white" onClick={() => onJogar('nao')}>Agora não</Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-white/80">{jogo.aNome} e {jogo.bNome} estão decidindo se vão pra cabine 👀</p>
      ))}
    </div>
  );
}

function ContagemRegressiva({ alvo }: { alvo: string | null }) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!alvo) return <p className="text-sm text-white/70">Sexta às 21h e sábado às 22h.</p>;
  const seg = Math.max(0, Math.floor((Date.parse(alvo) - agora) / 1000));
  const partes: [string, number][] = [['dias', Math.floor(seg / 86400)], ['h', Math.floor((seg % 86400) / 3600)], ['min', Math.floor((seg % 3600) / 60)], ['seg', seg % 60]];
  return (
    <>
      <p className="text-sm text-white/70">A próxima noite começa em</p>
      <div className="mt-2 flex justify-center gap-3 font-black tabular-nums">
        {partes.map(([r, v]) => (
          <div key={r} className="w-16 rounded-xl bg-black/40 py-2">
            <p className="text-2xl">{String(v).padStart(2, '0')}</p>
            <p className="text-[10px] font-normal text-white/60">{r}</p>
          </div>
        ))}
      </div>
    </>
  );
}

export default function Casa() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { on, off } = useSocket();
  const [info, setInfo] = useState<Info | null>(null);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [entrando, setEntrando] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [pessoaAberta, setPessoaAberta] = useState<Pessoa | null>(null);
  const [perfilAberto, setPerfilAberto] = useState<string | null>(null);
  const [respondendo, setRespondendo] = useState<Msg | null>(null);
  const [motivoCruzado, setMotivoCruzado] = useState<'olhar' | 'brinde'>('olhar');
  // Quem só espia: depois de 90 s vê o convite para assinar (uma vez por noite).
  const [convitePremium, setConvitePremium] = useState(false);
  // Efeito animado da sala (drink, brinde).
  const [efeito, setEfeito] = useState<{ id: string; efeito: string; texto?: string } | null>(null);
  const fimDoEfeito = useCallback(() => setEfeito(null), []);
  const [perguntaBrincar, setPerguntaBrincar] = useState<string | null>(null);
  const [reagindoEm, setReagindoEm] = useState<string | null>(null);
  const [convite, setConvite] = useState<Convite | null>(null);
  const [enviandoMidia, setEnviandoMidia] = useState<number | null>(null);
  const [tipoEnviando, setTipoEnviando] = useState<'foto' | 'video'>('foto');
  const [escolhendoMidia, setEscolhendoMidia] = useState(false);
  // Envio da sala: visualização única (padrão) ou para todos verem.
  const [midiaUnica, setMidiaUnica] = useState(true);
  const midiaUnicaRef = useRef(true);
  midiaUnicaRef.current = midiaUnica;
  // Mídias "para todos": endereço carregado para mostrar a miniatura na conversa.
  const [urlsLivres, setUrlsLivres] = useState<Record<string, { url: string; mime: string | null }>>({});
  const galeriaRef = useRef<HTMLInputElement | null>(null);
  const [vendo, setVendo] = useState<{ url: string; mime: string | null; msg?: Msg } | null>(null);
  const [comentarioMidia, setComentarioMidia] = useState('');
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const cameraRef = useRef<HTMLInputElement>(null);
  const [revelarAte, setRevelarAte] = useState<number>(0);
  const [escolhendoPulseira, setEscolhendoPulseira] = useState(false);
  const [pulseiraDispensada, setPulseiraDispensada] = useState(false);
  const [mostrandoBar, setMostrandoBar] = useState(false);
  const [recadoDrink, setRecadoDrink] = useState('');
  const [drinkRecebido, setDrinkRecebido] = useState<DrinkRecebido | null>(null);
  const [rankingAberto, setRankingAberto] = useState(false);
  // Central de avisos da Casa (olhadas, drinks, convites, desafios…): sino no topo da sala.
  type NotifCasa = { id: string; emoji: string; texto: string; em: number; acao?: () => void; rotuloAcao?: string; de?: { id: string; nome: string } };
  const [notifs, setNotifs] = useState<NotifCasa[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [avisosAbertos, setAvisosAbertos] = useState(false);
  // Comprar tokens sem sair da Casa (abre sozinho quando o saldo não dá).
  const [comprarAberto, setComprarAberto] = useState(false);
  const [feedbackAberto, setFeedbackAberto] = useState(false);
  // Brincadeira que a pessoa dispensou: o cartão do topo some (ela pode votar na mensagem da Lola).
  const [jogosDispensados, setJogosDispensados] = useState<string[]>([]);
  // Decisão pedida dentro da cabine: abrir a porta, convidar alguém ou aceitar quem pediu para entrar.
  type DecisaoCabine = { cabineId: string; tipo: 'porta' | 'convite' | 'pedido'; nome: string; alvoNome?: string; alvoPublico?: string };
  const [decisao, setDecisao] = useState<DecisaoCabine | null>(null);
  const registrarAviso = (n: Omit<NotifCasa, 'id' | 'em'>) => {
    setNotifs((l) => [{ ...n, id: `${Date.now()}-${Math.random()}`, em: Date.now() }, ...l].slice(0, 40));
    setNaoLidas((x) => x + 1);
  };
  const estadoRef = useRef<typeof estado>(null);
  const abrirPorIdRef = useRef<(id: string, nome: string) => void>(() => {});
  useEffect(() => { estadoRef.current = estado; }, [estado]);
  const [cabineAberta, setCabineAberta] = useState<{ id: string; modo: 'membro' | 'espiar' } | null>(null);
  const cabineAbertaRef = useRef(cabineAberta);
  cabineAbertaRef.current = cabineAberta;
  const [minhasCabines, setMinhasCabines] = useState<string[]>([]);
  const [cabinesAbertas, setCabinesAbertas] = useState<{ id: string; aberta?: boolean; espectadores: number; souMembro: boolean; membros: { id: string; nome: string; avatar: string | null; cat: Categoria }[] }[]>([]);
  const [conviteCabine, setConviteCabine] = useState<{ cabineId: string; membros: string[] } | null>(null);
  const [propondoPara, setPropondoPara] = useState<Pessoa | null>(null);
  const [sugestoes, setSugestoes] = useState<{ texto: string; nivel: string }[]>([]);
  const [textoDesafio, setTextoDesafio] = useState('');
  const [tokensDesafio, setTokensDesafio] = useState(10);
  const [privadoDesafio, setPrivadoDesafio] = useState(false);
  const [propostaRecebida, setPropostaRecebida] = useState<{ id: string; texto: string; tokens: number; privado: boolean; de: { id: string; nome: string; avatar: string | null; cat: Categoria } } | null>(null);
  const [meuDesafio, setMeuDesafio] = useState<{ id: string; texto: string; tokens: number; privado: boolean; deNome: string; prazo: string } | null>(null);
  const propostaDaCamera = useRef<string | null>(null);
  const segundosMeuDesafio = useSegundosAte(meuDesafio?.prazo);
  const [cruzados, setCruzados] = useState<{ id: string; nome: string; avatar: string | null; cat: Categoria } | null>(null);
  const modoRevelacao = useRef(false);
  const segundosRevelacao = useSegundosAte(revelarAte > Date.now() ? new Date(revelarAte).toISOString() : undefined);
  const fimDaLista = useRef<HTMLDivElement>(null);
  const salaAtual = estado?.sala.id ?? null;

  const carregar = useCallback(async () => {
    try { setInfo((await apiClient.get('/casa')).data); } catch { /* tenta de novo no próximo intervalo */ }
  }, []);
  useEffect(() => {
    void carregar();
    // No saguão, o mapa da Casa se atualiza a cada 8 s.
    const t = setInterval(() => { if (!salaAtual) void carregar(); }, 8_000);
    return () => clearInterval(t);
  }, [carregar, salaAtual]);

  const entrar = useCallback(async (salaId: string, silencioso = false) => {
    setEntrando(salaId);
    try {
      const { data } = await apiClient.post(`/casa/${salaId}/entrar`);
      setEstado(data);
      // Logo ao entrar, a Lola pergunta se a pessoa quer participar das brincadeiras.
      const chavePergunta = `nosigilo:casa-brincar:${new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10)}:${salaId}`;
      let jaPerguntou = false;
      try { jaPerguntou = localStorage.getItem(chavePergunta) === '1'; localStorage.setItem(chavePergunta, '1'); } catch { /* modo restrito */ }
      if (!silencioso && !jaPerguntou && data?.eu?.podeFalar && !data?.eu?.querBrincar) setPerguntaBrincar(salaId);
    } catch (e) {
      if ((e as any)?.response?.data?.error === 'lotada_homens') {
        if (!silencioso) toast({ title: 'Cota de homens cheia nesta sala', description: 'Toque em "Entrar na fila" e a gente te chama quando abrir vaga.' });
      } else if (!silencioso) toast({ title: erroDe(e, 'Não foi possível entrar agora.'), variant: 'destructive' });
      setEstado(null);
      void carregar();
    } finally {
      setEntrando(null);
    }
  }, [toast, carregar]);

  const reservar = useCallback(async (reservarLugar = true) => {
    if (reservarLugar && typeof Notification !== 'undefined' && Notification.permission === 'default') void enablePushNotifications().catch(() => {});
    try {
      const { data } = await apiClient.post('/casa/reservar', { reservar: reservarLugar });
      setInfo((i) => i ? { ...i, reservado: !!data.reservado, reservas: Number(data.reservas || 0) } : i);
      if (reservarLugar) toast({ title: '🎟️ Lugar reservado!', description: 'Quando A Casa abrir, a gente avisa no seu celular.' });
    } catch { toast({ title: 'Não foi possível reservar agora.', variant: 'destructive' }); }
  }, [toast]);
  useEffect(() => {
    if (params.get('reservar') !== '1' || !info) return;
    params.delete('reservar');
    setParams(params, { replace: true });
    if (!info.aberta && !info.reservado) void reservar(true);
  }, [params, setParams, info, reservar]);

  const entrarNaFila = async (salaId: string) => {
    try {
      const { data } = await apiClient.post(`/casa/${salaId}/fila`, { entrar: true });
      toast({ title: `Você está na fila (posição ${data.posicaoNaFila})`, description: 'Quando abrir vaga, chega um aviso e você tem 3 minutos para entrar.' });
      void carregar();
    } catch (e) { toast({ title: erroDe(e, 'Não foi possível entrar na fila.'), variant: 'destructive' }); }
  };

  const sair = useCallback(async () => {
    if (salaAtual) void apiClient.post(`/casa/${salaAtual}/sair`).catch(() => {});
    setEstado(null);
    void carregar();
  }, [salaAtual, carregar]);

  useEffect(() => {
    if (!estado || estado.eu.podeFalar) return;
    const noite = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
    try { if (localStorage.getItem('nosigilo:casa-convite-premium') === noite) return; } catch { /* segue */ }
    const t = setTimeout(() => {
      setConvitePremium(true);
      try { localStorage.setItem('nosigilo:casa-convite-premium', noite); } catch { /* ok */ }
    }, 90_000);
    return () => clearTimeout(t);
  }, [estado?.sala.id, estado?.eu.podeFalar]); // eslint-disable-line react-hooks/exhaustive-deps

  // Presença: ping a cada 25s; se o servidor esqueceu (reinício), entra de novo.
  useEffect(() => {
    if (!salaAtual) return;
    const t = setInterval(async () => {
      try {
        const { data } = await apiClient.post(`/casa/${salaAtual}/ping`);
        if (!data?.dentro) void entrar(salaAtual, true);
      } catch { /* sem rede: tenta no próximo */ }
    }, 25_000);
    // Fechou a aba sem sair: o servidor tira da sala sozinho em ~75s sem ping.
    return () => clearInterval(t);
  }, [salaAtual, entrar]);

  // Tempo real.
  useEffect(() => {
    const aoMsg = (d: { sala: string; msg: Msg }) => {
      setEstado((e) => e && e.sala.id === d.sala ? { ...e, mensagens: [...e.mensagens.slice(-150), d.msg] } : e);
      if (temEfeito(d.msg.efeito)) setEfeito({ id: d.msg.id, efeito: d.msg.efeito!, texto: d.msg.texto });
    };
    const aoReacao = (d: { sala: string; mensagemId: string; reacoes: Record<string, string[]> }) => setEstado((e) => e && e.sala.id === d.sala
      ? { ...e, mensagens: e.mensagens.map((m) => m.id === d.mensagemId ? { ...m, reacoes: d.reacoes } : m) } : e);
    const aoPresentes = (d: { sala: string; presentes: Pessoa[]; espiando: number }) => setEstado((e) => e && e.sala.id === d.sala ? { ...e, presentes: d.presentes, espiando: d.espiando } : e);
    const aoJogo = (d: { sala: string; jogo: Jogo | null }) => setEstado((e) => e && e.sala.id === d.sala ? { ...e, jogo: d.jogo } : e);
    const aoFechar = () => { setEstado(null); toast({ title: 'A Casa fechou por hoje 🌙', description: 'Sexta às 21h e sábado às 22h tem mais.' }); void carregar(); };
    abrirPorIdRef.current = (id: string, nome: string) => abrirPorId(id, nome);
    const abrirPorId = (id: string, nome: string) => {
      const pessoa = estadoRef.current?.presentes.find((x) => x.id === id);
      if (pessoa) setPessoaAberta(pessoa);
      else toast({ title: `${nome} não está mais nesta sala` });
    };
    const aoConvite = (c: Convite) => {
      tocarAviso(true);
      setConvite(c);
      registrarAviso({ emoji: '🚪', texto: `${c.de.nome} te chamou pra cabine`, acao: () => setConvite(c), rotuloAcao: 'Responder', de: c.de });
    };
    const aoConviteSala = (d: { de: { id: string; nome: string; avatar: string | null; cat: Categoria }; sala: string; nome: string }) => {
      tocarAviso(true);
      registrarAviso({ emoji: '🎟️', texto: `${d.de.nome} te chamou para o ${d.nome} (sem fila)`, acao: () => void entrar(d.sala), rotuloAcao: 'Entrar', de: d.de });
      toast({
        title: `🎟️ ${d.de.nome} te chamou para o ${d.nome}!`,
        description: 'Você entra sem fila nos próximos 5 minutos 😈',
        action: <ToastAction altText="Entrar agora" onClick={() => void entrar(d.sala)}>Entrar</ToastAction>,
      });
    };
    // Fora da cabine (na sala): quem está lá dentro quer esquentar.
    const aoEsquentarCabine = (d: { cabineId: string; nome: string }) => {
      if (cabineAbertaRef.current?.id === d.cabineId) return;
      tocarAviso(true);
      registrarAviso({ emoji: '🔥', texto: `${d.nome} quer esquentar a cabine de vocês`, acao: () => setCabineAberta({ id: d.cabineId, modo: 'membro' }), rotuloAcao: 'Abrir' });
      toast({
        title: `🔥 ${d.nome} quer esquentar a cabine!`,
        description: 'Liberar preliminares e transa: topa?',
        action: <ToastAction altText="Abrir a cabine" onClick={() => setCabineAberta({ id: d.cabineId, modo: 'membro' })}>Abrir</ToastAction>,
      });
    };
    const aoVaga = (d: { sala: string; nome: string }) => {
      toast({ title: `🔥 Abriu vaga no ${d.nome}!`, description: 'Você tem 3 minutos: entrando agora…' });
      void entrar(d.sala);
    };
    const aoRevelacao = (d: { ate: string; preco: number }) => {
      setRevelarAte(Date.parse(d.ate));
      toast({ title: '👀 Revelação liberada!', description: `Por 5 minutos, mande uma foto extra: quem quiser abrir paga ${d.preco} tokens para você.` });
    };
    const aoOlhar = (d: { de: { id: string; nome: string; pulseira?: Pulseira | null } }) => {
      tocarAviso(false);
      registrarAviso({ emoji: '👀', texto: `${d.de.nome} te deu uma olhada`, acao: () => abrirPorId(d.de.id, d.de.nome), rotuloAcao: 'Ver', de: d.de });
      toast({
        title: `👀 ${d.de.nome} está de olho em você`,
        description: d.de.pulseira ? `Pulseira ${corDaPulseira(d.de.pulseira)?.emoji} ${corDaPulseira(d.de.pulseira)?.titulo}` : 'Olha de volta?',
        action: <ToastAction altText="Olhar de volta" onClick={() => void olharRef.current(d.de)}>Olhar de volta</ToastAction>,
      });
    };
    const aoCruzados = (d: { com: { id: string; nome: string; avatar: string | null; cat: Categoria }; motivo?: 'brinde' }) => { setMotivoCruzado(d.motivo ?? 'olhar'); setCruzados(d.com); };
    // Drink recebido: quem recebe vê o perfil, lê o recado e escolhe se brinda ou não.
    const aoDrink = (d: DrinkRecebido) => {
      tocarAviso(false);
      registrarAviso({ emoji: '🍸', texto: `${d.de.nome} te pagou ${d.drink} (+${d.tokens} tokens)`, acao: () => setDrinkRecebido(d), rotuloAcao: 'Ver', de: d.de });
      setDrinkRecebido(d);
    };
    const aoBrinde = (d: { de: { id: string; nome: string } }) => {
      registrarAviso({ emoji: '🥂', texto: `${d.de.nome} brindou com você`, acao: () => abrirPorId(d.de.id, d.de.nome), rotuloAcao: 'Ver', de: d.de });
      toast({
        title: `🥂 ${d.de.nome} brindou com você`,
        description: 'O clima esquentou… chama pra cabine?',
        action: <ToastAction altText="Chamar pra cabine" onClick={() => void convidarRef.current(d.de)}>Cabine 🚪</ToastAction>,
      });
    };
    const aoProposta = (d: { id: string; texto: string; tokens: number; privado: boolean; de: { id: string; nome: string; avatar: string | null; cat: Categoria } }) => { tocarAviso(true); registrarAviso({ emoji: '😈', texto: `${d.de.nome} te propôs um desafio (${d.tokens} tokens)`, acao: () => setPropostaRecebida(d), rotuloAcao: 'Ver desafio', de: d.de }); return setPropostaRecebida(d); }
    const aoPropostaAceita = (d: { nome: string }) => toast({ title: `🔥 ${d.nome} aceitou seu desafio!`, description: 'Tem 5 minutos para cumprir.' });
    const aoPropostaFim = (d: { id: string; cumprida: boolean; motivo?: string; nome: string; tokens: number }) => {
      setMeuDesafio((m) => (m?.id === d.id ? null : m));
      setPropostaRecebida((pr) => (pr?.id === d.id ? null : pr));
      toast({ title: d.cumprida ? `✅ ${d.nome} cumpriu seu desafio!` : 'Desafio encerrado', description: d.cumprida ? `Os ${d.tokens} tokens foram para ${d.nome}.` : d.motivo });
    };
    const aoResposta = () => toast({ title: 'Não rolou agora 😉', description: 'A pessoa não aceitou o convite pra cabine.' });
    const aoCabine = (d: { cabineId: string; com: string }) => {
      toast({ title: `🚪 Você está na cabine com ${d.com}!` });
      setMinhasCabines((l) => (l.includes(d.cabineId) ? l : [...l, d.cabineId]));
      setCabineAberta({ id: d.cabineId, modo: 'membro' });
    };
    const aoConviteCabine = (d: { cabineId: string; membros: string[] }) => {
      tocarAviso(true);
      setConviteCabine(d);
      registrarAviso({ emoji: '🚪', texto: `${d.membros.join(', ')} te chamaram pra cabine deles`, acao: () => setConviteCabine(d), rotuloAcao: 'Responder' });
    };
    const aoAvisoLola = (d: { texto: string }) => toast({ title: d.texto });
    const aoRemovida = (d: { sala: string; id: string }) => setEstado((e) => e && e.sala.id === d.sala ? { ...e, mensagens: e.mensagens.filter((m) => m.id !== d.id) } : e);
    const aoExpulso = (d: { motivo: string }) => {
      setCabineAberta(null);
      setEstado(null);
      toast({ title: '🚫 Você foi retirado(a) da Casa nesta noite', description: `${d.motivo}. Na próxima noite você pode voltar.`, variant: 'destructive' });
    };
    // O pedido de entrada agora chega como decisão (casa.cabine.decidir), com som e janela própria.
    const aoPedidoCabine = (_d: { cabineId: string; nome: string }) => {};
    const aoDecidir = (d: DecisaoCabine) => {
      tocarAviso(true);
      setDecisao(d);
      const texto = d.tipo === 'porta' ? `${d.nome} quer abrir a porta da cabine` : d.tipo === 'convite' ? `${d.nome} quer convidar ${d.alvoNome} pra cabine` : `${d.nome} quer entrar na sua cabine`;
      registrarAviso({ emoji: d.tipo === 'porta' ? '🚪' : '🙋', texto, acao: () => setDecisao(d), rotuloAcao: 'Decidir' });
    };
    const aoRecusadoCabine = () => toast({ title: 'Não rolou entrar na cabine desta vez 😉' });
    const aoBatida = (d: { de: { id: string; nome: string; avatar: string | null; cat: Categoria } }) => {
      tocarAviso(false);
      registrarAviso({ emoji: '🕳️', texto: `${d.de.nome} bateu na parede`, acao: () => void convidarRef.current(d.de), rotuloAcao: 'Chamar pra cabine', de: d.de });
      toast({
        title: `🕳️ ${d.de.nome} bateu na parede…`,
        description: `É ${ROTULO_CAT[d.de.cat].toLowerCase()}. Quer chamar pra cabine?`,
        action: <ToastAction altText="Chamar pra cabine" onClick={() => void convidarRef.current(d.de)}>Cabine 🚪</ToastAction>,
      });
    };
    on('casa.cabine.decidir', aoDecidir); on('casa.mensagem', aoMsg); on('casa.reacao', aoReacao); on('casa.presentes', aoPresentes); on('casa.jogo', aoJogo); on('casa.fechou', aoFechar);
    on('casa.convite', aoConvite); on('casa.convite.resposta', aoResposta); on('casa.cabine', aoCabine); on('casa.aviso', aoAvisoLola); on('casa.mensagem.removida', aoRemovida); on('casa.expulso', aoExpulso); on('casa.cabine.convite', aoConviteCabine); on('casa.cabine.pedido', aoPedidoCabine); on('casa.cabine.recusado', aoRecusadoCabine); on('casa.batida', aoBatida); on('casa.vaga', aoVaga); on('casa.cabine.esquentar', aoEsquentarCabine); on('casa.convite.sala', aoConviteSala); on('casa.revelacao', aoRevelacao); on('casa.olhar', aoOlhar); on('casa.olhares', aoCruzados); on('casa.drink', aoDrink); on('casa.brinde', aoBrinde); on('casa.proposta', aoProposta); on('casa.proposta.aceita', aoPropostaAceita); on('casa.proposta.fim', aoPropostaFim);
    return () => {
      off('casa.cabine.decidir', aoDecidir); off('casa.mensagem', aoMsg); off('casa.reacao', aoReacao); off('casa.presentes', aoPresentes); off('casa.jogo', aoJogo); off('casa.fechou', aoFechar);
      off('casa.convite', aoConvite); off('casa.convite.resposta', aoResposta); off('casa.cabine', aoCabine); off('casa.aviso', aoAvisoLola); off('casa.mensagem.removida', aoRemovida); off('casa.expulso', aoExpulso); off('casa.cabine.convite', aoConviteCabine); off('casa.cabine.pedido', aoPedidoCabine); off('casa.cabine.recusado', aoRecusadoCabine); off('casa.batida', aoBatida); off('casa.vaga', aoVaga); off('casa.cabine.esquentar', aoEsquentarCabine); off('casa.convite.sala', aoConviteSala); off('casa.revelacao', aoRevelacao); off('casa.olhar', aoOlhar); off('casa.olhares', aoCruzados); off('casa.drink', aoDrink); off('casa.brinde', aoBrinde); off('casa.proposta', aoProposta); off('casa.proposta.aceita', aoPropostaAceita); off('casa.proposta.fim', aoPropostaFim);
    };
  }, [on, off, toast, navigate, carregar, entrar]);

  // Sai da sala ao deixar a página.
  const salaRef = useRef<string | null>(null);
  salaRef.current = salaAtual;
  useEffect(() => () => { if (salaRef.current) void apiClient.post(`/casa/${salaRef.current}/sair`).catch(() => {}); }, []);

  useEffect(() => { fimDaLista.current?.scrollIntoView({ block: 'end' }); }, [estado?.mensagens.length]);
  // Recepção: quem entra escolhe a pulseira da noite (como na casa de verdade).
  // A pulseira vale a noite toda: trocando de sala, a mesma cor é recolocada sozinha.
  useEffect(() => {
    if (!estado?.eu.podeFalar || estado.eu.pulseira || pulseiraDispensada || !salaAtual) return;
    let guardada: string | null = null;
    try { guardada = localStorage.getItem(chavePulseira()); } catch { /* sem storage */ }
    if (guardada) {
      setEstado((e) => e ? { ...e, eu: { ...e.eu, pulseira: guardada as Pulseira } } : e);
      void apiClient.post(`/casa/${salaAtual}/pulseira`, { cor: guardada }).catch(() => {});
      return;
    }
    setEscolhendoPulseira(true);
  }, [estado?.sala.id, estado?.eu.podeFalar, estado?.eu.pulseira, pulseiraDispensada]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t || !salaAtual) return;
    setTexto('');
    const resp = respondendo;
    setRespondendo(null);
    try { await apiClient.post(`/casa/${salaAtual}/mensagem`, { texto: t, ...(resp ? { respostaA: resp.id } : {}) }); }
    catch (e) { setTexto(t); setRespondendo(resp); toast({ title: erroDe(e, 'Mensagem não enviada.'), variant: 'destructive' }); }
  };
  // Tocar no nome ou na foto de quem escreveu abre o mesmo menu da lista de presentes.
  const abrirAutor = (autor: Msg['autor']) => {
    if (!autor || !estado) return;
    const pessoa = estado.presentes.find((x) => x.id === autor.id);
    if (pessoa) setPessoaAberta(pessoa);
    else toast({ title: `${autor.nome} não está mais nesta sala` });
  };
  const reagir = async (m: Msg, emoji: string) => {
    setReagindoEm(null);
    if (!salaAtual) return;
    try { await apiClient.post(`/casa/${salaAtual}/reagir`, { mensagemId: m.id, emoji }); }
    catch (e) { toast({ title: erroDe(e, 'Não deu para reagir.'), variant: 'destructive' }); }
  };
  // Foto/vídeo tirado na hora (abre a câmera no celular), sempre visualização única.
  const enviarMidia = async (arquivo: File | undefined) => {
    if (!arquivo || !salaAtual) return;
    if (arquivo.type.startsWith('video/') && arquivo.size > 200 * 1024 * 1024) {
      toast({ title: 'Vídeo grande demais', description: 'Grave um vídeo mais curto (até 1 minuto).', variant: 'destructive' });
      return;
    }
    // Tipo pelo arquivo escolhido (alguns celulares mandam o tipo vazio: aí vale a extensão).
    const ehVideo = arquivo.type ? arquivo.type.startsWith('video/') : /\.(mp4|mov|m4v|webm|3gp|mkv|avi)$/i.test(arquivo.name);
    setTipoEnviando(ehVideo ? 'video' : 'foto');
    setEnviandoMidia(0);
    try {
      // Depois de 100% o servidor ainda comprime o vídeo: a barra mostra "processando".
      const up = await profileService.uploadMedia(arquivo, { source: 'chat' }, (pct) => setEnviandoMidia(Math.min(100, pct)));
      setEnviandoMidia(100);
      const revelacao = modoRevelacao.current;
      const propostaId = propostaDaCamera.current;
      const livre = !revelacao && !propostaId && !midiaUnicaRef.current;
      await apiClient.post(`/casa/${salaAtual}/midia`, { mediaId: up.id, revelacao, livre, ...(propostaId ? { propostaId } : {}) });
      if (propostaId) setMeuDesafio(null);
      if (revelacao) setRevelarAte(0);
      toast({ title: revelacao ? 'Revelação enviada 👀' : 'Enviado para a sala 🔥', description: livre ? 'Fica aberto para todos da sala verem.' : 'Cada pessoa abre só 1 vez.' });
    } catch (e) {
      toast({ title: (e as Error)?.message || erroDe(e, 'Não foi possível enviar.'), variant: 'destructive' });
    } finally {
      setEnviandoMidia(null);
      modoRevelacao.current = false;
      propostaDaCamera.current = null;
      if (cameraRef.current) cameraRef.current.value = '';
      if (galeriaRef.current) galeriaRef.current.value = '';
    }
  };
  const abrirCamera = (revelacao = false) => {
    modoRevelacao.current = revelacao;
    propostaDaCamera.current = null;
    cameraRef.current?.click();
  };
  const abrirGaleria = () => {
    modoRevelacao.current = false;
    propostaDaCamera.current = null;
    galeriaRef.current?.click();
  };
  const carregarLivre = async (m: Msg) => {
    if (!salaAtual || urlsLivres[m.id]) return;
    try {
      const { data } = await apiClient.post(`/casa/${salaAtual}/midia/${m.id}/ver`);
      setUrlsLivres((u) => ({ ...u, [m.id]: { url: data.url, mime: data.mime ?? null } }));
    } catch (e) { toast({ title: erroDe(e, 'Esta mídia não está mais disponível.') }); }
  };
  // Mídia "para todos": carrega a miniatura sozinha para quem pode ver.
  useEffect(() => {
    if (!estado?.eu.podeFalar) return;
    for (const m of estado.mensagens) if (m.tipo === 'midia' && m.midia?.livre && !urlsLivres[m.id]) void carregarLivre(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado?.mensagens.length, estado?.eu.podeFalar]);
  const verMidia = async (m: Msg) => {
    if (!salaAtual) return;
    if (m.midia?.preco && !window.confirm(`Abrir a revelação de ${m.autor?.nome} por ${m.midia.preco} tokens? Os tokens vão para ${m.autor?.nome}.`)) return;
    try {
      const { data } = await apiClient.post(`/casa/${salaAtual}/midia/${m.id}/ver`);
      setComentarioMidia('');
      setVendo({ url: data.url, mime: data.mime, msg: m });
    } catch (e) {
      toast({ title: erroDe(e, 'Esta mídia não está mais disponível.') });
      if ((e as any)?.response?.status === 402) { setComprarAberto(true); return; } // sem tokens: compra ali mesmo e tenta de novo
    }
    setEstado((e) => e ? { ...e, midiasVistas: [...e.midiasVistas, m.id] } : e);
  };

  const jogar = async (valor: unknown) => {
    if (!salaAtual || !estado?.jogo) return;
    try {
      const { data } = await apiClient.post(`/casa/${salaAtual}/jogo`, { jogoId: estado.jogo.id, valor });
      if (data?.acertou === false) toast({ title: 'Errou! 😅' });
      if (estado.jogo.tipo === 'quiz') setEstado((e) => e && e.jogo ? { ...e, jogo: { ...e.jogo, meuVoto: Number(valor) } } : e);
    } catch (e) { toast({ title: erroDe(e, 'Essa rodada já acabou.') }); }
  };
  const alternarBrincar = async () => {
    if (!salaAtual || !estado) return;
    const quer = !estado.eu.querBrincar;
    setEstado({ ...estado, eu: { ...estado.eu, querBrincar: quer } });
    try { await apiClient.post(`/casa/${salaAtual}/brincar`, { quer }); } catch { /* volta no próximo estado */ }
  };
  const escolherPulseira = async (cor: Pulseira) => {
    setEscolhendoPulseira(false);
    try { localStorage.setItem(chavePulseira(), cor); } catch { /* sem storage */ }
    if (!salaAtual) return;
    setEstado((e) => e ? { ...e, eu: { ...e.eu, pulseira: cor, querBrincar: cor === 'vermelha' ? false : e.eu.querBrincar } } : e);
    try { await apiClient.post(`/casa/${salaAtual}/pulseira`, { cor }); } catch { /* volta no próximo estado */ }
  };
  const olhar = async (p: { id: string; nome: string }) => {
    setPessoaAberta(null);
    try {
      const { data } = await apiClient.post(`/casa/${salaAtual}/olhar`, { para: p.id });
      if (!data?.cruzados) toast({ title: `👀 Você deu uma olhada em ${p.nome}`, description: 'Só a pessoa fica sabendo. Se ela olhar de volta, a Lola avisa os dois.' });
    } catch (e) { toast({ title: erroDe(e, 'Não foi possível agora.') }); }
  };
  const pagarDrink = async (p: Pessoa, drink: string) => {
    setMostrandoBar(false);
    setPessoaAberta(null);
    try {
      await apiClient.post(`/casa/${salaAtual}/drink`, { para: p.id, drink, ...(recadoDrink.trim() ? { mensagem: recadoDrink.trim() } : {}) });
      setRecadoDrink('');
    } catch (e) {
      const semSaldo = (e as any)?.response?.status === 402;
      toast({
        title: erroDe(e, 'Não foi possível pagar o drink.'),
        variant: 'destructive',
        action: semSaldo ? <ToastAction altText="Comprar tokens" onClick={() => setComprarAberto(true)}>Comprar tokens</ToastAction> : undefined,
      });
      if (semSaldo) setComprarAberto(true);
    }
  };
  // Desafio que esbarrou na falta de tokens: reabre sozinho (com o texto) depois da compra.
  const desafioPendente = useRef<Pessoa | null>(null);
  const abrirProposta = async (p: Pessoa) => {
    setPessoaAberta(null);
    setPropondoPara(p);
    setTextoDesafio('');
    if (sugestoes.length === 0) {
      try { setSugestoes((await apiClient.get('/casa/sugestoes-de-desafio')).data.sugestoes ?? []); } catch { /* sem sugestões */ }
    }
  };
  const enviarProposta = async () => {
    const alvo = propondoPara;
    if (!alvo || !salaAtual) return;
    try {
      await apiClient.post(`/casa/${salaAtual}/propor`, { para: alvo.id, texto: textoDesafio, tokens: tokensDesafio, privado: privadoDesafio });
      setPropondoPara(null);
      toast({ title: `😈 Desafio enviado para ${alvo.nome}`, description: `${tokensDesafio} tokens guardados: só saem se cumprir; se não, voltam pra você.` });
    } catch (e) {
      const semSaldo = (e as any)?.response?.status === 402;
      // Sem tokens: fecha o desafio (o texto fica guardado) e abre a compra por cima.
      if (semSaldo) { desafioPendente.current = alvo; setPropondoPara(null); }
      toast({
        title: semSaldo ? `Faltam tokens: o desafio vale ${tokensDesafio} 🪙` : erroDe(e, 'Não foi possível enviar o desafio.'),
        description: semSaldo ? 'Compre aqui mesmo e mande o desafio de novo (o texto fica guardado).' : undefined,
        variant: 'destructive',
        action: semSaldo ? <ToastAction altText="Comprar tokens" onClick={() => setComprarAberto(true)}>Comprar tokens</ToastAction> : undefined,
      });
      if (semSaldo) setComprarAberto(true);
    }
  };
  const responderProposta = async (aceitar: boolean) => {
    const pr = propostaRecebida;
    setPropostaRecebida(null);
    if (!pr) return;
    try {
      const { data } = await apiClient.post(`/casa/proposta/${pr.id}/responder`, { aceitar });
      if (aceitar) setMeuDesafio({ id: pr.id, texto: data.texto, tokens: data.tokens, privado: data.privado, deNome: data.deNome, prazo: data.prazo });
    } catch (e) { toast({ title: erroDe(e, 'Esse desafio expirou.') }); }
  };
  const cumprirDesafio = () => {
    if (!meuDesafio) return;
    propostaDaCamera.current = meuDesafio.id;
    modoRevelacao.current = false;
    cameraRef.current?.click();
  };

  const brindar = async (de: { id: string }) => {
    try { await apiClient.post(`/casa/${salaAtual}/brindar`, { para: de.id }); } catch { /* ok */ }
  };

  const chamarPraSala = async (p: { id: string; nome: string }, destino: string) => {
    setPessoaAberta(null);
    try {
      await apiClient.post(`/casa/${salaAtual}/chamar-pra-sala`, { para: p.id, destino });
      toast({ title: `🎟️ Convite enviado para ${p.nome}`, description: 'Ele entra sem fila nos próximos 5 minutos.' });
    } catch (e) { toast({ title: erroDe(e, 'Não foi possível chamar agora.') }); }
  };
  const convidar = async (p: { id: string; nome: string }) => {
    setPessoaAberta(null);
    try {
      await apiClient.post(`/casa/${salaAtual}/convidar`, { para: p.id });
      toast({ title: `Convite enviado para ${p.nome} 🚪`, description: 'Se aceitar, a cabine abre na hora.' });
    } catch (e) { toast({ title: erroDe(e, 'Não foi possível chamar agora.'), variant: 'destructive' }); }
  };
  // Os avisos do socket usam as ações mais recentes sem refazer a inscrição.
  const olharRef = useRef(olhar); olharRef.current = olhar;
  const brindarRef = useRef(brindar); brindarRef.current = brindar;
  const convidarRef = useRef(convidar); convidarRef.current = convidar;
  const responderConvite = async (aceitar: boolean) => {
    const c = convite;
    setConvite(null);
    if (!c) return;
    try {
      const { data } = await apiClient.post(`/casa/convite/${c.id}/responder`, { aceitar });
      if (aceitar && data?.cabineId) {
        setMinhasCabines((l) => (l.includes(data.cabineId) ? l : [...l, data.cabineId]));
        setCabineAberta({ id: data.cabineId, modo: 'membro' });
      }
    } catch (e) { toast({ title: erroDe(e, 'Esse convite expirou.') }); }
  };
  useEffect(() => {
    if (!salaAtual) { setCabinesAbertas([]); return; }
    const buscar = () => apiClient.get(`/casa/${salaAtual}/cabines`).then((r) => setCabinesAbertas(r.data.cabines ?? [])).catch(() => {});
    void buscar();
    const t = setInterval(buscar, 15_000);
    return () => clearInterval(t);
  }, [salaAtual, cabineAberta]);
  const responderConviteCabine = async (aceitar: boolean) => {
    const c = conviteCabine;
    setConviteCabine(null);
    if (!c) return;
    try {
      const { data } = await apiClient.post(`/casa/cabine/${c.cabineId}/convite/responder`, { aceitar });
      if (aceitar && data?.cabine) {
        setMinhasCabines((l) => (l.includes(c.cabineId) ? l : [...l, c.cabineId]));
        setCabineAberta({ id: c.cabineId, modo: 'membro' });
      }
    } catch (e) { toast({ title: erroDe(e, 'Esse convite expirou.') }); }
  };
  const revelar = async () => {
    if (!salaAtual || !window.confirm('Revelar seu nome e sua foto para a sala? Não dá para voltar a ser anônimo nesta noite.')) return;
    try {
      await apiClient.post(`/casa/${salaAtual}/revelar`);
      setEstado((e) => e ? { ...e, eu: { ...e.eu, revelado: true } } : e);
    } catch { /* ok */ }
  };
  const denunciar = async (p: { id: string; nome: string }) => {
    const motivo = window.prompt(`Denunciar ${p.nome}: o que aconteceu? (vai direto para a equipe)`);
    if (motivo === null) return;
    setPessoaAberta(null);
    try {
      await apiClient.post(`/casa/${salaAtual}/denunciar`, { para: p.id, motivo });
      toast({ title: '🚩 Denúncia enviada', description: 'A equipe recebeu agora mesmo. Obrigado por cuidar da Casa.' });
    } catch (e) { toast({ title: erroDe(e, 'Não foi possível denunciar agora.') }); }
  };
  const tirarDaCasa = async (p: { id: string; nome: string }) => {
    if (!window.confirm(`Tirar ${p.nome} da Casa nesta noite?`)) return;
    setPessoaAberta(null);
    try { await apiClient.post(`/casa/${salaAtual}/expulsar`, { para: p.id }); toast({ title: `${p.nome} foi retirado(a) da Casa` }); }
    catch (e) { toast({ title: erroDe(e, 'Não foi possível.') }); }
  };
  const bater = async (p: { id: string; nome: string }) => {
    setPessoaAberta(null);
    try {
      await apiClient.post(`/casa/${salaAtual}/bater`, { para: p.id });
      toast({ title: `🕳️ Você bateu na parede de ${p.nome}`, description: 'A pessoa não sabe quem foi. Se quiser, ela te chama.' });
    } catch (e) { toast({ title: erroDe(e, 'Não foi possível agora.') }); }
  };

  const abrirAgora = async (minutos: number) => {
    try { await apiClient.post('/casa/abrir-agora', { minutos }); await carregar(); }
    catch (e) { toast({ title: erroDe(e, 'Falhou.'), variant: 'destructive' }); }
  };

  // "Fulano e Beltrano foram pra cabine": atalhos para espiar ou pedir para entrar.
  // Só funciona com a porta aberta (é o combinado da cabine); fechada, avisa.
  const AcoesDaCabineAnunciada = ({ texto }: { texto: string }) => {
    // Nome de casal pode ter " e " ("Danny e Gutty"): procura a cabine cujos membros aparecem todos no aviso.
    const acharCabine = () => cabinesAbertas.find((c) => !c.souMembro && c.membros.length > 0 && c.membros.every((mb) => texto.includes(mb.nome)));
    const fechada = () => toast({ title: 'A porta dessa cabine está fechada 🔒', description: 'Dá para bater na porta (pedir pra entrar). Espiar, só quando eles abrirem.' });
    return (
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <button type="button" className="rounded-full bg-black/30 px-2.5 py-1 text-[11px] font-semibold hover:bg-black/50"
          onClick={() => { const c = acharCabine(); if (c && c.aberta !== false) setCabineAberta({ id: c.id, modo: 'espiar' }); else if (c) fechada(); else toast({ title: 'Essa cabine já fechou 🌙' }); }}>👀 Espiar</button>
        <button type="button" className="rounded-full bg-black/30 px-2.5 py-1 text-[11px] font-semibold hover:bg-black/50"
          onClick={async () => {
            const c = acharCabine();
            if (!c) { toast({ title: 'Essa cabine já fechou 🌙' }); return; }
            try {
              const aberta = c.aberta !== false;
              if (aberta) await apiClient.post(`/casa/cabine/${c.id}/espiar`);
              await apiClient.post(`/casa/cabine/${c.id}/pedir`);
              toast({ title: aberta ? '🙋 Pedido enviado' : '🚪 Você bateu na porta', description: 'Você entra se todos lá dentro concordarem.' });
              if (aberta) setCabineAberta({ id: c.id, modo: 'espiar' });
            } catch (e) { toast({ title: erroDe(e, 'Não deu para pedir agora.'), variant: 'destructive' }); }
          }}>🙋 Pedir pra entrar</button>
      </div>
    );
  };

  // Reações safadas + responder, embaixo de cada mensagem.
  const meuId = estado?.eu.idPublico ?? user?.id ?? '';
  const AcoesDaMsg = ({ m }: { m: Msg }) => {
    const reacoes = Object.entries(m.reacoes ?? {}).filter(([, ids]) => ids.length > 0);
    return (
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {reacoes.map(([emoji, ids]) => (
          <button key={emoji} type="button" onClick={() => void reagir(m, emoji)}
            className={cn('rounded-full px-1.5 py-0.5 text-[11px]', ids.includes(meuId) ? 'bg-fuchsia-600/60 ring-1 ring-fuchsia-300' : 'bg-black/30')}>
            {emoji} {ids.length}
          </button>
        ))}
        {estado?.eu.podeFalar && (
          <>
            <button type="button" onClick={() => setReagindoEm(reagindoEm === m.id ? null : m.id)} className="rounded-full bg-black/20 px-1.5 py-0.5 text-[11px] text-white/60 hover:text-white" aria-label="Reagir">😈+</button>
            <button type="button" onClick={() => setRespondendo(m)} className="rounded-full bg-black/20 px-1.5 py-0.5 text-[11px] text-white/60 hover:text-white">
              ↩️ {m.tipo === 'lola' ? 'Responder a Lola' : 'Responder'}
            </button>
          </>
        )}
        {reagindoEm === m.id && (
          <div className="flex w-full gap-1 pt-1">
            {REACOES.map((e) => (
              <button key={e} type="button" onClick={() => void reagir(m, e)} className="rounded-full bg-white/10 px-2 py-1 text-base hover:scale-110">{e}</button>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ─── Sala ────────────────────────────────────────────────────────────────
  const sala = estado && createPortal(
    <div
      className={cn('fixed inset-0 z-[9990] flex flex-col overflow-hidden text-white', temaDaSala(estado.sala.id).fundo)}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* Luz de boate: dois focos neon que passeiam devagar pelo fundo. */}
      <style>{`
        @keyframes nsFoco1 { 0%,100% { transform: translate(-30%, -10%); } 50% { transform: translate(40%, 30%); } }
        @keyframes nsFoco2 { 0%,100% { transform: translate(40%, 60%); } 50% { transform: translate(-20%, 10%); } }
      `}</style>
      <div className={cn('pointer-events-none absolute -left-20 top-0 h-80 w-80 rounded-full blur-3xl', temaDaSala(estado.sala.id).foco1)} style={{ animation: 'nsFoco1 14s ease-in-out infinite' }} />
      <div className={cn('pointer-events-none absolute -right-20 top-1/3 h-80 w-80 rounded-full blur-3xl', temaDaSala(estado.sala.id).foco2)} style={{ animation: 'nsFoco2 18s ease-in-out infinite' }} />

      <div className="relative flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <button type="button" onClick={() => void sair()} className="rounded-full p-2 hover:bg-white/10" aria-label="Sair da sala">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{estado.sala.emoji} {estado.sala.nome}</p>
          <p className="text-[11px] text-white/60">
            {estado.presentes.length} na sala{estado.espiando > 0 ? ` · ${estado.espiando} espiando 👀` : ''}
          </p>
        </div>
        {estado.sala_anonima && estado.eu.podeFalar && !estado.eu.revelado && (
          <button type="button" onClick={() => void revelar()} className="rounded-full border border-white/20 px-2 py-1.5 text-xs" title="Revelar quem sou">🎭</button>
        )}
        <TokenBadge semLink />
        <button type="button" onClick={() => setFeedbackAberto(true)} className="rounded-full border border-white/20 px-2 py-1.5 text-xs" aria-label="Sugestões" title="Feedback e sugestões">💬</button>
        <button
          type="button"
          onClick={() => { setAvisosAbertos(true); setNaoLidas(0); }}
          className={cn('relative rounded-full border px-2 py-1.5 text-xs', naoLidas > 0 ? 'border-rose-400 bg-rose-500/20' : 'border-white/20')}
          aria-label="Avisos da Casa" title="Seus avisos na Casa"
        >
          🔔
          {naoLidas > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold">{naoLidas > 9 ? '9+' : naoLidas}</span>}
        </button>
        <button type="button" onClick={() => setRankingAberto(true)} className="rounded-full border border-white/20 px-2 py-1.5 text-xs" aria-label="Ranking" title="Ranking da Casa">🏆</button>
        {estado.eu.podeFalar && (
          <button
            type="button"
            onClick={() => setEscolhendoPulseira(true)}
            className="rounded-full border border-white/20 px-2 py-1.5 text-xs"
            aria-label="Trocar pulseira"
            title="Sua pulseira da noite"
          >
            {corDaPulseira(estado.eu.pulseira)?.emoji ?? '⚪'}
          </button>
        )}
        {estado.eu.podeFalar && estado.eu.pulseira !== 'vermelha' && (
          <button
            type="button"
            onClick={() => void alternarBrincar()}
            className={cn('rounded-full px-3 py-1.5 text-xs font-semibold transition',
              estado.eu.querBrincar ? 'bg-rose-600 text-white' : 'border border-white/30 text-white/80')}
          >
            {estado.eu.querBrincar ? '🔥 Brincando' : 'Quero brincar'}
          </button>
        )}
      </div>

      <RadioDaCasa />

      {/* Quem está na sala: toque para ver o perfil ou chamar pra cabine. */}
      <div className="flex gap-3 overflow-x-auto border-b border-white/10 px-3 py-2.5 [scrollbar-width:none]">
        {estado.presentes.length === 0 && <p className="py-2 text-xs text-white/60">Ninguém falando ainda. Seja o primeiro 😉</p>}
        {estado.presentes.map((p) => (
          <button key={p.id} type="button" onClick={() => setPessoaAberta(p)} className="flex w-14 shrink-0 flex-col items-center gap-1">
            <div className="relative">
              <Avatar p={p} tamanho="h-11 w-11" />
              {p.querBrincar && <span className="absolute -bottom-1 -right-1 text-xs">🔥</span>}
              {p.rei && <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-sm">👑</span>}
              {p.pulseira && <span className={cn('absolute -bottom-0.5 -left-0.5 h-3 w-3 rounded-full ring-2 ring-zinc-950', corDaPulseira(p.pulseira)?.classe)} />}
            </div>
            <span className="w-full truncate text-center text-[10px] text-white/80">{p.nome}</span>
            {p.cidade && <span className="-mt-1 w-full truncate text-center text-[9px] text-white/50">{p.cidade}</span>}
          </button>
        ))}
      </div>

      {cabinesAbertas.some((c) => c.aberta !== false || c.souMembro) && (
        <div className="relative flex gap-2 overflow-x-auto border-b border-white/10 px-3 py-2 [scrollbar-width:none]">
          {cabinesAbertas.filter((c) => c.aberta !== false || c.souMembro).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCabineAberta({ id: c.id, modo: c.souMembro ? 'membro' : 'espiar' })}
              className={cn('flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs', c.souMembro ? 'bg-rose-600' : 'bg-white/10')}
            >
              <span>{c.souMembro ? '🚪 Minha cabine' : '👀 Espiar'}</span>
              <span className="max-w-[140px] truncate text-white/80">{c.membros.map((m) => m.nome).join(' & ')}</span>
              {c.espectadores > 0 && <span className="text-white/60">· {c.espectadores} 👀</span>}
            </button>
          ))}
        </div>
      )}

      {/* Desafio do momento: fica fixo no topo enquanto a conversa corre embaixo. */}
      {estado.jogo && !jogosDispensados.includes(estado.jogo.id)
        && !((estado.jogo.tipo === 'enquete' || estado.jogo.tipo === 'eu_nunca' || estado.jogo.tipo === 'quiz') && estado.jogo.meuVoto != null) && (
        <div className="relative">
          <CartaoDoJogo jogo={estado.jogo} podeFalar={estado.eu.podeFalar} onJogar={(v) => void jogar(v)} onCamera={() => abrirCamera(false)} />
          <button type="button" aria-label="Dispensar"
            onClick={() => { const id = estado.jogo?.id; if (id) setJogosDispensados((l) => [...l, id]); }}
            className="absolute right-5 top-4 rounded-full bg-black/40 px-2 py-0.5 text-[11px] text-white/80 hover:bg-black/60">Dispensar ✕</button>
        </div>
      )}

      {meuDesafio && segundosMeuDesafio > 0 && (
        <div className="relative mx-3 mb-2 rounded-2xl border border-amber-400/50 bg-amber-500/15 p-3">
          <p className="text-xs font-semibold text-amber-200">😈 Desafio de {meuDesafio.deNome} · {meuDesafio.tokens} tokens{meuDesafio.privado ? ' · 🤫 só pra ele(a)' : ''}</p>
          <p className="my-1 text-sm">{meuDesafio.texto}</p>
          <div className="flex items-center gap-2">
            <Button size="sm" className="flex-1 bg-amber-500 text-black hover:bg-amber-400" onClick={cumprirDesafio}>
              <Camera className="mr-1.5 h-4 w-4" />Cumprir agora
            </Button>
            <span className="text-xs tabular-nums text-amber-100">{Math.floor(segundosMeuDesafio / 60)}:{String(segundosMeuDesafio % 60).padStart(2, '0')}</span>
          </div>
        </div>
      )}

      <div className="relative flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {estado.mensagens.map((m) => m.tipo === 'sistema' ? (
          <p key={m.id} className="text-center text-[11px] text-white/45">{m.texto}</p>
        ) : m.tipo === 'midia' ? (
          <div key={m.id} className="flex items-start gap-2">
            {m.autor && <button type="button" onClick={() => abrirAutor(m.autor)} aria-label={`Abrir ${m.autor.nome}`}><Avatar p={m.autor} tamanho="h-7 w-7" /></button>}
            <div className="min-w-0">
              <button type="button" onClick={() => abrirAutor(m.autor)} className="block text-left text-[11px] font-semibold text-white/70 hover:text-fuchsia-300 hover:underline">{m.autor?.nome}</button>
              {(() => {
                const minha = m.autor?.id === (estado.eu.idPublico ?? user?.id);
                const vista = estado.midiasVistas.includes(m.id);
                return (
                  <>
                  <p className="text-[11px] text-white/60">{m.texto}</p>
                  {m.midia?.livre ? (
                    !estado.eu.podeFalar ? (
                      <p className="mt-0.5 rounded-2xl bg-white/5 px-3 py-2 text-sm text-white/50">🔒 Assine para ver</p>
                    ) : urlsLivres[m.id] ? (
                      <button type="button" onClick={() => { setComentarioMidia(''); setVendo({ ...urlsLivres[m.id], msg: m }); }} className="mt-1 block overflow-hidden rounded-2xl">
                        {urlsLivres[m.id].mime?.startsWith('video/')
                          ? <video src={resolveServerUrl(urlsLivres[m.id].url)} muted playsInline preload="metadata" className="max-h-56 max-w-[220px] object-cover" />
                          : <img src={resolveServerUrl(urlsLivres[m.id].url)} alt="" draggable={false} className="max-h-56 max-w-[220px] object-cover" />}
                      </button>
                    ) : (
                      <button type="button" onClick={() => void carregarLivre(m)} className="mt-0.5 rounded-2xl bg-white/10 px-3 py-2 text-sm">{m.midia.tipo === 'video' ? '🎥' : '📸'} Ver</button>
                    )
                  ) : (
                  <button
                    type="button"
                    disabled={minha || vista || !estado.eu.podeFalar}
                    onClick={() => void verMidia(m)}
                    className={cn('mt-0.5 flex items-center gap-2 rounded-2xl px-3 py-2 text-sm',
                      minha || vista ? 'bg-white/5 text-white/50' : 'bg-gradient-to-r from-rose-600 to-fuchsia-600 font-semibold')}
                  >
                    {m.midia?.tipo === 'video' ? '🎥' : '📸'}
                    {minha ? 'Você enviou · visualização única' : vista ? 'Aberta' : !estado.eu.podeFalar ? 'Assine para ver' : m.midia?.preco ? `Abrir por ${m.midia.preco} tokens` : 'Toque para ver (1 vez)'}
                  </button>
                  )}
                  <AcoesDaMsg m={m} />
                  </>
                );
              })()}
            </div>
          </div>
        ) : m.tipo === 'lola' ? (
          <div key={m.id} className="max-w-[90%] rounded-2xl rounded-tl-sm bg-gradient-to-br from-fuchsia-700 to-rose-700 px-3 py-2 shadow">
            <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-fuchsia-100">💋 Lola · anfitriã IA</p>
            <p className="whitespace-pre-line text-sm leading-snug">{m.texto}</p>
            {estado.eu.podeFalar && /foram pra cabine/.test(m.texto) && <AcoesDaCabineAnunciada texto={m.texto} />}
            {m.jogoId && estado.jogo?.id === m.jogoId && (
              <div className="-mx-3 mt-1">
                <CartaoDoJogo jogo={estado.jogo} podeFalar={estado.eu.podeFalar} onJogar={(v) => void jogar(v)} onCamera={() => abrirCamera(false)} />
              </div>
            )}
            <AcoesDaMsg m={m} />
          </div>
        ) : (
          <div key={m.id} className="flex items-start gap-2">
            {m.autor && <button type="button" onClick={() => abrirAutor(m.autor)} aria-label={`Abrir ${m.autor.nome}`}><Avatar p={m.autor} tamanho="h-7 w-7" /></button>}
            <div className="min-w-0 max-w-[85%] rounded-2xl rounded-tl-sm bg-white/10 px-3 py-1.5">
              <button type="button" onClick={() => abrirAutor(m.autor)} className="text-left text-[11px] font-semibold text-white/70 hover:text-fuchsia-300 hover:underline">{m.autor?.nome} <span className="font-normal text-white/40">· {m.autor ? ROTULO_CAT[m.autor.cat] : ''}</span></button>
              {m.resposta && (
                <div className="mb-1 rounded-lg border-l-2 border-fuchsia-400 bg-black/30 px-2 py-1 text-[11px] text-white/60">
                  <b className="text-fuchsia-300">{m.resposta.nome}</b> · {m.resposta.trecho}
                </div>
              )}
              <p className="break-words text-sm">{m.texto}</p>
              <AcoesDaMsg m={m} />
            </div>
          </div>
        ))}
        <div ref={fimDaLista} />
      </div>


      {estado.eu.podeFalar && segundosRevelacao > 0 && (
        <button
          type="button"
          onClick={() => abrirCamera(true)}
          className="mx-3 mb-1 flex items-center justify-between rounded-xl bg-amber-500/20 px-3 py-2 text-left text-xs text-amber-100"
        >
          <span>👀 <b>Revelação liberada:</b> mande uma foto extra; quem abrir paga 5 tokens pra você</span>
          <span className="tabular-nums">{Math.floor(segundosRevelacao / 60)}:{String(segundosRevelacao % 60).padStart(2, '0')}</span>
        </button>
      )}
      {estado.eu.podeFalar ? (
        <form
          className="relative flex items-center gap-2 border-t border-white/10 px-3 py-2"
          onSubmit={(e) => { e.preventDefault(); void enviar(); }}
        >
          <input
            ref={cameraRef}
            type="file"
            accept="image/*,video/*"
            capture="user"
            className="hidden"
            onChange={(e) => void enviarMidia(e.target.files?.[0])}
          />
          <input
            ref={galeriaRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => void enviarMidia(e.target.files?.[0])}
          />
          {respondendo && enviandoMidia === null && !escolhendoMidia && (
            <div className="absolute bottom-full left-3 right-3 mb-2 flex items-center gap-2 rounded-xl bg-zinc-900/95 px-3 py-2 text-xs ring-1 ring-fuchsia-500/40">
              <span className="min-w-0 flex-1 truncate">↩️ Respondendo <b className="text-fuchsia-300">{respondendo.autor?.nome ?? 'Lola'}</b>: {respondendo.tipo === 'midia' ? 'mídia' : respondendo.texto}</span>
              <button type="button" onClick={() => setRespondendo(null)} aria-label="Cancelar resposta"><X className="h-4 w-4" /></button>
            </div>
          )}
          {escolhendoMidia && enviandoMidia === null && (
            <div className="absolute bottom-full left-3 mb-2 w-[min(20rem,calc(100vw-1.5rem))] space-y-2 rounded-2xl bg-zinc-900 p-2 shadow-xl ring-1 ring-white/10">
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/40 p-1 text-xs">
                <button type="button" onClick={() => setMidiaUnica(true)} className={cn('rounded-lg px-2 py-1.5', midiaUnica ? 'bg-rose-600 font-semibold' : 'text-white/70')}>👁️ Visualização única</button>
                <button type="button" onClick={() => setMidiaUnica(false)} className={cn('rounded-lg px-2 py-1.5', !midiaUnica ? 'bg-rose-600 font-semibold' : 'text-white/70')}>🌍 Para todos verem</button>
              </div>
              <div className="flex gap-2">
                <button type="button" className="flex-1 rounded-xl bg-white/10 px-3 py-2 text-sm" onClick={() => { setEscolhendoMidia(false); abrirCamera(false); }}>📷 Câmera</button>
                <button type="button" className="flex-1 rounded-xl bg-white/10 px-3 py-2 text-sm" onClick={() => { setEscolhendoMidia(false); abrirGaleria(); }}>🖼️ Galeria</button>
              </div>
            </div>
          )}
          {enviandoMidia !== null && (
            <div className="absolute bottom-full left-3 right-3 mb-2 rounded-2xl bg-zinc-900/95 p-3 shadow-xl ring-1 ring-fuchsia-500/40">
              <p className="mb-1.5 flex items-center justify-between text-xs text-white/80">
                <span>
                  {enviandoMidia < 99
                    ? `Enviando ${tipoEnviando === 'video' ? 'vídeo' : 'foto'}…`
                    : tipoEnviando === 'video' ? 'Processando o vídeo… pode levar até 1 minuto' : 'Processando a foto…'}
                </span>
                <span className="tabular-nums">{enviandoMidia < 99 ? `${enviandoMidia}%` : '⏳'}</span>
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className={cn('h-full rounded-full bg-gradient-to-r from-rose-500 to-fuchsia-500 transition-all', enviandoMidia >= 99 && 'animate-pulse')}
                  style={{ width: `${Math.max(4, enviandoMidia)}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-white/50">Não feche a tela até terminar.</p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setEscolhendoMidia((v) => !v)}
            disabled={enviandoMidia !== null}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 disabled:opacity-50"
            aria-label="Enviar foto ou vídeo"
            title="Foto ou vídeo (visualização única)"
          >
            {enviandoMidia !== null ? <span className="text-[10px] tabular-nums">{enviandoMidia < 99 ? `${enviandoMidia}%` : "⏳"}</span> : <Camera className="h-4 w-4" />}
          </button>
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={280}
            placeholder="Fale com a sala…"
            className="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-2.5 text-[16px] text-white placeholder:text-white/40 outline-none"
          />
          <button type="submit" disabled={!texto.trim()} className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-600 disabled:opacity-40" aria-label="Enviar">
            <Send className="h-4 w-4" />
          </button>
        </form>
      ) : (
        <div className="border-t border-white/10 px-3 py-3">
          {estado.presentes.length >= 2 && <p className="mb-1.5 text-center text-xs font-semibold text-rose-200">🔥 {estado.presentes.length} pessoas conversando nesta sala agora</p>}
          <Button className="w-full bg-gradient-to-r from-rose-600 to-fuchsia-600" onClick={() => navigate('/subscriptions?origem=casa')}>
            <Crown className="mr-2 h-4 w-4" /> Assine agora e entre na conversa
          </Button>
          <p className="mt-1 text-center text-[11px] text-white/50">Você está espiando: ninguém vê que você está aqui.</p>
        </div>
      )}

      <Dialog open={convitePremium} onOpenChange={setConvitePremium}>
        <DialogContent className="z-[9995] max-w-sm overflow-hidden border-rose-500/50 bg-gradient-to-br from-zinc-950 via-fuchsia-950 to-rose-900 text-white">
          <div className="space-y-3 text-center">
            <p className="text-4xl">👀🔥</p>
            <DialogTitle className="text-2xl font-black">Você está perdendo a festa</DialogTitle>
            <p className="text-sm text-white/85">
              {estado && estado.presentes.length >= 2 ? `${estado.presentes.length} pessoas estão conversando nesta sala agora. ` : ''}
              Assinando, você fala, brinca com a Lola, paga drinks, vê as fotos e vai pra cabine hoje mesmo.
            </p>
            <Button size="lg" className="w-full bg-gradient-to-r from-rose-600 to-fuchsia-600 font-bold" onClick={() => { setConvitePremium(false); navigate('/subscriptions?origem=casa'); }}>
              <Crown className="mr-2 h-4 w-4" /> Assinar e entrar na conversa
            </Button>
            <Button variant="ghost" className="w-full text-white/60 hover:bg-white/10 hover:text-white" onClick={() => setConvitePremium(false)}>Continuar espiando</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={escolhendoPulseira} onOpenChange={(v) => { if (!v) { setEscolhendoPulseira(false); setPulseiraDispensada(true); } }}>
        <DialogContent className="z-[9995] max-w-sm">
          <DialogHeader><DialogTitle>Escolha sua pulseira da noite</DialogTitle></DialogHeader>
          <p className="-mt-2 text-xs text-muted-foreground">Como numa casa de verdade: todo mundo vê a sua cor e sabe o que você topa hoje. Dá para trocar quando quiser.</p>
          <div className="grid gap-2">
            {PULSEIRAS.map((p) => (
              <button
                key={p.cor}
                type="button"
                onClick={() => void escolherPulseira(p.cor)}
                className={cn('flex items-center gap-3 rounded-xl border p-3 text-left transition hover:bg-muted', estado.eu.pulseira === p.cor && 'border-primary bg-primary/10')}
              >
                <span className={cn('h-4 w-10 shrink-0 rounded-full', p.classe)} />
                <span>
                  <span className="block text-sm font-semibold">{p.emoji} {p.titulo}</span>
                  <span className="block text-xs text-muted-foreground">{p.descricao}</span>
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!propondoPara} onOpenChange={(v) => !v && setPropondoPara(null)}>
        <DialogContent className="z-[9995] max-h-[85vh] max-w-sm overflow-y-auto">
          <DialogHeader><DialogTitle>😈 Desafio para {propondoPara?.nome}</DialogTitle></DialogHeader>
          <p className="-mt-2 text-xs text-muted-foreground">Se aceitar e cumprir em 5 minutos, recebe os tokens. Se recusar ou não cumprir, eles voltam pra você.</p>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {sugestoes.filter((x) => x.nivel === 'quente' || estado.sala.nivel === 'muito_quente').map((x) => (
              <button key={x.texto} type="button" onClick={() => setTextoDesafio(x.texto)}
                className={cn('rounded-full border px-2.5 py-1 text-left text-xs', textoDesafio === x.texto ? 'border-primary bg-primary/15' : 'hover:bg-muted')}>
                {x.texto}
              </button>
            ))}
          </div>
          <textarea
            value={textoDesafio}
            onChange={(e) => setTextoDesafio(e.target.value)}
            maxLength={160}
            rows={2}
            placeholder="Ou escreva o seu desafio…"
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
          />
          <div>
            <p className="mb-1 text-xs font-semibold">Quanto vale?</p>
            <div className="flex gap-1.5">
              {[5, 10, 20, 50].map((t) => (
                <Button key={t} size="sm" variant={tokensDesafio === t ? 'default' : 'outline'} className="h-8 flex-1 text-xs" onClick={() => setTokensDesafio(t)}>{t} tokens</Button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={privadoDesafio} onChange={(e) => setPrivadoDesafio(e.target.checked)} />
            🤫 Só pra mim (a foto não aparece para a sala)
          </label>
          <Button className="bg-gradient-to-r from-rose-600 to-fuchsia-600" disabled={textoDesafio.trim().length < 3} onClick={() => void enviarProposta()}>
            Enviar desafio ({tokensDesafio} tokens)
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!propostaRecebida} onOpenChange={(v) => !v && void responderProposta(false)}>
        <DialogContent className="z-[9995] max-w-xs">
          {propostaRecebida && (
            <div className="flex flex-col items-center gap-3 text-center">
              <Avatar p={propostaRecebida.de} tamanho="h-16 w-16" />
              <p className="text-sm"><b>{propostaRecebida.de.nome}</b> te desafiou{propostaRecebida.privado ? ' (só ele(a) vai ver 🤫)' : ''}:</p>
              <p className="rounded-xl bg-muted px-3 py-2 text-sm font-semibold">"{propostaRecebida.texto}"</p>
              <p className="text-sm">Vale <b className="text-fuchsia-500">{propostaRecebida.tokens} tokens</b> se cumprir em 5 minutos.</p>
              <div className="grid w-full grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => void responderProposta(false)}>Recusar</Button>
                <Button className="bg-rose-600 hover:bg-rose-500" onClick={() => void responderProposta(true)}>Aceito 😈</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!decisao} onOpenChange={(v) => { if (!v) setDecisao(null); }}>
        <DialogContent className="z-[9996] max-w-xs text-center">
          <DialogHeader>
            <DialogTitle>
              {decisao?.tipo === 'porta' ? '🚪 Abrir a porta da cabine?' : decisao?.tipo === 'convite' ? '🙋 Chamar mais alguém?' : '🙋 Alguém quer entrar'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {decisao?.tipo === 'porta'
              ? `${decisao.nome} quer abrir a porta: quem está na sala vai poder espiar e pedir para entrar. A porta só abre se todos concordarem.`
              : decisao?.tipo === 'convite'
                ? `${decisao.nome} quer convidar ${decisao.alvoNome} para a cabine. A pessoa só entra se todos aqui dentro concordarem.`
                : `${decisao?.nome} pediu para entrar na cabine. Só entra se todos aqui dentro concordarem.`}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => {
              const d = decisao;
              setDecisao(null);
              if (!d) return;
              if (d.tipo === 'porta') void apiClient.post(`/casa/cabine/${d.cabineId}/porta`, { abrir: false }).catch(() => {});
              else if (d.alvoPublico) void apiClient.post(`/casa/cabine/${d.cabineId}/entrada/${encodeURIComponent(d.alvoPublico)}`, { aprovar: false }).catch(() => {});
            }}>Não</Button>
            <Button className="bg-gradient-to-r from-rose-600 to-fuchsia-600" onClick={() => {
              const d = decisao;
              setDecisao(null);
              if (!d) return;
              if (d.tipo === 'porta') void apiClient.post(`/casa/cabine/${d.cabineId}/porta`, { abrir: true }).catch(() => {});
              else if (d.alvoPublico) void apiClient.post(`/casa/cabine/${d.cabineId}/entrada/${encodeURIComponent(d.alvoPublico)}`, { aprovar: true }).catch(() => {});
            }}>Concordo 😈</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={comprarAberto} onOpenChange={setComprarAberto}>
        <DialogContent className="z-[9996] max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader><DialogTitle>🪙 Seus tokens acabaram</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Compre aqui mesmo, sem sair da Casa. Pelo Pix, os tokens caem em segundos e o saldo no topo da sala atualiza sozinho.</p>
          <ComprarTokens novaAba aoCreditar={() => {
            setComprarAberto(false);
            toast({ title: '🪙 Tokens na conta!', description: 'Pode voltar pra brincadeira 😈' });
            if (desafioPendente.current) { setPropondoPara(desafioPendente.current); desafioPendente.current = null; }
          }} />
        </DialogContent>
      </Dialog>
      <Dialog open={avisosAbertos} onOpenChange={setAvisosAbertos}>
        <DialogContent className="z-[9995] max-h-[80vh] max-w-sm overflow-y-auto">
          <DialogHeader><DialogTitle>🔔 Seus avisos na Casa</DialogTitle></DialogHeader>
          {notifs.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nada por aqui ainda. Dê uma olhada em alguém ou pague um drink pra esquentar 😏</p>
          ) : (
            <ul className="divide-y">
              {notifs.map((n) => (
                <li key={n.id} className="flex items-center gap-3 py-2">
                  <span className="text-xl">{n.emoji}</span>
                  <div className="min-w-0 flex-1">
                    {n.de ? (
                      <p className="text-sm">
                        <button type="button" className="font-semibold text-fuchsia-600 underline-offset-2 hover:underline dark:text-fuchsia-300"
                          onClick={() => { setAvisosAbertos(false); abrirPorIdRef.current(n.de!.id, n.de!.nome); }}>{n.de.nome}</button>
                        {n.texto.startsWith(n.de.nome) ? n.texto.slice(n.de.nome.length) : ` · ${n.texto}`}
                      </p>
                    ) : <p className="text-sm">{n.texto}</p>}
                    <p className="text-[11px] text-muted-foreground">{new Date(n.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  {n.acao && (
                    <Button size="sm" variant="outline" onClick={() => { setAvisosAbertos(false); n.acao?.(); }}>{n.rotuloAcao ?? 'Abrir'}</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={rankingAberto} onOpenChange={setRankingAberto}>
        <DialogContent className="z-[9995] max-h-[85vh] max-w-sm overflow-y-auto">
          <DialogHeader><DialogTitle>🏆 Ranking da Casa</DialogTitle></DialogHeader>
          <RankingDaCasa />
        </DialogContent>
      </Dialog>

      <Dialog open={!!cruzados} onOpenChange={(v) => !v && setCruzados(null)}>
        <DialogContent className="z-[9995] max-w-xs">
          {cruzados && (
            <div className="flex flex-col items-center gap-3 text-center">
              <Avatar p={cruzados} tamanho="h-20 w-20" />
              <p className="text-lg font-bold">{motivoCruzado === 'brinde' ? '🥂 Vocês brindaram!' : '💘 Olhares cruzados!'}</p>
              <p className="text-sm text-muted-foreground">
                {motivoCruzado === 'brinde' ? <>Drink pago e brinde de volta com <b>{cruzados.nome}</b>…</> : <>Você e <b>{cruzados.nome}</b> se olharam.</>} A Lola acha que isso merece uma cabine 😈
              </p>
              <div className="grid w-full grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setCruzados(null)}>Depois</Button>
                <Button className="bg-rose-600 hover:bg-rose-500" onClick={() => { const c = cruzados; setCruzados(null); void convidar(c); }}>Chamar 🚪</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {cabineAberta && (
        <CabineDaCasa
          key={`${cabineAberta.id}-${cabineAberta.modo}`}
          cabineId={cabineAberta.id}
          modo={cabineAberta.modo}
          meuIdPublico={estado.eu.idPublico ?? user?.id ?? null}
          convidaveis={estado.presentes}
          outrasCabines={cabinesAbertas.filter((c) => c.souMembro && c.id !== cabineAberta.id).map((c) => ({
            id: c.id, nomes: c.membros.filter((m) => m.id !== estado.eu.idPublico).map((m) => m.nome).join(', ') || 'cabine',
          }))}
          onTrocar={(id) => setCabineAberta({ id, modo: 'membro' })}
          onVerPerfil={(id) => setPerfilAberto(id)}
          onChamarParaOutra={(p) => void convidar(p)}
          onVoltar={() => setCabineAberta(null)}
          onSaiu={() => { setMinhasCabines((l) => l.filter((x) => x !== cabineAberta.id)); setCabineAberta(null); }}
        />
      )}

      <Dialog open={!!conviteCabine} onOpenChange={(v) => !v && void responderConviteCabine(false)}>
        <DialogContent className="z-[9995] max-w-xs">
          <DialogHeader><DialogTitle>🚪 Convite para a cabine</DialogTitle></DialogHeader>
          <p className="text-sm"><b>{conviteCabine?.membros.join(', ')}</b> te chamaram para entrar na cabine deles 😈</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => void responderConviteCabine(false)}>Agora não</Button>
            <Button className="bg-rose-600 hover:bg-rose-500" onClick={() => void responderConviteCabine(true)}>Entrar 🔥</Button>
          </div>
        </DialogContent>
      </Dialog>

      {vendo && (
        <div className="fixed inset-0 z-[9996] flex items-center justify-center bg-black" onContextMenu={(e) => e.preventDefault()}>
          <button type="button" onClick={() => setVendo(null)} className="absolute right-3 top-3 z-10 rounded-full bg-white/15 p-2" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
          {vendo.mime?.startsWith('video/')
            ? <video src={resolveServerUrl(vendo.url)} autoPlay playsInline controls={false} className="max-h-full max-w-full select-none" />
            : <img src={resolveServerUrl(vendo.url)} alt="" draggable={false} className="max-h-full max-w-full select-none" />}
          {/* Reagir e comentar enquanto vê: o comentário vai para a sala respondendo a mídia. */}
          <div className="absolute bottom-0 left-0 right-0 space-y-2 bg-gradient-to-t from-black via-black/80 to-transparent px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-8">
            {vendo.msg && estado?.eu.podeFalar && (
              <>
                <div className="flex justify-center gap-1.5">
                  {REACOES.map((e) => {
                    const minha = (vendo.msg?.reacoes?.[e] ?? []).includes(meuId);
                    return (
                      <button key={e} type="button"
                        onClick={() => { const m = vendo.msg!; void reagir(m, e); toast({ title: `${e} enviado pra ${m.autor?.nome ?? 'a pessoa'}` }); }}
                        className={cn('rounded-full px-2.5 py-1.5 text-xl transition hover:scale-110', minha ? 'bg-fuchsia-600/70' : 'bg-white/15')}>{e}</button>
                    );
                  })}
                </div>
                <form className="flex gap-2" onSubmit={(ev) => {
                  ev.preventDefault();
                  const t = comentarioMidia.trim();
                  const m = vendo.msg;
                  if (!t || !m || !salaAtual) return;
                  setComentarioMidia('');
                  void apiClient.post(`/casa/${salaAtual}/mensagem`, { texto: t, respostaA: m.id })
                    .then(() => toast({ title: 'Comentário enviado na sala 🔥' }))
                    .catch((e) => toast({ title: erroDe(e, 'Comentário não enviado.'), variant: 'destructive' }));
                }}>
                  <input value={comentarioMidia} onChange={(e) => setComentarioMidia(e.target.value)} maxLength={280}
                    placeholder={`Comente pra ${vendo.msg.autor?.nome ?? 'a pessoa'}… 😏`}
                    className="min-w-0 flex-1 rounded-full bg-white/15 px-4 py-2 text-base text-white placeholder:text-white/50 focus:outline-none" />
                  <button type="submit" className="rounded-full bg-gradient-to-r from-rose-600 to-fuchsia-600 px-4 text-sm font-semibold" aria-label="Enviar comentário"><Send className="h-4 w-4" /></button>
                </form>
              </>
            )}
            <p className="text-center text-[11px] text-white/60">Visualização única: ao fechar, não abre de novo.</p>
          </div>
        </div>
      )}

      {efeito && <EfeitoDaCasa key={efeito.id} efeito={efeito.efeito} texto={efeito.texto} onFim={fimDoEfeito} />}
      {!info?.teste && <ProtecaoDaCasa nome={String((user as any)?.name || '')} id={String(user?.id || '')} />}
      <Dialog open={!!drinkRecebido} onOpenChange={(v) => { if (!v) setDrinkRecebido(null); }}>
        <DialogContent className="z-[9995] max-w-xs">
          {drinkRecebido && (
            <div className="flex flex-col items-center gap-3 text-center">
              <Avatar p={{ ...drinkRecebido.de }} tamanho="h-20 w-20" />
              <p className="text-lg font-bold">{drinkRecebido.de.nome} te pagou {drinkRecebido.drink} 😏</p>
              <p className="text-xs text-muted-foreground">+{drinkRecebido.tokens} tokens pra você</p>
              {drinkRecebido.mensagem && (
                <p className="w-full rounded-2xl bg-rose-500/10 px-3 py-2 text-sm italic">“{drinkRecebido.mensagem}”</p>
              )}
              {!estado?.sala_anonima && (
                <Button variant="outline" className="w-full" onClick={() => setPerfilAberto(drinkRecebido.de.id)}>Ver perfil antes</Button>
              )}
              <div className="grid w-full grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setDrinkRecebido(null)}>Agora não</Button>
                <Button className="bg-rose-600 hover:bg-rose-500" onClick={() => { const d = drinkRecebido; setDrinkRecebido(null); void brindarRef.current(d.de); }}>🥂 Brindar</Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Brindar avisa {drinkRecebido.de.nome} e pode virar cabine. Recusar é discreto: ninguém fica sabendo.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <PerfilNaCasa userId={perfilAberto} onFechar={() => setPerfilAberto(null)} />
      <Dialog open={!!perguntaBrincar} onOpenChange={(v) => { if (!v) setPerguntaBrincar(null); }}>
        <DialogContent className="z-[9995] max-w-xs text-center">
          <DialogHeader><DialogTitle>💋 A Lola quer saber…</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Você quer entrar nas brincadeiras quentes da noite? A Lola só sorteia quem topar. Dá para mudar a qualquer hora no botão "Quero brincar".</p>
          <div className="grid gap-2">
            <Button className="bg-gradient-to-r from-rose-600 to-fuchsia-600" onClick={() => {
              const salaId = perguntaBrincar;
              setPerguntaBrincar(null);
              setEstado((e) => e ? { ...e, eu: { ...e.eu, querBrincar: true } } : e);
              if (salaId) void apiClient.post(`/casa/${salaId}/brincar`, { quer: true }).catch(() => {});
            }}>🔥 Quero brincar</Button>
            <Button variant="outline" onClick={() => setPerguntaBrincar(null)}>Só curtir por enquanto</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!pessoaAberta} onOpenChange={(v) => { if (!v) { setPessoaAberta(null); setMostrandoBar(false); } }}>
        <DialogContent className="z-[9995] max-w-xs">
          {pessoaAberta && (
            <div className="flex flex-col items-center gap-3 text-center">
              <Avatar p={pessoaAberta} tamanho="h-20 w-20" />
              <div>
                <p className="text-lg font-semibold">{pessoaAberta.nome}</p>
                <p className="text-xs text-muted-foreground">{ROTULO_CAT[pessoaAberta.cat]}{pessoaAberta.cidade ? ` · ${pessoaAberta.cidade}` : ''}{pessoaAberta.querBrincar ? ' · 🔥 brincando' : ''}</p>
                {pessoaAberta.pulseira && (
                  <p className="mt-1 text-xs">Pulseira {corDaPulseira(pessoaAberta.pulseira)?.emoji} <b>{corDaPulseira(pessoaAberta.pulseira)?.titulo}</b></p>
                )}
              </div>
              {mostrandoBar ? (
                <div className="grid w-full grid-cols-2 gap-2">
                  <input value={recadoDrink} onChange={(e) => setRecadoDrink(e.target.value)} maxLength={140}
                    placeholder="Mensagem junto com o drink (opcional)…"
                    className="col-span-2 rounded-xl border bg-background px-3 py-2 text-[16px]" />
                  {DRINKS.map((d) => (
                    <Button key={d.id} variant="outline" className="h-auto flex-col py-2" onClick={() => void pagarDrink(pessoaAberta, d.id)}>
                      <span className="text-2xl">{d.emoji}</span>
                      <span className="text-xs">{d.nome}</span>
                      <span className="text-[10px] text-muted-foreground">{d.tokens} tokens</span>
                    </Button>
                  ))}
                  <p className="col-span-2 text-[11px] text-muted-foreground">Os tokens vão para {pessoaAberta.nome}, e a sala vê que você pagou 😏</p>
                </div>
              ) : (
              <div className="grid w-full gap-2">
                {estado.eu.podeFalar && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" onClick={() => void olhar(pessoaAberta)}>👀 Dar uma olhada</Button>
                      <Button variant="outline" onClick={() => setMostrandoBar(true)}>🍸 Pagar um drink</Button>
                    </div>
                    {pessoaAberta.pulseira !== 'vermelha' && (
                      <Button variant="outline" className="border-amber-400/60" onClick={() => void abrirProposta(pessoaAberta)}>😈 Propor um desafio (vale tokens)</Button>
                    )}
                    <Button className="bg-rose-600 hover:bg-rose-500" onClick={() => void convidar(pessoaAberta)}>🚪 Chamar pra cabine</Button>
                    {pessoaAberta.cat === 'homem' && !estado.sala_anonima && (() => {
                      const eu = estado.presentes.find((x) => x.id === estado.eu.idPublico);
                      if (eu?.cat !== 'casal' && eu?.cat !== 'mulher') return null;
                      const destinos = (info?.salas ?? []).filter((s) => s.id !== estado.sala.id && s.id !== 'glory' && s.id !== 'casais' && !s.trancada);
                      if (destinos.length === 0) return null;
                      return (
                        <div className="rounded-xl border border-amber-400/40 p-2">
                          <p className="mb-1.5 text-xs font-semibold">🎟️ Chamar para outra sala (ele entra sem fila)</p>
                          <div className="flex flex-wrap gap-1.5">
                            {destinos.map((s) => (
                              <Button key={s.id} size="sm" variant="outline" className="h-8 text-xs" onClick={() => void chamarPraSala(pessoaAberta, s.id)}>{s.emoji} {s.nome}</Button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="flex-1 text-xs text-muted-foreground" onClick={() => void denunciar(pessoaAberta)}>🚩 Denunciar</Button>
                  {info?.souAdmin && <Button variant="ghost" size="sm" className="flex-1 text-xs text-destructive" onClick={() => void tirarDaCasa(pessoaAberta)}>🚫 Tirar da Casa</Button>}
                </div>
                {estado.sala_anonima ? (
                  estado.eu.podeFalar && <Button variant="outline" onClick={() => void bater(pessoaAberta)}>🕳️ Bater na parede (anônimo)</Button>
                ) : (
                  <Button variant="outline" onClick={() => { setPerfilAberto(pessoaAberta.id); setPessoaAberta(null); }}>Ver perfil</Button>
                )}
              </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>,
    document.body,
  );

  // ─── Lobby (mesmo visual da página de apresentação /acasa) ───────────────
  const total = (info?.salas ?? []).reduce((s, x) => s + x.total + x.espiando, 0);
  return (
    <div className="dark -mx-3 -mt-3 -mb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] min-h-[calc(100vh-4rem)] bg-gradient-to-b from-zinc-950 via-fuchsia-950 to-zinc-950 px-4 pb-32 pt-8 text-white sm:-mx-4 sm:-mt-6 md:-mb-6 md:pb-16">
      <div className="mx-auto max-w-lg space-y-6">
        <div className="text-center">
          <div className="flex justify-center"><BrandLogo /></div>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.25em] text-fuchsia-300">Boate virtual · só para maiores de 18</p>
          <h1 className="mt-2 text-5xl font-black">A Casa 🔥</h1>
          <p className="mt-3 text-base text-white/85">
            A casa de swing online do NoSigilo. Toda <b>sexta às 21h e sábado às 22h, até 1h</b>: salas ao vivo com casais, mulheres e singles,
            brincadeiras quentes e cabine a dois.
          </p>
        </div>

        <div className="rounded-3xl border border-white/15 bg-white/5 p-5 text-center">
          {info?.aberta ? (
            <>
              <p className="flex items-center justify-center gap-2 text-sm font-semibold text-emerald-300">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" /> ABERTA AGORA{info.tema ? ` · ${info.tema.nome}` : ''}
              </p>
              <p className="mt-2 text-4xl font-black">{total > 0 ? total : '…'}</p>
              <p className="text-sm text-white/70">{total > 0 ? 'pessoas lá dentro neste momento' : 'a festa está começando'}</p>
            </>
          ) : <ContagemRegressiva alvo={info?.proximaAbertura ?? null} />}
        </div>

        {info && !info.aberta && (
          <div className="space-y-3 text-center">
            {info.reservado ? (
              <>
                <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-4 font-semibold text-emerald-200">🎟️ Seu lugar está reservado! Quando abrir, a gente avisa no seu celular.</div>
                <button type="button" className="text-xs text-white/50 underline" onClick={() => void reservar(false)}>Cancelar reserva</button>
              </>
            ) : (
              <Button size="lg" className="h-14 w-full bg-gradient-to-r from-rose-600 to-fuchsia-600 text-lg font-bold" onClick={() => void reservar(true)}>
                🎟️ Reservar meu lugar
              </Button>
            )}
            {info.reservas > 0 && <p className="text-sm text-fuchsia-200">🎟️ {info.reservas} pessoa(s) já reservaram lugar para a próxima noite</p>}
          </div>
        )}
        {info?.aberta && info.salas?.length > 0 && (
          <MapaDaCasa
            salas={info.salas}
            onEntrar={(id) => {
              const s = info.salas.find((x) => x.id === id);
              if (s?.lotadaParaMim) void entrarNaFila(id); else void entrar(id);
            }}
            onEspiar={async (salaId, cabineId) => {
              await entrar(salaId);
              setCabineAberta({ id: cabineId, modo: 'espiar' });
            }}
          />
        )}
        {info?.aberta && <p className="text-center text-sm font-semibold text-fuchsia-200">Ou escolha pela lista 👇</p>}

        {info?.souAdmin && (
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 p-3 text-xs text-white/80">
            <span className="font-semibold">Admin:</span>
            {info.abertaAte
              ? <>aberta até {new Date(info.abertaAte).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} <Button size="sm" variant="outline" className="border-white/30 bg-transparent text-white" onClick={() => void abrirAgora(0)}>Fechar abertura extra</Button></>
              : <Button size="sm" variant="outline" className="border-white/30 bg-transparent text-white" onClick={() => void abrirAgora(60)}>Abrir agora por 1h (teste)</Button>}
            <Button size="sm" variant="outline" className="border-white/30 bg-transparent text-white" onClick={() => navigate('/admin?aba=casa')}>⚙️ Gerenciar</Button>
          </div>
        )}

        <div className="grid gap-3">
          {(info?.salas ?? []).map((s) => {
            const travada = !info?.aberta || s.bloqueadaParaMim || !!s.trancada || (s.lotadaParaMim && s.posicaoNaFila != null);
            return (
              <div key={s.id} className={cn('rounded-2xl p-4 ring-1', temaDaSala(s.id).card)}>
                <div className="flex items-start gap-3">
                  <span className="text-3xl leading-none">{s.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {s.nome}
                      <span className="ml-2 rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-200">{temaDaSala(s.id).chamas} {temaDaSala(s.id).selo}</span>
                    </p>
                    <p className="text-sm text-white/70">{s.descricao}</p>
                    {info?.aberta && (
                      <p className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-white/70">
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{s.total}</span>
                        <span>💑 {s.contagem.casal}</span><span>👩 {s.contagem.mulher}</span><span>👨 {s.contagem.homem}</span>
                        {s.espiando > 0 && <span>👀 {s.espiando}</span>}
                      </p>
                    )}
                  </div>
                </div>
                {info?.aberta && (
                  <Button
                    className={cn('mt-3 w-full', temaDaSala(s.id).botao)}
                    disabled={travada || entrando !== null}
                    onClick={() => void (s.lotadaParaMim ? entrarNaFila(s.id) : entrar(s.id))}
                  >
                    {s.trancada ? `🔒 Abre com mais ${s.faltamParaAbrir ?? ''} pessoa(s) na Casa`
                      : s.bloqueadaParaMim ? 'Só casais e mulheres'
                      : s.lotadaParaMim ? (s.posicaoNaFila ? `Na fila: você é o ${s.posicaoNaFila}º` : 'Sala cheia para homens · Entrar na fila')
                      : entrando === s.id ? 'Entrando…'
                      : info.podeFalar ? 'Entrar' : 'Espiar'}
                  </Button>
                )}
                {!info?.aberta && <p className="mt-2 flex items-center gap-1 text-xs text-white/50"><Lock className="h-3 w-3" />Abre sexta às 21h e sábado às 22h</p>}
              </div>
            );
          })}
        </div>

        {/* Como funciona: o vídeo-tour da Lola. */}
        <div>
          <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-3xl border border-fuchsia-500/40 shadow-[0_0_60px_rgba(236,72,153,0.35)]">
            <video src="/api/casa/apresentacao/video.mp4" poster="/api/casa/apresentacao/capa.jpg" controls playsInline preload="metadata" className="block aspect-[9/16] w-full bg-black object-cover" />
          </div>
          <p className="mt-2 text-center text-xs text-white/60">▶️ Aperte o play: a Lola te mostra como funciona (1 min)</p>
        </div>

        <div className="rounded-3xl bg-gradient-to-br from-fuchsia-800/60 to-rose-800/60 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-fuchsia-200">💋 O que rola lá dentro</p>
          <ul className="mt-3 grid gap-1.5 text-sm text-white/85">
            <li>🟢🟡🟣🔴 Pulseira da noite: todo mundo sabe o que você topa</li>
            <li>💋 A Lola puxa o jogo: eu nunca, verdade ou desafio, duelos e desafios com foto</li>
            <li>🍸 Bar: pague um drink pra quem te chamou atenção</li>
            <li>👀 Olhares cruzados viram cabine, de porta fechada ou aberta</li>
            <li>😈 Desafios valendo tokens entre casais</li>
            <li>🕳️ Glory Hole: sala anônima, revela quem quiser</li>
            <li>🎆 Show da Meia-Noite e 🏆 ranking dos casais</li>
            <li>🎁 +5 tokens por noite só por entrar</li>
          </ul>
        </div>

        <div className="rounded-3xl bg-white/5 p-5 ring-1 ring-white/10">
          <p className="mb-3 font-semibold">🏆 Ranking dos casais</p>
          <RankingDaCasa />
        </div>

        <button type="button" onClick={() => setFeedbackAberto(true)}
          className="w-full rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold text-fuchsia-100 ring-1 ring-white/10 hover:bg-white/10">
          💬 Dar feedback ou sugestão sobre A Casa
        </button>

        <p className="px-2 text-center text-[11px] text-white/50">
          Regra da Casa: consentimento sempre. "Passo" é respeitado, ninguém é exposto e quem desrespeitar é removido. Só maiores de 18.
        </p>

      {sala}
      <FeedbackDaCasa aberto={feedbackAberto} onFechar={() => setFeedbackAberto(false)} />

      <Dialog open={!!convite} onOpenChange={(v) => !v && void responderConvite(false)}>
        <DialogContent className="z-[9999] max-w-xs">
          <DialogHeader><DialogTitle>🚪 Convite pra cabine</DialogTitle></DialogHeader>
          {convite && (
            <div className="flex flex-col items-center gap-3 text-center">
              <Avatar p={convite.de} tamanho="h-16 w-16" />
              <p className="text-sm"><b>{convite.de.nome}</b> ({ROTULO_CAT[convite.de.cat]}) quer ir pra cabine com você.</p>
              <div className="grid w-full grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => void responderConvite(false)}>Agora não</Button>
                <Button className="bg-rose-600 hover:bg-rose-500" onClick={() => void responderConvite(true)}>Topo 🔥</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}

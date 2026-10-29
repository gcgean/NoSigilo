import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, LogOut, Send, X } from 'lucide-react';
import apiClient from '@/utils/apiClient';
import { resolveServerUrl } from '@/utils/serverUrl';
import { useSocket } from '@/contexts/SocketContext';
import { useToast } from '@/hooks/use-toast';
import { profileService } from '@/services/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import EfeitoDaCasa, { temEfeito } from '@/components/EfeitoDaCasa';
import CameraAoVivo, { MAX_VIDEO_SEG } from '@/components/CameraAoVivo';

/**
 * Cabine d'A Casa (backend: rotas /api/casa/cabine/*).
 * A dois ou em grupo. A porta só abre quando TODOS de dentro querem; com a porta
 * aberta, quem está na sala espia (lê e vê as mídias, sem falar) e pode pedir
 * para entrar — todos de dentro precisam aprovar. Mídia sempre de visualização única.
 */
type Pessoa = { id: string; nome: string; avatar: string | null; cat: string; naCasa?: boolean };
type Msg = { id: string; tipo: 'pessoa' | 'lola' | 'sistema' | 'midia' | 'acao'; autor?: Pessoa; texto: string; criadoEm: string; midia?: { tipo: 'foto' | 'video' }; efeito?: string;
  resposta?: { id: string; nome: string; trecho: string }; reacoes?: Record<string, string[]> };
const REACOES = ['🔥', '😈', '💦', '🍑', '🍆', '😍', '👀', '💋'];

// Ações da cabine (o backend confere etapa e tesão). Etapa 1 pede a cabine esquentada; etapa 2, tesão ≥ 40.
const ACOES: { id: string; emoji: string; rotulo: string; etapa: 0 | 1 | 2 }[] = [
  { id: 'beijo', emoji: '💋', rotulo: 'Beijar', etapa: 0 },
  { id: 'pescoco', emoji: '😮‍💨', rotulo: 'Pescoço', etapa: 0 },
  { id: 'mao', emoji: '🤚', rotulo: 'Passar a mão', etapa: 0 },
  { id: 'roupa', emoji: '👙', rotulo: 'Tirar a roupa', etapa: 0 },
  { id: 'colo', emoji: '🍑', rotulo: 'Sentar no colo', etapa: 1 },
  { id: 'tocar', emoji: '🤤', rotulo: 'Tocar', etapa: 1 },
  { id: 'chupar', emoji: '👅', rotulo: 'Cair de boca', etapa: 1 },
  { id: 'chupar_buceta', emoji: '👅', rotulo: 'Chupar buceta', etapa: 1 },
  { id: 'chupar_pica', emoji: '🍆', rotulo: 'Chupar pica', etapa: 1 },
  { id: 'cavalgar', emoji: '🔥', rotulo: 'Cavalgar', etapa: 2 },
  { id: 'quatro', emoji: '🍑', rotulo: 'De quatro', etapa: 2 },
  { id: 'papai', emoji: '🛏️', rotulo: 'Papai e mamãe', etapa: 2 },
  { id: 'gozar', emoji: '💦', rotulo: 'Gozar', etapa: 2 },
];
const ETAPAS = ['😏 Esquentando', '🔥 Preliminares', '💦 Transa'];
// Cenas de casa de swing conforme quem está na cabine (o backend confere as categorias).
type Cat = 'casal' | 'mulher' | 'homem' | 'outros';
const CENAS: { id: string; emoji: string; rotulo: string; etapa: 0 | 1 | 2; quem: Cat; alvo: Cat }[] = [
  { id: 'cc_esposas_beijo', emoji: '💋', rotulo: 'Esposas se beijam', etapa: 0, quem: 'casal', alvo: 'casal' },
  { id: 'cc_esposas_peitos', emoji: '🍒', rotulo: 'Esposas se pegam', etapa: 1, quem: 'casal', alvo: 'casal' },
  { id: 'cc_marido_pega', emoji: '🤚', rotulo: 'Marido pega a outra', etapa: 1, quem: 'casal', alvo: 'casal' },
  { id: 'cc_troca', emoji: '🔄', rotulo: 'Trocar de casal', etapa: 2, quem: 'casal', alvo: 'casal' },
  { id: 'cc_esposa_da', emoji: '💦', rotulo: 'Esposa dá pro outro', etapa: 2, quem: 'casal', alvo: 'casal' },
  { id: 'cc_lado_a_lado', emoji: '🛏️', rotulo: 'Lado a lado', etapa: 2, quem: 'casal', alvo: 'casal' },
  { id: 'ch_marido_libera', emoji: '😈', rotulo: 'Marido libera a esposa', etapa: 0, quem: 'casal', alvo: 'homem' },
  { id: 'hc_toca_esposa', emoji: '🤚', rotulo: 'Tocar a esposa', etapa: 0, quem: 'homem', alvo: 'casal' },
  { id: 'ch_esposa_chupa', emoji: '🍆', rotulo: 'Esposa chupa ele', etapa: 1, quem: 'casal', alvo: 'homem' },
  { id: 'hc_esposa_chupa', emoji: '🍆', rotulo: 'Pôr pra fora', etapa: 1, quem: 'homem', alvo: 'casal' },
  { id: 'ch_dupla', emoji: '🔥', rotulo: 'Os dois nela', etapa: 2, quem: 'casal', alvo: 'homem' },
  { id: 'ch_esposa_provoca', emoji: '😈', rotulo: 'Ela provoca o marido', etapa: 2, quem: 'casal', alvo: 'homem' },
  { id: 'hc_come_esposa', emoji: '💦', rotulo: 'Comer a esposa', etapa: 2, quem: 'homem', alvo: 'casal' },
  { id: 'mc_beija_esposa', emoji: '💋', rotulo: 'Beijar a esposa', etapa: 0, quem: 'mulher', alvo: 'casal' },
  { id: 'mc_beijo_triplo', emoji: '💋', rotulo: 'Beijo triplo', etapa: 0, quem: 'mulher', alvo: 'casal' },
  { id: 'cm_beija_solteira', emoji: '💋', rotulo: 'Esposa beija ela', etapa: 0, quem: 'casal', alvo: 'mulher' },
  { id: 'cm_beijo_triplo', emoji: '💋', rotulo: 'Beijo triplo', etapa: 0, quem: 'casal', alvo: 'mulher' },
  { id: 'mc_chupa_esposa', emoji: '👅', rotulo: 'Chupar a esposa', etapa: 1, quem: 'mulher', alvo: 'casal' },
  { id: 'cm_esposa_chupa', emoji: '👅', rotulo: 'Esposa chupa ela', etapa: 1, quem: 'casal', alvo: 'mulher' },
  { id: 'mc_da_pro_marido', emoji: '🔥', rotulo: 'Dar pro marido', etapa: 2, quem: 'mulher', alvo: 'casal' },
  { id: 'cm_marido_come', emoji: '🔥', rotulo: 'Marido come ela', etapa: 2, quem: 'casal', alvo: 'mulher' },
  { id: 'cm_vice_versa', emoji: '🔄', rotulo: 'Vice-versa', etapa: 2, quem: 'casal', alvo: 'mulher' },
];
const TITULO_CENA: Record<string, string> = { 'casal-casal': 'Troca de casais', 'casal-homem': 'Casal + solteiro', 'homem-casal': 'Casal + solteiro', 'casal-mulher': 'Casal + solteira', 'mulher-casal': 'Casal + solteira' };
type Entrada = Pessoa & { tipo: 'pedido' | 'convite'; aprovei: boolean; aprovados: number; convidadoAceitou: boolean };
type Cabine = {
  id: string; membros: Pessoa[]; aberta: boolean; votosPorta: number; voteiPorta: boolean; espectadores: number;
  espiandoLista?: Pessoa[]; anonima?: boolean;
  souMembro: boolean; souEspectador: boolean; entradas: Entrada[]; pedi: boolean; mensagens: Msg[];
  quente: boolean; votosQuente: number; voteiQuente: boolean; nivel: number; calor?: number; nivelLiberado?: number;
};

const erroDe = (e: unknown, padrao: string) => (e as any)?.response?.data?.message || padrao;

function Foto({ p, tamanho = 'h-8 w-8' }: { p: Pessoa; tamanho?: string }) {
  return (
    <div className={cn('shrink-0 overflow-hidden rounded-full bg-zinc-700 ring-2 ring-fuchsia-500/60', tamanho)}>
      {p.avatar
        ? <img src={resolveServerUrl(p.avatar)} alt={p.nome} className="h-full w-full object-cover" />
        : <div className="flex h-full w-full items-center justify-center text-xs font-bold">{p.nome.charAt(0)}</div>}
    </div>
  );
}

export default function CabineDaCasa({
  cabineId, modo, meuIdPublico, convidaveis, onVoltar, onSaiu, outrasCabines = [], onTrocar, onVerPerfil, onChamarParaOutra,
}: {
  /** Outras cabines em que estou (para alternar). */
  outrasCabines?: { id: string; nomes: string }[];
  onTrocar?: (id: string) => void;
  onVerPerfil?: (id: string) => void;
  /** Chamar quem está espiando para uma conversa privada nova (outra cabine). */
  onChamarParaOutra?: (p: Pessoa) => void;
  cabineId: string;
  modo: 'membro' | 'espiar';
  meuIdPublico: string | null;
  /** Quem está na sala agora (para convidar). */
  convidaveis: Pessoa[];
  onVoltar: () => void;
  onSaiu: () => void;
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { on, off } = useSocket();
  const [cab, setCab] = useState<Cabine | null>(null);
  const [texto, setTexto] = useState('');
  const [vistas, setVistas] = useState<string[]>([]);
  const [vendo, setVendo] = useState<{ url: string; mime: string | null; msg: Msg } | null>(null);
  const [comentario, setComentario] = useState('');
  const [respondendo, setRespondendo] = useState<Msg | null>(null);
  const [reagindoEm, setReagindoEm] = useState<string | null>(null);
  const [convidando, setConvidando] = useState(false);
  const [enviando, setEnviando] = useState<number | null>(null);
  const [tipoEnviando, setTipoEnviando] = useState<'foto' | 'video'>('foto');
  const [cameraAberta, setCameraAberta] = useState(false);
  const [acoesAbertas, setAcoesAbertas] = useState(false);
  // Alguém de dentro quer liberar: pergunta na hora para quem ainda não topou.
  const [pedidoEsquentar, setPedidoEsquentar] = useState<string | null>(null);
  // Aba do painel de ações; quando a Lola libera um nível novo, a aba pula para ele.
  const [aba, setAba] = useState(0);
  const [fogoPiscando, setFogoPiscando] = useState(false);
  const nivelLiberado = cab?.nivelLiberado ?? 0;
  useEffect(() => { setAba(nivelLiberado); }, [nivelLiberado]);
  const [espiaoAberto, setEspiaoAberto] = useState<Pessoa | null>(null);
  // Escolher a provocação da lista ou escrever a sua.
  const [escolhendoProvocacao, setEscolhendoProvocacao] = useState(false);
  const [provocacoes, setProvocacoes] = useState<{ nivel: number; itens: { id: string; texto: string; usada: boolean }[] }[]>([]);
  const [provocacaoEscrita, setProvocacaoEscrita] = useState('');
  const [alvo, setAlvo] = useState<string | null>(null);
  const [efeito, setEfeito] = useState<{ id: string; efeito: string; texto?: string } | null>(null);
  const fimDoEfeito = useCallback(() => setEfeito(null), []);
  const camera = useRef<HTMLInputElement>(null);
  const fim = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    try {
      const rota = modo === 'espiar' ? 'espiar' : 'estado';
      const { data } = await apiClient.post(`/casa/cabine/${cabineId}/${rota}`);
      setCab(data.cabine);
    } catch (e) {
      toast({ title: erroDe(e, 'Essa cabine fechou.') });
      onSaiu();
    }
  }, [cabineId, modo, toast, onSaiu]);
  useEffect(() => { void carregar(); }, [carregar]);
  // Quem espia avisa que continua olhando (senão sai sozinho em ~75s).
  useEffect(() => {
    const t = setInterval(() => { void apiClient.post(`/casa/cabine/${cabineId}/estado`).then((r) => setCab(r.data.cabine)).catch(() => {}); }, 25_000);
    return () => clearInterval(t);
  }, [cabineId]);

  useEffect(() => {
    const aoEstado = (d: { cabine: Cabine }) => { if (d.cabine.id === cabineId) setCab(d.cabine); };
    const aoMsg = (d: { cabineId: string; msg: Msg }) => {
      if (d.cabineId !== cabineId) return;
      setCab((c) => c ? { ...c, mensagens: [...c.mensagens.slice(-150), d.msg] } : c);
      if (temEfeito(d.msg.efeito)) setEfeito({ id: d.msg.id, efeito: d.msg.efeito!, texto: d.msg.texto });
      // O outro fez uma ação ou a Lola liberou nível: o 🔥 pisca (sem abrir o painel por cima do chat).
      if ((d.msg.tipo === 'acao' && d.msg.autor?.id !== meuIdPublico) || (d.msg.tipo === 'lola' && /liberei/.test(d.msg.texto))) setFogoPiscando(true);
    };
    const aoEsquentar = (d: { cabineId: string; nome: string }) => {
      if (d.cabineId !== cabineId) return;
      setAcoesAbertas(true);
      setPedidoEsquentar(d.nome);
    };
    on('casa.cabine.esquentar', aoEsquentar);
    const aoFechou = (d: { cabineId: string; porta?: boolean }) => {
      if (d.cabineId !== cabineId) return;
      toast({ title: d.porta ? '🔒 Fecharam a porta da cabine' : 'A cabine fechou' });
      onSaiu();
    };
    const aoRemovida = (d: { cabineId: string; id: string }) => {
      if (d.cabineId === cabineId) setCab((c) => c ? { ...c, mensagens: c.mensagens.filter((m) => m.id !== d.id) } : c);
    };
    const aoReacao = (d: { cabineId: string; mensagemId: string; reacoes: Record<string, string[]> }) => {
      if (d.cabineId === cabineId) setCab((c) => c ? { ...c, mensagens: c.mensagens.map((m) => m.id === d.mensagemId ? { ...m, reacoes: d.reacoes } : m) } : c);
    };
    on('casa.cabine.reacao', aoReacao);
    on('casa.cabine.estado', aoEstado); on('casa.cabine.mensagem', aoMsg); on('casa.cabine.fechou', aoFechou); on('casa.cabine.mensagem.removida', aoRemovida);
    return () => { off('casa.cabine.esquentar', aoEsquentar); off('casa.cabine.reacao', aoReacao); off('casa.cabine.estado', aoEstado); off('casa.cabine.mensagem', aoMsg); off('casa.cabine.fechou', aoFechou); off('casa.cabine.mensagem.removida', aoRemovida); };
  }, [on, off, cabineId, toast, onSaiu, meuIdPublico]);
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }); }, [cab?.mensagens.length]);

  const post = async (rota: string, corpo?: unknown) => {
    try { return (await apiClient.post(`/casa/cabine/${cabineId}/${rota}`, corpo)).data; }
    catch (e) { toast({ title: erroDe(e, 'Não foi possível agora.'), variant: 'destructive' }); return null; }
  };
  const enviar = async () => {
    const t = texto.trim();
    if (!t) return;
    const resp = respondendo;
    setTexto('');
    setRespondendo(null);
    if (!(await post('mensagem', { texto: t, ...(resp ? { respostaA: resp.id } : {}) }))) { setTexto(t); setRespondendo(resp); }
  };
  const reagir = async (m: Msg, emoji: string) => {
    setReagindoEm(null);
    const r = await post('reagir', { mensagemId: m.id, emoji });
    if (r?.reacoes) setCab((c) => c ? { ...c, mensagens: c.mensagens.map((x) => x.id === m.id ? { ...x, reacoes: r.reacoes } : x) } : c);
  };
  // Comentário feito com a foto/vídeo aberto: vai para a cabine respondendo a mídia.
  const comentarMidia = async () => {
    const t = comentario.trim();
    if (!t || !vendo) return;
    setComentario('');
    if (await post('mensagem', { texto: t, respostaA: vendo.msg.id })) toast({ title: 'Comentário enviado 😏' });
    else setComentario(t);
  };
  const Acoes = ({ m }: { m: Msg }) => {
    const reacoes = Object.entries(m.reacoes ?? {}).filter(([, ids]) => ids.length > 0);
    if (!cab?.souMembro && reacoes.length === 0) return null;
    return (
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {reacoes.map(([emoji, ids]) => (
          <button key={emoji} type="button" disabled={!cab?.souMembro} onClick={() => void reagir(m, emoji)}
            className={cn('rounded-full px-1.5 py-0.5 text-[11px]', meuIdPublico && ids.includes(meuIdPublico) ? 'bg-rose-600/60 ring-1 ring-rose-300' : 'bg-black/30')}>
            {emoji} {ids.length}
          </button>
        ))}
        {cab?.souMembro && (
          <>
            <button type="button" onClick={() => setReagindoEm(reagindoEm === m.id ? null : m.id)} className="rounded-full bg-black/20 px-1.5 py-0.5 text-[11px] text-white/60 hover:text-white" aria-label="Reagir">😈+</button>
            <button type="button" onClick={() => setRespondendo(m)} className="rounded-full bg-black/20 px-1.5 py-0.5 text-[11px] text-white/60 hover:text-white">↩️ Responder</button>
            {m.autor?.id === meuIdPublico && (m.tipo === 'pessoa' || m.tipo === 'midia') && (
              <button type="button" className="rounded-full bg-black/20 px-1.5 py-0.5 text-[11px] text-white/60 hover:text-rose-300"
                onClick={() => {
                  if (!window.confirm('Apagar para todos da cabine?')) return;
                  void post(`mensagem/${m.id}/apagar`).then((r) => { if (r) setCab((c) => c ? { ...c, mensagens: c.mensagens.filter((x) => x.id !== m.id) } : c); });
                }}>🗑️ Apagar</button>
            )}
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
  // Duração de um vídeo escolhido pelo seletor nativo (quando a câmera do navegador não abre).
  const duracaoDoVideo = (arquivo: File) => new Promise<number>((resolve) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(arquivo);
    v.preload = 'metadata';
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Number.isFinite(v.duration) ? v.duration : 0); };
    v.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
    v.src = url;
  });
  const enviarMidia = async (arquivo?: File) => {
    if (!arquivo) return;
    const ehVideo = arquivo.type ? arquivo.type.startsWith('video/') : /\.(mp4|mov|m4v|webm|3gp)$/i.test(arquivo.name);
    if (ehVideo && (await duracaoDoVideo(arquivo)) > MAX_VIDEO_SEG + 1) {
      toast({ title: 'Vídeo longo demais', description: `Na cabine o vídeo vai até ${MAX_VIDEO_SEG} segundos.`, variant: 'destructive' });
      if (camera.current) camera.current.value = '';
      return;
    }
    setTipoEnviando(ehVideo ? 'video' : 'foto');
    setEnviando(0);
    try {
      const up = await profileService.uploadMedia(arquivo, { source: 'chat' }, (p) => setEnviando(Math.min(100, p)));
      setEnviando(100);
      await post('midia', { mediaId: up.id });
    } catch (e) {
      toast({ title: (e as Error)?.message || 'Não foi possível enviar.', variant: 'destructive' });
    } finally {
      setEnviando(null);
      if (camera.current) camera.current.value = '';
    }
  };
  const ver = async (m: Msg) => {
    try {
      const { data } = await apiClient.post(`/casa/cabine/${cabineId}/midia/${m.id}/ver`);
      setComentario('');
      setVendo({ url: data.url, mime: data.mime, msg: m });
    } catch (e) { toast({ title: erroDe(e, 'Essa mídia não está mais disponível.') }); }
    setVistas((v) => [...v, m.id]);
  };
  const abrirProvocacoes = async () => {
    setEscolhendoProvocacao(true);
    try { setProvocacoes((await apiClient.get(`/casa/cabine/${cabineId}/provocacoes`)).data.niveis ?? []); } catch { /* lista vazia: dá para sortear ou escrever */ }
  };
  const mandarProvocacao = async (corpo: { escolha?: string; texto?: string; dado?: boolean }) => {
    if (await post('provocacao', corpo)) { setEscolhendoProvocacao(false); setProvocacaoEscrita(''); }
  };
  const agir = async (acao: string) => {
    const outros = (cab?.membros ?? []).filter((m) => m.id !== meuIdPublico);
    const com = outros.length === 1 ? outros[0].id : alvo;
    if (!com) { toast({ title: 'Escolha com quem primeiro 😏' }); return; }
    await post('acao', { acao, alvo: com });
  };
  const sair = async () => {
    await post('sair');
    onSaiu();
  };
  const continuarNoChat = async () => {
    const r = await post('conversa');
    if (r?.conversationId) navigate(`/chat/${r.conversationId}`);
  };

  if (!cab) {
    return <div className="fixed inset-0 z-[9993] flex items-center justify-center bg-zinc-950 text-white/70">Abrindo a cabine…</div>;
  }
  const idsDentro = new Set(cab.membros.map((m) => m.id));
  return (
    <div className="fixed inset-0 z-[9993] flex flex-col bg-gradient-to-b from-[#2a0010] via-[#160008] to-black text-white"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {/* Luz vermelha de cabine: deixa claro que aqui não é a sala. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_at_top,rgba(225,29,72,0.35),transparent_70%)]" />
      {efeito && <EfeitoDaCasa key={efeito.id} efeito={efeito.efeito} onFim={fimDoEfeito} />}
      <div className="relative bg-gradient-to-r from-rose-700 via-red-600 to-rose-700 py-1 text-center text-[11px] font-black uppercase tracking-[0.3em] shadow-[0_0_20px_rgba(225,29,72,0.6)]">
        🔒 Cabine privada {cab.aberta ? '· porta aberta 👀' : '· só vocês'}
      </div>
      <div className="relative flex items-center gap-2 border-b border-rose-500/30 px-3 py-2">
        <button type="button" onClick={onVoltar} className="rounded-full p-2 hover:bg-white/10" aria-label="Voltar à sala"><ArrowLeft className="h-5 w-5" /></button>
        <div className="flex -space-x-2">{cab.membros.slice(0, 4).map((m) => <Foto key={m.id} p={m} />)}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            🚪 {cab.membros.map((m, i) => (
              <span key={m.id} className={cn(m.naCasa === false && 'text-white/45')}>
                {i > 0 && ', '}{m.nome}{m.naCasa === false && ' 📴'}
              </span>
            ))}
          </p>
          {cab.membros.some((m) => m.naCasa === false && m.id !== meuIdPublico) && (
            <p className="text-[11px] font-semibold text-amber-300">📴 {cab.membros.filter((m) => m.naCasa === false && m.id !== meuIdPublico).map((m) => m.nome).join(', ')} saiu da Casa por enquanto</p>
          )}
          <p className="text-[11px] text-white/60">
            {cab.aberta ? `👀 Porta aberta · ${cab.espectadores} espiando` : '🔒 Porta fechada'}
            {cab.souEspectador ? ' · você está espiando' : ''}
          </p>
        </div>
        {cab.souMembro && (
          <button type="button" onClick={() => void sair()} className="rounded-full p-2 hover:bg-white/10" aria-label="Sair da cabine" title="Sair da cabine">
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>

      {outrasCabines.length > 0 && onTrocar && (
        <div className="relative flex gap-1.5 overflow-x-auto border-b border-rose-500/20 bg-black/30 px-3 py-1.5">
          <span className="shrink-0 py-1 text-[11px] text-white/60">Suas cabines:</span>
          <span className="shrink-0 rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-bold">Esta</span>
          {outrasCabines.map((o) => (
            <button key={o.id} type="button" onClick={() => onTrocar(o.id)} className="max-w-[10rem] shrink-0 truncate rounded-full bg-white/10 px-2.5 py-1 text-[11px] hover:bg-white/20">🚪 {o.nomes}</button>
          ))}
        </div>
      )}
      {cab.souMembro && (cab.espiandoLista?.length ?? 0) > 0 && (
        <div className="relative flex items-center gap-1.5 overflow-x-auto border-b border-rose-500/20 bg-black/20 px-3 py-1.5">
          <span className="shrink-0 text-[11px] text-white/60">👀 Espiando:</span>
          {cab.espiandoLista!.map((p) => (
            <button key={p.id} type="button" onClick={() => setEspiaoAberto(p)} className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 py-0.5 pl-0.5 pr-2 text-[11px] hover:bg-white/20">
              <Foto p={p} tamanho="h-5 w-5" /> {p.nome}
            </button>
          ))}
        </div>
      )}
      {cab.souMembro && (
        <div className="space-y-2 border-b border-white/10 px-3 py-1.5">
          {/* Uma linha só (rola para o lado no celular) para sobrar tela para a conversa. */}
          <div className="flex gap-1.5 overflow-x-auto">
            <button type="button" title="A porta só abre quando todos aqui dentro querem. Qualquer um pode fechar."
              onClick={() => void post('porta', { abrir: !cab.voteiPorta })}
              className={cn('shrink-0 rounded-full border px-2.5 py-1 text-[11px]', cab.voteiPorta ? 'border-amber-400 text-amber-200' : 'border-white/20')}>
              {cab.aberta ? '🔒 Fechar porta' : cab.voteiPorta ? `👀 Porta ✓ ${cab.votosPorta}/${cab.membros.length}` : `👀 Abrir porta ${cab.votosPorta}/${cab.membros.length}`}
            </button>
            <button type="button" onClick={() => setConvidando((v) => !v)} className="shrink-0 rounded-full border border-white/20 px-2.5 py-1 text-[11px]">➕ Convidar</button>
            {cab.membros.length === 2 && (
              <button type="button" onClick={() => void continuarNoChat()} className="shrink-0 rounded-full border border-white/20 px-2.5 py-1 text-[11px]">💬 Ir pro chat</button>
            )}
            {cab.quente && (
              <>
                <button type="button" onClick={() => void abrirProvocacoes()} className="shrink-0 rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-semibold">😈 Provocação</button>
                <button type="button" onClick={() => void post('provocacao', { dado: true })} className="shrink-0 rounded-full bg-fuchsia-600 px-2.5 py-1 text-[11px] font-semibold">🎲 Dado</button>
                <button type="button" onClick={() => void post('esquentar', { quer: false })} className="shrink-0 rounded-full border border-white/30 px-2.5 py-1 text-[11px]">🧊 Esfriar</button>
              </>
            )}
          </div>
          {convidando && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {convidaveis.filter((p) => !idsDentro.has(p.id) && p.id !== meuIdPublico).map((p) => (
                <button key={p.id} type="button" onClick={() => { setConvidando(false); void post('convidar', { para: p.id }); }}
                  className="flex w-14 shrink-0 flex-col items-center gap-1">
                  <Foto p={p} tamanho="h-10 w-10" />
                  <span className="w-full truncate text-center text-[10px]">{p.nome}</span>
                </button>
              ))}
              {convidaveis.filter((p) => !idsDentro.has(p.id) && p.id !== meuIdPublico).length === 0 && <p className="text-xs text-white/60">Ninguém mais na sala agora.</p>}
            </div>
          )}
          {cab.entradas.map((e) => (
            <div key={e.id} className="flex items-center gap-2 rounded-xl bg-white/5 p-2">
              <Foto p={e} />
              <p className="min-w-0 flex-1 text-xs">
                <b>{e.nome}</b> {e.tipo === 'pedido' ? 'quer participar 🙋' : e.convidadoAceitou ? 'aceitou o convite' : 'foi convidado(a)'}
                <span className="text-white/50"> · {e.aprovados}/{cab.membros.length} aprovaram</span>
              </p>
              {!e.aprovei && (
                <>
                  <Button size="sm" className="h-7 bg-emerald-600 px-2 text-xs hover:bg-emerald-500" onClick={() => void post(`entrada/${e.id}`, { aprovar: true })}>Aprovar</Button>
                  <Button size="sm" variant="outline" className="h-7 border-white/20 bg-transparent px-2 text-xs text-white" onClick={() => void post(`entrada/${e.id}`, { aprovar: false })}>Não</Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {cab.mensagens.map((m) => m.tipo === 'sistema' ? (
          <p key={m.id} className="text-center text-[11px] text-white/45">{m.texto}</p>
        ) : m.tipo === 'acao' ? (
          <p key={m.id} className="mx-auto w-fit max-w-[92%] rounded-full bg-gradient-to-r from-rose-700/70 to-red-800/70 px-3 py-1.5 text-center text-sm font-semibold italic shadow-[0_0_14px_rgba(225,29,72,0.45)]">{m.texto}</p>
        ) : m.tipo === 'lola' ? (
          <div key={m.id} className="max-w-[90%] rounded-2xl rounded-tl-sm bg-gradient-to-br from-fuchsia-700 to-rose-700 px-3 py-2">
            <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-fuchsia-100">💋 Lola · anfitriã IA</p>
            <p className="whitespace-pre-line text-sm">{m.texto}</p>
          </div>
        ) : (
          <div key={m.id} className={cn('flex items-start gap-2', m.autor?.id === meuIdPublico && 'flex-row-reverse')}>
            {m.autor && <Foto p={m.autor} tamanho="h-7 w-7" />}
            <div className={cn('min-w-0 max-w-[85%] rounded-2xl px-3 py-1.5', m.autor?.id === meuIdPublico ? 'rounded-tr-sm bg-rose-700/60' : 'rounded-tl-sm bg-white/10')}>
              <p className="text-[11px] font-semibold text-white/70">{m.autor?.nome}</p>
              {m.resposta && (
                <p className="mb-1 truncate rounded-lg border-l-2 border-rose-400 bg-black/30 px-2 py-1 text-[11px] text-white/70">
                  <b className="text-rose-300">{m.resposta.nome}</b> · {m.resposta.trecho}
                </p>
              )}
              {m.tipo === 'midia' ? (() => {
                const minha = m.autor?.id === meuIdPublico;
                const vista = vistas.includes(m.id);
                return (
                  <button type="button" disabled={minha || vista} onClick={() => void ver(m)}
                    className={cn('mt-0.5 rounded-xl px-3 py-1.5 text-sm', minha || vista ? 'text-white/50' : 'bg-gradient-to-r from-rose-600 to-fuchsia-600 font-semibold')}>
                    {m.midia?.tipo === 'video' ? '🎥' : '📸'} {minha ? 'Você enviou · visualização única' : vista ? 'Aberta' : 'Toque para ver (1 vez)'}
                  </button>
                );
              })() : <p className="break-words text-sm">{m.texto}</p>}
              <Acoes m={m} />
            </div>
          </div>
        ))}
        <div ref={fim} />
      </div>

      {cab.souMembro && acoesAbertas && (() => {
        const calor = cab.calor ?? 0;
        const outros = cab.membros.filter((m) => m.id !== meuIdPublico);
        return (
          <div className="relative max-h-[38vh] space-y-2 overflow-y-auto border-t border-rose-500/30 bg-black/50 px-3 py-2">
            <div className="flex items-center gap-2 text-[11px]">
              <span className="font-bold text-rose-200">Tesão</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-amber-400 via-rose-500 to-red-600 transition-all" style={{ width: `${calor}%` }} />
              </div>
              <span className="w-8 text-right">{calor}%</span>
            </div>
            {outros.length > 1 && (
              <div className="flex gap-1 overflow-x-auto">
                <span className="shrink-0 py-1 text-[11px] text-white/60">Com:</span>
                {outros.map((o) => (
                  <button key={o.id} type="button" onClick={() => setAlvo(o.id)}
                    className={cn('shrink-0 rounded-full px-2 py-1 text-[11px]', alvo === o.id ? 'bg-rose-600 font-bold' : 'bg-white/10')}>{o.nome}</button>
                ))}
              </div>
            )}
            {pedidoEsquentar && !cab.quente && !cab.voteiQuente && (
              <div className="space-y-2 rounded-xl bg-amber-500/20 p-3 ring-2 ring-amber-400/70 shadow-[0_0_24px_rgba(245,158,11,0.45)]">
                <p className="text-sm font-bold">🔥 {pedidoEsquentar} está te chamando pra transar: liberar as preliminares e a transa. Aceita?</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => { setPedidoEsquentar(null); void post('esquentar', { quer: false }); }} className="rounded-lg bg-white/10 px-3 py-2 text-sm">Agora não</button>
                  <button type="button" onClick={() => { setPedidoEsquentar(null); void post('esquentar', { quer: true }); }} className="rounded-lg bg-gradient-to-r from-amber-500 to-rose-600 px-3 py-2 text-sm font-bold">Aceito 🔥</button>
                </div>
              </div>
            )}
            <div className="flex gap-1.5">
              {ETAPAS.slice(0, nivelLiberado + 1).map((nome, i) => (
                <button key={nome} type="button" onClick={() => setAba(i)}
                  className={cn('flex-1 rounded-xl px-2 py-2 text-xs font-bold', aba === i ? 'bg-gradient-to-r from-rose-600 to-red-700 shadow-[0_0_14px_rgba(225,29,72,0.5)]' : 'bg-white/10 text-white/70')}>
                  {nome}
                </button>
              ))}
              {nivelLiberado < 2 && (
                <span className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-white/20 px-2 text-center text-[10px] text-white/45">
                  🔒 a Lola libera o próximo quando esquentar
                </span>
              )}
            </div>
            {aba >= 1 && !cab.quente && (
              <button type="button" disabled={cab.voteiQuente} onClick={() => void post('esquentar', { quer: true })}
                className={cn('w-full rounded-xl px-3 py-2 text-sm font-bold', cab.voteiQuente ? 'bg-rose-900/60 text-white/70' : 'bg-gradient-to-r from-amber-500 via-rose-600 to-red-700 shadow-[0_0_18px_rgba(225,29,72,0.5)]')}>
                {cab.voteiQuente
                  ? `⏳ Você topou · esperando os outros (${cab.votosQuente}/${cab.membros.length})`
                  : `🔓 Liberar preliminares e transa (${cab.votosQuente}/${cab.membros.length} toparam)`}
              </button>
            )}
            {ETAPAS.map((nome, etapa) => {
              if (etapa !== aba) return null;
              const travada = etapa >= 1 && !cab.quente;
              const eu = cab.membros.find((m) => m.id === meuIdPublico);
              const com = outros.length === 1 ? outros[0] : outros.find((o) => o.id === alvo);
              const cenas = eu && com ? CENAS.filter((x) => x.etapa === etapa && x.quem === eu.cat && x.alvo === com.cat) : [];
              return (
                <div key={nome}>
                  {travada && <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/60">🔒 todos tocam em "Liberar"</p>}
                  {cenas.length > 0 && (
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-bold text-amber-200">🎭 {TITULO_CENA[`${eu!.cat}-${com!.cat}`]}:</span>
                      {cenas.map((a) => (
                        <button key={a.id} type="button" disabled={travada} onClick={() => void agir(a.id)}
                          className={cn('rounded-full px-2.5 py-1.5 text-xs font-semibold', travada ? 'bg-white/5 text-white/30' : 'bg-gradient-to-r from-amber-600 to-rose-700 ring-1 ring-amber-300/50 active:scale-95')}>
                          {a.emoji} {a.rotulo}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {ACOES.filter((a) => a.etapa === etapa).map((a) => (
                      <button key={a.id} type="button" disabled={travada} onClick={() => void agir(a.id)}
                        className={cn('rounded-full px-2.5 py-1.5 text-xs font-semibold', travada ? 'bg-white/5 text-white/30' : 'bg-gradient-to-r from-rose-600 to-red-700 active:scale-95')}>
                        {a.emoji} {a.rotulo}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}
      {cab.souMembro ? (
        <form className="relative flex items-center gap-2 border-t border-rose-500/30 px-3 py-2" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
          <button type="button" onClick={() => { setAcoesAbertas((v) => !v); setFogoPiscando(false); }}
            className={cn('flex h-10 shrink-0 items-center justify-center rounded-full px-3 text-sm font-bold', acoesAbertas ? 'bg-rose-600' : 'bg-gradient-to-r from-rose-700 to-red-700', fogoPiscando && !acoesAbertas && 'animate-pulse ring-2 ring-amber-300')}
            aria-label="Ações na cabine">🔥</button>
          <input ref={camera} type="file" accept="image/*,video/*" capture="user" className="hidden" onChange={(e) => void enviarMidia(e.target.files?.[0])} />
          <button type="button" onClick={() => setCameraAberta(true)} disabled={enviando !== null}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 disabled:opacity-50" aria-label="Foto ou vídeo de agora">
            {enviando !== null ? <span className="text-[10px] tabular-nums">{enviando < 99 ? `${enviando}%` : '⏳'}</span> : <Camera className="h-4 w-4" />}
          </button>
          {enviando !== null && (
            <div className="absolute bottom-full left-3 right-3 z-10 mb-2 rounded-2xl bg-zinc-900/95 p-3 shadow-xl ring-1 ring-rose-500/40">
              <p className="mb-1.5 flex items-center justify-between text-xs text-white/80">
                <span>
                  {enviando < 99
                    ? `Enviando ${tipoEnviando === 'video' ? 'vídeo' : 'foto'}…`
                    : tipoEnviando === 'video' ? 'Processando o vídeo… pode levar até 1 minuto' : 'Processando a foto…'}
                </span>
                <span className="tabular-nums">{enviando < 99 ? `${enviando}%` : '⏳'}</span>
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className={cn('h-full rounded-full bg-gradient-to-r from-rose-500 to-fuchsia-500 transition-all', enviando >= 99 && 'animate-pulse')}
                  style={{ width: `${Math.max(4, enviando)}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-white/50">Não feche a tela até terminar.</p>
            </div>
          )}
          <CameraAoVivo
            open={cameraAberta}
            onClose={() => setCameraAberta(false)}
            onPronto={(arquivo) => void enviarMidia(arquivo)}
            onSemCamera={() => camera.current?.click()}
          />
          {respondendo && enviando === null && (
            <div className="absolute bottom-full left-0 right-0 flex items-center gap-2 border-t border-rose-500/30 bg-black/80 px-3 py-1.5 text-xs">
              <span className="min-w-0 flex-1 truncate">↩️ Respondendo <b className="text-rose-300">{respondendo.autor?.nome ?? 'Lola'}</b>: {respondendo.tipo === 'midia' ? (respondendo.midia?.tipo === 'video' ? '🎥 vídeo' : '📸 foto') : respondendo.texto}</span>
              <button type="button" onClick={() => setRespondendo(null)} aria-label="Cancelar resposta"><X className="h-4 w-4" /></button>
            </div>
          )}
          <input value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={280} placeholder="Só quem está na cabine fala…"
            className="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-2.5 text-[16px] text-white placeholder:text-white/40 outline-none" />
          <button type="submit" disabled={!texto.trim()} className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-600 disabled:opacity-40" aria-label="Enviar">
            <Send className="h-4 w-4" />
          </button>
        </form>
      ) : (
        <div className="border-t border-white/10 px-3 py-3">
          <Button className="w-full bg-gradient-to-r from-rose-600 to-fuchsia-600" disabled={cab.pedi} onClick={() => void post('pedir')}>
            {cab.pedi ? 'Pedido enviado… esperando quem está dentro aprovar' : '🙋 Pedir para participar'}
          </Button>
          <p className="mt-1 text-center text-[11px] text-white/50">Você está espiando: só lê e vê. Para entrar, todos de dentro precisam aprovar.</p>
        </div>
      )}

      {espiaoAberto && (
        <div className="fixed inset-0 z-[9995] flex items-end justify-center bg-black/70 sm:items-center" onClick={() => setEspiaoAberto(null)}>
          <div className="w-full max-w-sm space-y-2 rounded-t-3xl bg-gradient-to-b from-[#2a0010] to-black p-4 ring-1 ring-rose-500/40 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <Foto p={espiaoAberto} tamanho="h-12 w-12" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{espiaoAberto.nome}</p>
                <p className="text-xs text-white/60">está espiando a sua cabine 👀</p>
              </div>
              <button type="button" onClick={() => setEspiaoAberto(null)} aria-label="Fechar"><X className="h-5 w-5" /></button>
            </div>
            {!cab.anonima && onVerPerfil && (
              <Button variant="outline" className="w-full border-white/20 bg-transparent text-white" onClick={() => { onVerPerfil(espiaoAberto.id); setEspiaoAberto(null); }}>Ver perfil</Button>
            )}
            <Button className="w-full bg-rose-600 hover:bg-rose-500" onClick={() => { void post('convidar', { para: espiaoAberto.id }); setEspiaoAberto(null); }}>
              🚪 Chamar para esta cabine
            </Button>
            {onChamarParaOutra && (
              <Button variant="outline" className="w-full border-rose-400/50 bg-transparent text-white" onClick={() => { onChamarParaOutra(espiaoAberto); setEspiaoAberto(null); }}>
                💬 Chamar para outra conversa privada
              </Button>
            )}
            <p className="text-center text-[11px] text-white/50">Para entrar nesta cabine, todos aqui dentro precisam aprovar.</p>
          </div>
        </div>
      )}
      {escolhendoProvocacao && (
        <div className="fixed inset-0 z-[9995] flex items-end justify-center bg-black/70 sm:items-center" onClick={() => setEscolhendoProvocacao(false)}>
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-gradient-to-b from-[#2a0010] to-black p-4 ring-1 ring-rose-500/40 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-lg font-black">😈 Escolha a provocação</p>
              <button type="button" onClick={() => setEscolhendoProvocacao(false)} aria-label="Fechar"><X className="h-5 w-5" /></button>
            </div>
            <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (provocacaoEscrita.trim()) void mandarProvocacao({ texto: provocacaoEscrita }); }}>
              <input value={provocacaoEscrita} onChange={(e) => setProvocacaoEscrita(e.target.value)} maxLength={240} placeholder="Escreva a sua provocação…"
                className="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-2.5 text-[16px] text-white placeholder:text-white/40 outline-none" />
              <button type="submit" disabled={!provocacaoEscrita.trim()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-600 disabled:opacity-40" aria-label="Mandar provocação"><Send className="h-4 w-4" /></button>
            </form>
            <button type="button" onClick={() => void mandarProvocacao({ dado: false })} className="mb-3 w-full rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold">🎲 Deixa a Lola sortear</button>
            {provocacoes.map((n) => (
              <div key={n.nivel} className="mb-3">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-rose-200">{'🔥'.repeat(n.nivel)} {n.nivel === 1 ? 'Esquentando' : n.nivel === 2 ? 'Quente' : 'Pegando fogo'}</p>
                <div className="space-y-1.5">
                  {n.itens.map((it) => (
                    <button key={it.id} type="button" onClick={() => void mandarProvocacao({ escolha: it.id })}
                      className={cn('w-full rounded-xl px-3 py-2 text-left text-sm', it.usada ? 'bg-white/5 text-white/45' : 'bg-rose-900/40 hover:bg-rose-800/60')}>
                      {it.texto}{it.usada ? ' · já foi' : ''}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {vendo && (
        <div className="fixed inset-0 z-[9996] flex items-center justify-center bg-black" onContextMenu={(e) => e.preventDefault()}>
          <button type="button" onClick={() => setVendo(null)} className="absolute right-3 top-3 z-10 rounded-full bg-white/15 p-2" aria-label="Fechar"><X className="h-5 w-5" /></button>
          {vendo.mime?.startsWith('video/')
            ? <video src={resolveServerUrl(vendo.url)} autoPlay playsInline className="max-h-full max-w-full" />
            : <img src={resolveServerUrl(vendo.url)} alt="" draggable={false} className="max-h-full max-w-full select-none" />}
          <div className="absolute bottom-0 left-0 right-0 space-y-2 bg-gradient-to-t from-black via-black/80 to-transparent px-3 pb-3 pt-8"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
            {cab.souMembro && (
              <>
                <div className="flex justify-center gap-1.5">
                  {REACOES.map((e) => {
                    const atual = cab.mensagens.find((x) => x.id === vendo.msg.id)?.reacoes?.[e] ?? [];
                    const minha = !!meuIdPublico && atual.includes(meuIdPublico);
                    return (
                      <button key={e} type="button" onClick={() => void reagir(vendo.msg, e)}
                        className={cn('rounded-full px-2 py-1 text-xl transition active:scale-125', minha ? 'bg-rose-600/70 ring-1 ring-rose-300' : 'bg-white/10')}>{e}</button>
                    );
                  })}
                </div>
                <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void comentarMidia(); }}>
                  <input value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={280} placeholder={`Comentar ${vendo.msg.midia?.tipo === 'video' ? 'o vídeo' : 'a foto'}…`}
                    className="min-w-0 flex-1 rounded-full bg-white/15 px-4 py-2.5 text-[16px] text-white placeholder:text-white/50 outline-none" />
                  <button type="submit" disabled={!comentario.trim()} className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-600 disabled:opacity-40" aria-label="Enviar comentário">
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              </>
            )}
            <p className="text-center text-[11px] text-white/60">Visualização única: ao fechar, não abre de novo.</p>
          </div>
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Camera, Crown, Lock, Send, Users, X } from 'lucide-react';
import apiClient from '@/utils/apiClient';
import { resolveServerUrl } from '@/utils/serverUrl';
import { useSocket } from '@/contexts/SocketContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import RadioDaCasa from '@/components/RadioDaCasa';
import PlaylistDaCasa from '@/components/PlaylistDaCasa';
import HistoricoDaCasa from '@/components/HistoricoDaCasa';
import { profileService } from '@/services/api';

/**
 * A Casa — boate virtual de sexta e sábado, 21h à 1h (backend: casa.ts).
 * Lobby com as salas; dentro da sala: chat ao vivo, quem está lá, brincadeiras
 * da Lola (anfitriã IA) e convite para a cabine (conversa a dois com aceite).
 */

type Categoria = 'homem' | 'mulher' | 'casal' | 'outros';
type SalaResumo = {
  id: string; nome: string; emoji: string; descricao: string; nivel: 'quente' | 'muito_quente';
  total: number; espiando: number; contagem: Record<Categoria, number>;
  bloqueadaParaMim: boolean; lotadaParaMim: boolean; posicaoNaFila: number | null;
};
type Info = {
  aberta: boolean; tema: { nome: string; descricao: string } | null; horario: string;
  souAdmin: boolean; podeFalar: boolean; abertaAte: string | null; salas: SalaResumo[];
  reservado: boolean; reservas: number; proximaAbertura: string | null;
};
type Pessoa = { id: string; nome: string; avatar: string | null; cat: Categoria; querBrincar: boolean };
type Msg = { id: string; tipo: 'pessoa' | 'lola' | 'sistema' | 'midia'; autor?: { id: string; nome: string; avatar: string | null; cat: Categoria }; texto: string; criadoEm: string; midia?: { tipo: 'foto' | 'video' } };
type Jogo = {
  id: string; tipo: 'enquete' | 'eu_nunca' | 'quiz' | 'vd' | 'match'; fimEm: string;
  texto?: string; opcoes?: string[]; meuVoto?: number | null; votos?: number[] | null; total?: number;
  alvoNome?: string; souAlvo?: boolean;
  aNome?: string; bNome?: string; souParte?: boolean; jaRespondi?: boolean;
};
type Estado = {
  sala: { id: string; nome: string; emoji: string; descricao: string; nivel: string };
  mensagens: Msg[]; presentes: Pessoa[]; espiando: number; jogo: Jogo | null;
  eu: { podeFalar: boolean; querBrincar: boolean; espiando: boolean };
  midiasVistas: string[];
};
type Convite = { id: string; de: { id: string; nome: string; avatar: string | null; cat: Categoria }; sala: string };

const ROTULO_CAT: Record<Categoria, string> = { casal: 'Casal', mulher: 'Mulher', homem: 'Homem', outros: 'Perfil' };
const COR_CAT: Record<Categoria, string> = {
  casal: 'ring-fuchsia-500', mulher: 'ring-rose-500', homem: 'ring-sky-500', outros: 'ring-amber-500',
};

const erroDe = (e: unknown, padrao: string) => (e as any)?.response?.data?.message || padrao;

function Avatar({ p, tamanho = 'h-10 w-10' }: { p: { nome: string; avatar: string | null; cat: Categoria }; tamanho?: string }) {
  return (
    <div className={cn('shrink-0 overflow-hidden rounded-full ring-2 ring-offset-2 ring-offset-background', COR_CAT[p.cat], tamanho)}>
      {p.avatar
        ? <img src={resolveServerUrl(p.avatar)} alt={p.nome} className="h-full w-full object-cover" />
        : <div className="flex h-full w-full items-center justify-center bg-secondary text-xs font-bold">{p.nome.charAt(0)}</div>}
    </div>
  );
}

function useSegundosAte(iso?: string) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    if (!iso) return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [iso]);
  return iso ? Math.max(0, Math.round((Date.parse(iso) - agora) / 1000)) : 0;
}

function CartaoDoJogo({ jogo, podeFalar, onJogar }: { jogo: Jogo; podeFalar: boolean; onJogar: (valor: unknown) => void }) {
  const segundos = useSegundosAte(jogo.fimEm);
  const titulo = { enquete: '📊 Enquete', eu_nunca: '🍷 Eu nunca', quiz: '🎓 Quiz liberal', vd: '🎲 Verdade ou desafio', match: '💘 Match às cegas' }[jogo.tipo];
  return (
    <div className="mx-3 mb-2 rounded-2xl border border-fuchsia-500/40 bg-gradient-to-br from-fuchsia-950/80 to-rose-950/80 p-3 text-white shadow-lg">
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
            const mostrar = jogo.tipo !== 'quiz' && jogo.meuVoto != null;
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

export default function Casa() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { on, off } = useSocket();
  const [info, setInfo] = useState<Info | null>(null);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [entrando, setEntrando] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [pessoaAberta, setPessoaAberta] = useState<Pessoa | null>(null);
  const [convite, setConvite] = useState<Convite | null>(null);
  const [enviandoMidia, setEnviandoMidia] = useState<number | null>(null);
  const [vendo, setVendo] = useState<{ url: string; mime: string | null } | null>(null);
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fimDaLista = useRef<HTMLDivElement>(null);
  const salaAtual = estado?.sala.id ?? null;

  const carregar = useCallback(async () => {
    try { setInfo((await apiClient.get('/casa')).data); } catch { /* tenta de novo no próximo intervalo */ }
  }, []);
  useEffect(() => {
    void carregar();
    const t = setInterval(() => { if (!salaAtual) void carregar(); }, 20_000);
    return () => clearInterval(t);
  }, [carregar, salaAtual]);

  const entrar = useCallback(async (salaId: string, silencioso = false) => {
    setEntrando(salaId);
    try {
      const { data } = await apiClient.post(`/casa/${salaId}/entrar`);
      setEstado(data);
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
    const aoMsg = (d: { sala: string; msg: Msg }) => setEstado((e) => e && e.sala.id === d.sala ? { ...e, mensagens: [...e.mensagens.slice(-150), d.msg] } : e);
    const aoPresentes = (d: { sala: string; presentes: Pessoa[]; espiando: number }) => setEstado((e) => e && e.sala.id === d.sala ? { ...e, presentes: d.presentes, espiando: d.espiando } : e);
    const aoJogo = (d: { sala: string; jogo: Jogo | null }) => setEstado((e) => e && e.sala.id === d.sala ? { ...e, jogo: d.jogo } : e);
    const aoFechar = () => { setEstado(null); toast({ title: 'A Casa fechou por hoje 🌙', description: 'Sexta e sábado, 21h, tem mais.' }); void carregar(); };
    const aoConvite = (c: Convite) => setConvite(c);
    const aoVaga = (d: { sala: string; nome: string }) => {
      toast({ title: `🔥 Abriu vaga no ${d.nome}!`, description: 'Você tem 3 minutos: entrando agora…' });
      void entrar(d.sala);
    };
    const aoResposta = () => toast({ title: 'Não rolou agora 😉', description: 'A pessoa não aceitou o convite pra cabine.' });
    const aoCabine = (d: { conversationId: string; com: string }) => {
      toast({ title: `🚪 Cabine aberta com ${d.com}!` });
      navigate(`/chat/${d.conversationId}`);
    };
    on('casa.mensagem', aoMsg); on('casa.presentes', aoPresentes); on('casa.jogo', aoJogo); on('casa.fechou', aoFechar);
    on('casa.convite', aoConvite); on('casa.convite.resposta', aoResposta); on('casa.cabine', aoCabine); on('casa.vaga', aoVaga);
    return () => {
      off('casa.mensagem', aoMsg); off('casa.presentes', aoPresentes); off('casa.jogo', aoJogo); off('casa.fechou', aoFechar);
      off('casa.convite', aoConvite); off('casa.convite.resposta', aoResposta); off('casa.cabine', aoCabine); off('casa.vaga', aoVaga);
    };
  }, [on, off, toast, navigate, carregar, entrar]);

  // Sai da sala ao deixar a página.
  const salaRef = useRef<string | null>(null);
  salaRef.current = salaAtual;
  useEffect(() => () => { if (salaRef.current) void apiClient.post(`/casa/${salaRef.current}/sair`).catch(() => {}); }, []);

  useEffect(() => { fimDaLista.current?.scrollIntoView({ block: 'end' }); }, [estado?.mensagens.length]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t || !salaAtual) return;
    setTexto('');
    try { await apiClient.post(`/casa/${salaAtual}/mensagem`, { texto: t }); }
    catch (e) { setTexto(t); toast({ title: erroDe(e, 'Mensagem não enviada.'), variant: 'destructive' }); }
  };
  // Foto/vídeo tirado na hora (abre a câmera no celular), sempre visualização única.
  const enviarMidia = async (arquivo: File | undefined) => {
    if (!arquivo || !salaAtual) return;
    if (arquivo.type.startsWith('video/') && arquivo.size > 200 * 1024 * 1024) {
      toast({ title: 'Vídeo grande demais', description: 'Grave um vídeo mais curto (até 1 minuto).', variant: 'destructive' });
      return;
    }
    setEnviandoMidia(0);
    try {
      const up = await profileService.uploadMedia(arquivo, { source: 'chat' }, (pct) => setEnviandoMidia(pct));
      await apiClient.post(`/casa/${salaAtual}/midia`, { mediaId: up.id });
      toast({ title: 'Enviado para a sala 🔥', description: 'Cada pessoa abre só 1 vez.' });
    } catch (e) {
      toast({ title: (e as Error)?.message || erroDe(e, 'Não foi possível enviar.'), variant: 'destructive' });
    } finally {
      setEnviandoMidia(null);
      if (cameraRef.current) cameraRef.current.value = '';
    }
  };
  const verMidia = async (m: Msg) => {
    if (!salaAtual) return;
    try {
      const { data } = await apiClient.post(`/casa/${salaAtual}/midia/${m.id}/ver`);
      setVendo({ url: data.url, mime: data.mime });
    } catch (e) {
      toast({ title: erroDe(e, 'Esta mídia não está mais disponível.') });
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
  const convidar = async (p: Pessoa) => {
    setPessoaAberta(null);
    try {
      await apiClient.post(`/casa/${salaAtual}/convidar`, { para: p.id });
      toast({ title: `Convite enviado para ${p.nome} 🚪`, description: 'Se aceitar, a cabine abre na hora.' });
    } catch (e) { toast({ title: erroDe(e, 'Não foi possível chamar agora.'), variant: 'destructive' }); }
  };
  const responderConvite = async (aceitar: boolean) => {
    const c = convite;
    setConvite(null);
    if (!c) return;
    try {
      const { data } = await apiClient.post(`/casa/convite/${c.id}/responder`, { aceitar });
      if (aceitar && data?.conversationId) {
        toast({ title: `🚪 Cabine aberta com ${data.com}!` });
        navigate(`/chat/${data.conversationId}`);
      }
    } catch (e) { toast({ title: erroDe(e, 'Esse convite expirou.') }); }
  };
  const abrirAgora = async (minutos: number) => {
    try { await apiClient.post('/casa/abrir-agora', { minutos }); await carregar(); }
    catch (e) { toast({ title: erroDe(e, 'Falhou.'), variant: 'destructive' }); }
  };

  // ─── Sala ────────────────────────────────────────────────────────────────
  const sala = estado && createPortal(
    <div
      className="fixed inset-0 z-[9990] flex flex-col bg-zinc-950 text-white"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <button type="button" onClick={() => void sair()} className="rounded-full p-2 hover:bg-white/10" aria-label="Sair da sala">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{estado.sala.emoji} {estado.sala.nome}</p>
          <p className="text-[11px] text-white/60">
            {estado.presentes.length} na sala{estado.espiando > 0 ? ` · ${estado.espiando} espiando 👀` : ''}
          </p>
        </div>
        {estado.eu.podeFalar && (
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
            </div>
            <span className="w-full truncate text-center text-[10px] text-white/80">{p.nome}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {estado.mensagens.map((m) => m.tipo === 'sistema' ? (
          <p key={m.id} className="text-center text-[11px] text-white/45">{m.texto}</p>
        ) : m.tipo === 'midia' ? (
          <div key={m.id} className="flex items-start gap-2">
            {m.autor && <Avatar p={m.autor} tamanho="h-7 w-7" />}
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-white/70">{m.autor?.nome}</p>
              {(() => {
                const minha = m.autor?.id === user?.id;
                const vista = estado.midiasVistas.includes(m.id);
                return (
                  <button
                    type="button"
                    disabled={minha || vista || !estado.eu.podeFalar}
                    onClick={() => void verMidia(m)}
                    className={cn('mt-0.5 flex items-center gap-2 rounded-2xl px-3 py-2 text-sm',
                      minha || vista ? 'bg-white/5 text-white/50' : 'bg-gradient-to-r from-rose-600 to-fuchsia-600 font-semibold')}
                  >
                    {m.midia?.tipo === 'video' ? '🎥' : '📸'}
                    {minha ? 'Você enviou · visualização única' : vista ? 'Aberta' : estado.eu.podeFalar ? 'Toque para ver (1 vez)' : 'Assine para ver'}
                  </button>
                );
              })()}
            </div>
          </div>
        ) : m.tipo === 'lola' ? (
          <div key={m.id} className="max-w-[90%] rounded-2xl rounded-tl-sm bg-gradient-to-br from-fuchsia-700 to-rose-700 px-3 py-2 shadow">
            <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-fuchsia-100">💋 Lola · anfitriã IA</p>
            <p className="whitespace-pre-line text-sm leading-snug">{m.texto}</p>
          </div>
        ) : (
          <div key={m.id} className="flex items-start gap-2">
            {m.autor && <Avatar p={m.autor} tamanho="h-7 w-7" />}
            <div className="min-w-0 max-w-[85%] rounded-2xl rounded-tl-sm bg-white/10 px-3 py-1.5">
              <p className="text-[11px] font-semibold text-white/70">{m.autor?.nome} <span className="font-normal text-white/40">· {m.autor ? ROTULO_CAT[m.autor.cat] : ''}</span></p>
              <p className="break-words text-sm">{m.texto}</p>
            </div>
          </div>
        ))}
        <div ref={fimDaLista} />
      </div>

      {estado.jogo && <CartaoDoJogo jogo={estado.jogo} podeFalar={estado.eu.podeFalar} onJogar={(v) => void jogar(v)} />}

      {estado.eu.podeFalar ? (
        <form
          className="flex items-center gap-2 border-t border-white/10 px-3 py-2"
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
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={enviandoMidia !== null}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 disabled:opacity-50"
            aria-label="Tirar foto ou vídeo agora"
            title="Foto ou vídeo ao vivo (visualização única)"
          >
            {enviandoMidia !== null ? <span className="text-[10px] tabular-nums">{enviandoMidia}%</span> : <Camera className="h-4 w-4" />}
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
          <Button className="w-full bg-gradient-to-r from-rose-600 to-fuchsia-600" onClick={() => navigate('/subscriptions')}>
            <Crown className="mr-2 h-4 w-4" /> Assine para falar, brincar e ir pra cabine
          </Button>
          <p className="mt-1 text-center text-[11px] text-white/50">Você está espiando: ninguém vê que você está aqui.</p>
        </div>
      )}

      {vendo && (
        <div className="fixed inset-0 z-[9996] flex items-center justify-center bg-black" onContextMenu={(e) => e.preventDefault()}>
          <button type="button" onClick={() => setVendo(null)} className="absolute right-3 top-3 z-10 rounded-full bg-white/15 p-2" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
          {vendo.mime?.startsWith('video/')
            ? <video src={resolveServerUrl(vendo.url)} autoPlay playsInline controls={false} onEnded={() => setVendo(null)} className="max-h-full max-w-full select-none" />
            : <img src={resolveServerUrl(vendo.url)} alt="" draggable={false} className="max-h-full max-w-full select-none" />}
          <p className="absolute bottom-4 left-0 right-0 text-center text-[11px] text-white/60">Visualização única: ao fechar, não abre de novo.</p>
        </div>
      )}

      <Dialog open={!!pessoaAberta} onOpenChange={(v) => !v && setPessoaAberta(null)}>
        <DialogContent className="z-[9995] max-w-xs">
          {pessoaAberta && (
            <div className="flex flex-col items-center gap-3 text-center">
              <Avatar p={pessoaAberta} tamanho="h-20 w-20" />
              <div>
                <p className="text-lg font-semibold">{pessoaAberta.nome}</p>
                <p className="text-xs text-muted-foreground">{ROTULO_CAT[pessoaAberta.cat]}{pessoaAberta.querBrincar ? ' · 🔥 brincando' : ''}</p>
              </div>
              <div className="grid w-full gap-2">
                {estado.eu.podeFalar && (
                  <Button className="bg-rose-600 hover:bg-rose-500" onClick={() => void convidar(pessoaAberta)}>🚪 Chamar pra cabine</Button>
                )}
                <Button variant="outline" onClick={() => navigate(`/users/${pessoaAberta.id}`)}>Ver perfil</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>,
    document.body,
  );

  // ─── Lobby ───────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-950 via-fuchsia-950 to-rose-900 p-5 text-white shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-fuchsia-200">Boate virtual · só adultos</p>
        <h1 className="mt-1 text-3xl font-black">A Casa 🔥</h1>
        {info?.aberta ? (
          <p className="mt-2 text-sm text-white/85">
            <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            Aberta agora{info.tema ? `: ${info.tema.nome}` : ''}. {info.tema?.descricao}
          </p>
        ) : (
          <p className="mt-2 text-sm text-white/85">Abre <b>sexta e sábado, das 21h à 1h</b>. Às 21h a gente avisa no seu celular 😈</p>
        )}
        <ul className="mt-3 grid gap-1 text-xs text-white/75">
          <li>💋 Lola, a anfitriã IA, puxa brincadeiras quentes: eu nunca, verdade ou desafio, enquetes e match às cegas</li>
          <li>🚪 Chame quem quiser pra cabine: abre uma conversa a dois, só com aceite</li>
          <li>🎁 +5 tokens por noite só por entrar; acertou o quiz, +3</li>
        </ul>
      </div>

      {info && !info.aberta && (
        <div className="rounded-2xl border border-fuchsia-500/40 bg-fuchsia-500/5 p-4 text-center">
          <p className="text-sm font-semibold">{info.reservado ? '🎟️ Seu lugar está reservado!' : 'Garanta seu lugar na próxima noite'}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {info.reservas > 0 ? `${info.reservas} pessoa(s) já reservaram. ` : ''}Quando abrir, a gente avisa no seu celular.
          </p>
          <Button
            className={cn('mt-3 w-full', info.reservado ? '' : 'bg-gradient-to-r from-rose-600 to-fuchsia-600')}
            variant={info.reservado ? 'outline' : 'default'}
            onClick={() => void reservar(!info.reservado)}
          >
            {info.reservado ? 'Cancelar reserva' : '🎟️ Reservar meu lugar'}
          </Button>
        </div>
      )}

      {info?.souAdmin && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed p-3 text-xs">
          <span className="font-semibold">Admin:</span>
          {info.abertaAte
            ? <>aberta até {new Date(info.abertaAte).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} <Button size="sm" variant="outline" onClick={() => void abrirAgora(0)}>Fechar abertura extra</Button></>
            : <Button size="sm" variant="outline" onClick={() => void abrirAgora(60)}>Abrir agora por 1h (teste)</Button>}
        </div>
      )}

      {info?.souAdmin && <PlaylistDaCasa />}
      {info?.souAdmin && <HistoricoDaCasa />}

      <div className="grid gap-3">
        {(info?.salas ?? []).map((s) => {
          const travada = !info?.aberta || s.bloqueadaParaMim || (s.lotadaParaMim && s.posicaoNaFila != null);
          return (
            <div key={s.id} className={cn('rounded-2xl border bg-card p-4', !info?.aberta && 'opacity-70')}>
              <div className="flex items-start gap-3">
                <span className="text-3xl leading-none">{s.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{s.nome}</p>
                    {s.nivel === 'muito_quente' && <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-500">MUITO QUENTE</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">{s.descricao}</p>
                  {info?.aberta && (
                    <p className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" />{s.total}</span>
                      <span>💑 {s.contagem.casal}</span><span>👩 {s.contagem.mulher}</span><span>👨 {s.contagem.homem}</span>
                      {s.espiando > 0 && <span>👀 {s.espiando}</span>}
                    </p>
                  )}
                </div>
              </div>
              <Button
                className="mt-3 w-full bg-gradient-to-r from-rose-600 to-fuchsia-600"
                disabled={travada || entrando !== null}
                onClick={() => void (s.lotadaParaMim ? entrarNaFila(s.id) : entrar(s.id))}
              >
                {!info?.aberta ? <><Lock className="mr-2 h-4 w-4" />Abre sexta e sábado às 21h</>
                  : s.bloqueadaParaMim ? 'Só casais e mulheres'
                  : s.lotadaParaMim ? (s.posicaoNaFila ? `Na fila: você é o ${s.posicaoNaFila}º` : 'Sala cheia para homens · Entrar na fila')
                  : entrando === s.id ? 'Entrando…'
                  : info.podeFalar ? 'Entrar' : 'Espiar'}
              </Button>
            </div>
          );
        })}
      </div>

      <p className="px-2 text-center text-[11px] text-muted-foreground">
        Regra da Casa: consentimento sempre. "Passo" é respeitado, ninguém é exposto e quem desrespeitar é removido.
      </p>

      {sala}

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
  );
}

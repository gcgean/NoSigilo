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

/**
 * Cabine d'A Casa (backend: rotas /api/casa/cabine/*).
 * A dois ou em grupo. A porta só abre quando TODOS de dentro querem; com a porta
 * aberta, quem está na sala espia (lê e vê as mídias, sem falar) e pode pedir
 * para entrar — todos de dentro precisam aprovar. Mídia sempre de visualização única.
 */
type Pessoa = { id: string; nome: string; avatar: string | null; cat: string };
type Msg = { id: string; tipo: 'pessoa' | 'lola' | 'sistema' | 'midia'; autor?: Pessoa; texto: string; criadoEm: string; midia?: { tipo: 'foto' | 'video' } };
type Entrada = Pessoa & { tipo: 'pedido' | 'convite'; aprovei: boolean; aprovados: number; convidadoAceitou: boolean };
type Cabine = {
  id: string; membros: Pessoa[]; aberta: boolean; votosPorta: number; voteiPorta: boolean; espectadores: number;
  souMembro: boolean; souEspectador: boolean; entradas: Entrada[]; pedi: boolean; mensagens: Msg[];
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
  cabineId, modo, meuIdPublico, convidaveis, onVoltar, onSaiu,
}: {
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
  const [vendo, setVendo] = useState<{ url: string; mime: string | null } | null>(null);
  const [convidando, setConvidando] = useState(false);
  const [enviando, setEnviando] = useState<number | null>(null);
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
      if (d.cabineId === cabineId) setCab((c) => c ? { ...c, mensagens: [...c.mensagens.slice(-150), d.msg] } : c);
    };
    const aoFechou = (d: { cabineId: string; porta?: boolean }) => {
      if (d.cabineId !== cabineId) return;
      toast({ title: d.porta ? '🔒 Fecharam a porta da cabine' : 'A cabine fechou' });
      onSaiu();
    };
    on('casa.cabine.estado', aoEstado); on('casa.cabine.mensagem', aoMsg); on('casa.cabine.fechou', aoFechou);
    return () => { off('casa.cabine.estado', aoEstado); off('casa.cabine.mensagem', aoMsg); off('casa.cabine.fechou', aoFechou); };
  }, [on, off, cabineId, toast, onSaiu]);
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }); }, [cab?.mensagens.length]);

  const post = async (rota: string, corpo?: unknown) => {
    try { return (await apiClient.post(`/casa/cabine/${cabineId}/${rota}`, corpo)).data; }
    catch (e) { toast({ title: erroDe(e, 'Não foi possível agora.'), variant: 'destructive' }); return null; }
  };
  const enviar = async () => {
    const t = texto.trim();
    if (!t) return;
    setTexto('');
    if (!(await post('mensagem', { texto: t }))) setTexto(t);
  };
  const enviarMidia = async (arquivo?: File) => {
    if (!arquivo) return;
    setEnviando(0);
    try {
      const up = await profileService.uploadMedia(arquivo, { source: 'chat' }, (p) => setEnviando(p));
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
      setVendo({ url: data.url, mime: data.mime });
    } catch (e) { toast({ title: erroDe(e, 'Essa mídia não está mais disponível.') }); }
    setVistas((v) => [...v, m.id]);
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
    <div className="fixed inset-0 z-[9993] flex flex-col bg-gradient-to-b from-zinc-950 via-[#1a0a14] to-zinc-950 text-white"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <button type="button" onClick={onVoltar} className="rounded-full p-2 hover:bg-white/10" aria-label="Voltar à sala"><ArrowLeft className="h-5 w-5" /></button>
        <div className="flex -space-x-2">{cab.membros.slice(0, 4).map((m) => <Foto key={m.id} p={m} />)}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">🚪 {cab.membros.map((m) => m.nome).join(', ')}</p>
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

      {cab.souMembro && (
        <div className="space-y-2 border-b border-white/10 px-3 py-2">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className={cn('h-8 border-white/20 bg-transparent text-xs text-white', cab.voteiPorta && 'border-amber-400 text-amber-200')}
              onClick={() => void post('porta', { abrir: !cab.voteiPorta })}
            >
              {cab.aberta ? '🔒 Fechar a porta' : cab.voteiPorta ? `Quero abrir a porta ✓ (${cab.votosPorta}/${cab.membros.length})` : `👀 Abrir a porta (${cab.votosPorta}/${cab.membros.length})`}
            </Button>
            <Button size="sm" variant="outline" className="h-8 border-white/20 bg-transparent text-xs text-white" onClick={() => setConvidando((v) => !v)}>
              ➕ Convidar alguém
            </Button>
            {cab.membros.length === 2 && (
              <Button size="sm" variant="outline" className="h-8 border-white/20 bg-transparent text-xs text-white" onClick={() => void continuarNoChat()}>
                💬 Continuar no chat
              </Button>
            )}
          </div>
          <p className="text-[11px] text-white/50">A porta só abre quando todos aqui dentro querem. Qualquer um pode fechar.</p>
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
        ) : m.tipo === 'lola' ? (
          <div key={m.id} className="max-w-[90%] rounded-2xl rounded-tl-sm bg-gradient-to-br from-fuchsia-700 to-rose-700 px-3 py-2">
            <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-fuchsia-100">💋 Lola · anfitriã IA</p>
            <p className="whitespace-pre-line text-sm">{m.texto}</p>
          </div>
        ) : (
          <div key={m.id} className="flex items-start gap-2">
            {m.autor && <Foto p={m.autor} tamanho="h-7 w-7" />}
            <div className="min-w-0 max-w-[85%] rounded-2xl rounded-tl-sm bg-white/10 px-3 py-1.5">
              <p className="text-[11px] font-semibold text-white/70">{m.autor?.nome}</p>
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
            </div>
          </div>
        ))}
        <div ref={fim} />
      </div>

      {cab.souMembro ? (
        <form className="flex items-center gap-2 border-t border-white/10 px-3 py-2" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
          <input ref={camera} type="file" accept="image/*,video/*" capture="user" className="hidden" onChange={(e) => void enviarMidia(e.target.files?.[0])} />
          <button type="button" onClick={() => camera.current?.click()} disabled={enviando !== null}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10" aria-label="Foto ou vídeo ao vivo">
            {enviando !== null ? <span className="text-[10px]">{enviando}%</span> : <Camera className="h-4 w-4" />}
          </button>
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

      {vendo && (
        <div className="fixed inset-0 z-[9996] flex items-center justify-center bg-black" onContextMenu={(e) => e.preventDefault()}>
          <button type="button" onClick={() => setVendo(null)} className="absolute right-3 top-3 z-10 rounded-full bg-white/15 p-2" aria-label="Fechar"><X className="h-5 w-5" /></button>
          {vendo.mime?.startsWith('video/')
            ? <video src={resolveServerUrl(vendo.url)} autoPlay playsInline onEnded={() => setVendo(null)} className="max-h-full max-w-full" />
            : <img src={resolveServerUrl(vendo.url)} alt="" draggable={false} className="max-h-full max-w-full select-none" />}
          <p className="absolute bottom-4 left-0 right-0 text-center text-[11px] text-white/60">Visualização única: ao fechar, não abre de novo.</p>
        </div>
      )}
    </div>
  );
}

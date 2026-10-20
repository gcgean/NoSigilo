import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '@/utils/apiClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import PlaylistDaCasa from '@/components/PlaylistDaCasa';
import HistoricoDaCasa from '@/components/HistoricoDaCasa';
import RankingDaCasa from '@/components/RankingDaCasa';
import NegocioDaCasa from '@/components/NegocioDaCasa';

/** Admin › A Casa: tudo da boate virtual num lugar só (ao vivo, reservas, moderação, rádio, histórico). */
type AoVivo = {
  aberta: boolean; forcada: boolean; tema: { nome: string } | null; abertaAte: string | null;
  proximaAbertura: string | null; proximaNoite: string;
  reservas: { id: string; nome: string; cat: string; em: string }[];
  totalReservas?: number;
  reservasPorPerfil?: Record<'casal' | 'mulher' | 'homem' | 'outros', number>;
  salas: {
    id: string; nome: string; emoji: string; anonima: boolean; espiando: number; mensagens: number;
    presentes: { id: string; nome: string; apelido: string | null; cat: string; pulseira: string | null; querBrincar: boolean; podeFalar: boolean; rei: boolean; avisos: number }[];
    fila: { id: string; nome: string }[];
    jogo: { tipo: string; texto: string | null } | null;
  }[];
  cabines: { id: string; sala: string; aberta: boolean; espectadores: number; mensagens: number; membros: string[]; pedidos: number }[];
  propostas: { de: string; para: string; texto: string; tokens: number; status: string; privado: boolean }[];
  expulsos: { id: string; nome: string }[];
  contadores: { expulsoes: number; avisos: number; denuncias: number };
};

const PULSEIRA: Record<string, string> = { verde: '🟢', amarela: '🟡', roxa: '🟣', vermelha: '🔴' };
const CAT: Record<string, string> = { casal: '💑', mulher: '👩', homem: '👨', outros: '🌈' };
const quando = (iso: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

function Bloco({ titulo, children, extra }: { titulo: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{titulo}</p>
        {extra}
      </div>
      {children}
    </div>
  );
}

export default function AdminCasaTab() {
  const { toast } = useToast();
  const [vivo, setVivo] = useState<AoVivo | null>(null);
  const [recado, setRecado] = useState('');
  const [salaRecado, setSalaRecado] = useState('todas');

  const carregar = useCallback(async () => {
    try { setVivo((await apiClient.get('/casa/admin/ao-vivo')).data); } catch { /* tenta de novo */ }
  }, []);
  useEffect(() => {
    void carregar();
    const t = setInterval(carregar, 10_000);
    return () => clearInterval(t);
  }, [carregar]);

  const acao = async (rota: string, corpo: unknown, ok: string) => {
    try { await apiClient.post(rota, corpo); toast({ title: ok }); await carregar(); }
    catch (e) { toast({ title: (e as any)?.response?.data?.message || 'Não foi possível.', variant: 'destructive' }); }
  };

  const totalNaCasa = vivo?.salas.reduce((s, x) => s + x.presentes.length + x.espiando, 0) ?? 0;
  return (
    <div className="space-y-4">
      <Bloco
        titulo="🔥 A Casa"
        extra={<Link to="/casa" className="text-sm font-semibold text-primary underline">Entrar na Casa →</Link>}
      >
        {vivo ? (
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="font-bold">{vivo.aberta ? `🟢 Aberta${vivo.tema ? ` · ${vivo.tema.nome}` : ''}` : '🔒 Fechada'}</p>
              {vivo.forcada && <p className="text-[11px] text-muted-foreground">abertura extra até {quando(vivo.abertaAte)}</p>}
            </div>
            <div className="rounded-xl bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">{vivo.aberta ? 'Pessoas lá dentro' : 'Próxima abertura'}</p>
              <p className="font-bold">{vivo.aberta ? totalNaCasa : quando(vivo.proximaAbertura)}</p>
            </div>
            <div className="rounded-xl bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Reservas ({vivo.proximaNoite || '—'})</p>
              <p className="font-bold">{vivo.totalReservas ?? vivo.reservas.length}</p>
              {vivo.reservasPorPerfil && (
                <p className="text-xs text-muted-foreground">
                  💑 {vivo.reservasPorPerfil.casal} · 👩 {vivo.reservasPorPerfil.mulher} · 👨 {vivo.reservasPorPerfil.homem}{vivo.reservasPorPerfil.outros ? ` · 🌈 ${vivo.reservasPorPerfil.outros}` : ''}
                </p>
              )}
            </div>
            <div className="rounded-xl bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Moderação da noite</p>
              <p className="text-sm font-bold">{vivo.contadores.avisos} avisos · {vivo.contadores.expulsoes} expulsões · {vivo.contadores.denuncias} denúncias</p>
            </div>
          </div>
        ) : <p className="text-sm text-muted-foreground">Carregando…</p>}
        <div className="flex flex-wrap gap-2">
          {vivo?.forcada
            ? <Button size="sm" variant="outline" onClick={() => void acao('/casa/abrir-agora', { minutos: 0 }, 'Abertura extra encerrada')}>Fechar abertura extra</Button>
            : !vivo?.aberta && <>
              <Button size="sm" variant="outline" onClick={() => void acao('/casa/abrir-agora', { minutos: 60 }, 'Casa aberta por 1h')}>Abrir agora por 1h (teste)</Button>
              <Button size="sm" variant="outline" onClick={() => void acao('/casa/abrir-agora', { minutos: 240 }, 'Casa aberta por 4h')}>Abrir noite extra (4h)</Button>
            </>}
        </div>
        <p className="text-xs text-muted-foreground">
          A Lola abre sozinha sexta e sábado às 21h, avisa todo mundo, puxa as brincadeiras, modera e fecha à 1h. Você recebe no Telegram a abertura, a meia-noite, o resumo, expulsões e denúncias.
        </p>
      </Bloco>

      <NegocioDaCasa />

      {vivo?.aberta && (
        <>
          <Bloco titulo="📣 Recado da Lola">
            <div className="flex flex-col gap-2 sm:flex-row">
              <select value={salaRecado} onChange={(e) => setSalaRecado(e.target.value)} className="rounded-lg border bg-background px-2 py-2 text-sm">
                <option value="todas">Todas as salas</option>
                {vivo.salas.map((s) => <option key={s.id} value={s.id}>{s.emoji} {s.nome}</option>)}
              </select>
              <input value={recado} onChange={(e) => setRecado(e.target.value)} maxLength={400} placeholder="A Lola fala isso na sala…" className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm" />
              <Button size="sm" disabled={!recado.trim()} onClick={() => { void acao('/casa/admin/recado', { texto: recado, sala: salaRecado }, 'Recado enviado'); setRecado(''); }}>Enviar</Button>
            </div>
          </Bloco>

          <Bloco titulo="🍸 Salas ao vivo" extra={<span className="text-xs text-muted-foreground">atualiza a cada 10s</span>}>
            <div className="grid gap-3 lg:grid-cols-2">
              {vivo.salas.map((s) => (
                <div key={s.id} className="rounded-xl border p-3">
                  <p className="font-semibold">{s.emoji} {s.nome} <span className="text-xs font-normal text-muted-foreground">· {s.presentes.length} na sala · {s.espiando} espiando · {s.mensagens} msgs</span></p>
                  {s.jogo && <p className="mt-1 text-xs text-fuchsia-500">Rodada: {s.jogo.tipo}{s.jogo.texto ? ` — ${s.jogo.texto}` : ''}</p>}
                  {s.fila.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Fila: {s.fila.map((f) => f.nome).join(', ')}</p>}
                  <ul className="mt-2 space-y-1">
                    {s.presentes.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 text-sm">
                        <span>{CAT[p.cat] ?? ''}</span>
                        <span className="min-w-0 flex-1 truncate">
                          {p.rei ? '👑 ' : ''}{p.nome}{p.apelido ? <span className="text-muted-foreground"> ({p.apelido})</span> : null}
                          {p.pulseira ? ` ${PULSEIRA[p.pulseira]}` : ''}{p.querBrincar ? ' 🔥' : ''}{!p.podeFalar ? ' 👀' : ''}
                          {p.avisos > 0 && <span className="ml-1 text-xs text-amber-600">⚠️ {p.avisos} aviso(s)</span>}
                        </span>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive"
                          onClick={() => { if (window.confirm(`Tirar ${p.nome} da Casa nesta noite?`)) void acao('/casa/admin/expulsar', { userId: p.id }, `${p.nome} retirado(a)`); }}>
                          Tirar
                        </Button>
                      </li>
                    ))}
                    {s.presentes.length === 0 && <li className="text-xs text-muted-foreground">Ninguém falando nesta sala.</li>}
                  </ul>
                </div>
              ))}
            </div>
          </Bloco>

          <Bloco titulo={`🚪 Cabines (${vivo.cabines.length})`}>
            {vivo.cabines.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma cabine agora.</p> : (
              <ul className="space-y-1 text-sm">
                {vivo.cabines.map((c) => (
                  <li key={c.id}>{c.aberta ? '👀 porta aberta' : '🔒 fechada'} · {c.membros.join(', ')} · {c.espectadores} espiando · {c.mensagens} msgs{c.pedidos ? ` · ${c.pedidos} pedido(s) para entrar` : ''}</li>
                ))}
              </ul>
            )}
            {vivo.propostas.length > 0 && (
              <div className="text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">😈 Desafios valendo tokens</p>
                {vivo.propostas.map((p, i) => <p key={i}>{p.de} → {p.para}: "{p.texto}" · {p.tokens} tokens · {p.status}{p.privado ? ' · privado' : ''}</p>)}
              </div>
            )}
          </Bloco>
        </>
      )}

      {(vivo?.expulsos.length ?? 0) > 0 && (
        <Bloco titulo="🚫 Retirados nesta noite">
          <ul className="space-y-1">
            {vivo!.expulsos.map((x) => (
              <li key={x.id} className="flex items-center justify-between text-sm">
                <span>{x.nome}</span>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void acao('/casa/admin/perdoar', { userId: x.id }, `${x.nome} pode voltar`)}>Deixar voltar</Button>
              </li>
            ))}
          </ul>
        </Bloco>
      )}

      <Bloco titulo={`🎟️ Reservas para a próxima noite (${vivo?.reservas.length ?? 0})`}>
        {vivo && vivo.reservas.length > 0 ? (
          <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
            {vivo.reservas.map((r) => <span key={r.id} className="rounded-full bg-muted px-2 py-0.5 text-xs">{CAT[r.cat] ?? ''} {r.nome}</span>)}
          </div>
        ) : <p className="text-xs text-muted-foreground">Ninguém reservou ainda.</p>}
      </Bloco>

      <Bloco titulo="🏆 Ranking"><RankingDaCasa /></Bloco>
      <PlaylistDaCasa />
      <HistoricoDaCasa />
    </div>
  );
}

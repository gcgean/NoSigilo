import { Fragment, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveServerUrl } from '@/utils/serverUrl';

/** Botões flutuantes do chat d'A Casa: "@ te responderam" e "⬇ N novas" (ver useRolagemDoChat). */
export function BotoesDeNovas({ noFim, novas, mencao, onFim, onMencao }: {
  noFim: boolean; novas: number; mencao: string | null; onFim: () => void; onMencao: () => void;
}) {
  if (noFim && !mencao) return null;
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 z-20 flex flex-col items-end gap-2">
      {mencao && (
        <button type="button" onClick={onMencao}
          className="pointer-events-auto rounded-full bg-fuchsia-600 px-3 py-1.5 text-xs font-bold shadow-lg ring-1 ring-fuchsia-300/60">
          @ falaram com você
        </button>
      )}
      {!noFim && (
        <button type="button" onClick={onFim} aria-label={novas > 0 ? `${novas} mensagens novas` : 'Ir para o fim'}
          className="pointer-events-auto relative flex h-10 items-center gap-1 rounded-full bg-zinc-900/95 px-3 text-xs font-semibold shadow-lg ring-1 ring-white/15">
          <ChevronDown className="h-4 w-4" />
          {novas > 0 && <span>{novas > 99 ? '99+' : novas} nova{novas === 1 ? '' : 's'}</span>}
        </button>
      )}
    </div>
  );
}

export function LinhaNaoLidas() {
  return (
    <div className="my-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-amber-300">
      <span className="h-px flex-1 bg-amber-300/40" />
      Mensagens não lidas
      <span className="h-px flex-1 bg-amber-300/40" />
    </div>
  );
}

/** Citação clicável: leva até a mensagem respondida. */
export function Citacao({ nome, trecho, onIr, className, nomeClassName }: {
  nome: string; trecho: string; onIr: () => void; className?: string; nomeClassName?: string;
}) {
  return (
    <button type="button" onClick={onIr} title="Ir para a mensagem"
      className={cn('mb-1 block w-full truncate rounded-lg border-l-2 px-2 py-1 text-left text-[11px] active:opacity-70', className)}>
      <b className={nomeClassName}>{nome}</b> · {trecho}
    </button>
  );
}

/**
 * Arrastar a mensagem para a direita responde (como no WhatsApp). Só no toque;
 * movimento mais vertical que horizontal é rolagem e não conta.
 */
export function ArrastaParaResponder({ ativo, onResponder, destacada, children, className, ...resto }: {
  ativo: boolean; onResponder: () => void; destacada?: boolean; children: ReactNode; className?: string;
  'data-msg-id'?: string;
}) {
  const inicio = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null);
  const [dx, setDx] = useState(0);
  const LIMITE = 56;
  return (
    <div
      {...resto}
      className={cn('relative rounded-2xl transition-all duration-500', destacada && 'bg-amber-300/30 ring-2 ring-amber-400', className)}
      onTouchStart={ativo ? (e) => { const t = e.touches[0]; inicio.current = { x: t.clientX, y: t.clientY, horizontal: null }; } : undefined}
      onTouchMove={ativo ? (e) => {
        const i = inicio.current;
        if (!i) return;
        const t = e.touches[0];
        const mx = t.clientX - i.x;
        const my = t.clientY - i.y;
        if (i.horizontal === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) i.horizontal = Math.abs(mx) > Math.abs(my);
        if (i.horizontal) setDx(Math.max(0, Math.min(mx, LIMITE + 20)));
      } : undefined}
      onTouchEnd={ativo ? () => {
        if (dx >= LIMITE) { onResponder(); try { navigator.vibrate?.(15); } catch { /* sem vibração */ } }
        inicio.current = null;
        setDx(0);
      } : undefined}
    >
      {dx > 0 && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 text-lg" style={{ opacity: Math.min(1, dx / LIMITE) }}>↩️</span>
      )}
      <div style={dx ? { transform: `translateX(${dx}px)` } : undefined} className={cn(!dx && 'transition-transform')}>
        {children}
      </div>
    </div>
  );
}

// ─── @menções (sala e cabine) ─────────────────────────────────────────────────
// Os nomes têm espaço e símbolos ("Pablo&Nina", "Homem Casa 2"), então a marcação
// é o nome exato depois do @, comparado com quem está na sala ou na cabine.

const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** O texto marca essa pessoa (@Nome, sem diferenciar maiúscula). */
export function mencionou(texto: string | undefined, nome: string | undefined) {
  return !!texto && !!nome && texto.toLowerCase().includes(`@${nome.toLowerCase()}`);
}

/** Texto da mensagem com os @Nome de quem está aqui em destaque (o meu, mais forte). */
export function TextoComMencoes({ texto, nomes, meuNome }: { texto: string; nomes: string[]; meuNome?: string }) {
  const validos = [...new Set(nomes.filter((n) => n.trim().length > 0))].sort((a, b) => b.length - a.length);
  if (validos.length === 0 || !texto.includes('@')) return <>{texto}</>;
  const partes = texto.split(new RegExp(`(@(?:${validos.map(escapar).join('|')}))`, 'gi'));
  return (
    <>
      {partes.map((parte, i) => (i % 2 === 1
        ? <span key={i} className={cn('font-semibold text-sky-300', meuNome && parte.slice(1).toLowerCase() === meuNome.toLowerCase() && 'rounded bg-amber-400/25 px-0.5 text-amber-200')}>{parte}</span>
        : <Fragment key={i}>{parte}</Fragment>))}
    </>
  );
}

/** Termo sendo digitado depois do último @ (ou null se não está marcando ninguém). */
export function termoDaMencao(texto: string): { inicio: number; termo: string } | null {
  const i = texto.lastIndexOf('@');
  if (i < 0 || (i > 0 && !/\s/.test(texto[i - 1]))) return null;
  const termo = texto.slice(i + 1);
  if (termo.length > 30 || termo.includes('\n')) return null;
  return { inicio: i, termo };
}

/** Lista de quem está aqui para marcar, logo acima da caixa de texto. */
export function SugestoesDeMencao({ texto, pessoas, onEscolher, className }: {
  texto: string;
  pessoas: Array<{ id: string; nome: string; avatar?: string | null }>;
  onEscolher: (novoTexto: string) => void;
  className?: string;
}) {
  const m = termoDaMencao(texto);
  if (!m) return null;
  const termo = m.termo.toLowerCase();
  const opcoes = pessoas
    .filter((p) => p.nome.toLowerCase().startsWith(termo) && p.nome.toLowerCase() !== termo.trimEnd())
    .slice(0, 6);
  if (opcoes.length === 0) return null;
  return (
    <div className={cn('absolute bottom-full left-2 right-2 z-30 mb-1 flex flex-wrap gap-1.5 rounded-2xl bg-zinc-900/95 p-2 shadow-lg ring-1 ring-white/15', className)}>
      {opcoes.map((p) => (
        <button key={p.id} type="button" onMouseDown={(e) => e.preventDefault()}
          onClick={() => onEscolher(`${texto.slice(0, m.inicio)}@${p.nome} `)}
          className="flex items-center gap-1.5 rounded-full bg-white/10 py-1 pl-1 pr-2.5 text-xs font-semibold active:bg-white/20">
          {p.avatar ? <img src={resolveServerUrl(p.avatar)} alt="" className="h-5 w-5 rounded-full object-cover" /> : <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/15 text-[10px]">{p.nome.slice(0, 1)}</span>}
          @{p.nome}
        </button>
      ))}
    </div>
  );
}

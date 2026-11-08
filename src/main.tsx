import { createRoot } from "react-dom/client";
import { capturaPrimeiroToque } from '@/utils/primeiroToque';
import React from "react";
import App from "./App.tsx";
import "./index.css";
import { capturaOrigem } from "./utils/origemCadastro";

// Antes de o React Router assumir e reescrever a URL: quem chega pelas paginas
// regionais de SEO traz ?origem= no link do CTA, e e a unica chance de ler isso.
capturaOrigem();
capturaPrimeiroToque();

// Depois de um deploy, uma aba já aberta ainda tem o bundle ANTIGO em memória.
// Se o usuário navega pra uma rota cujo chunk não estava carregado ainda, o
// dynamic import() busca o arquivo hash antigo — que o deploy já substituiu no
// servidor — e falha. Não é um bug de app: é o index.html da aba estar
// desatualizado. A correção é recarregar (busca o index.html atual, com os
// hashes certos), não mostrar uma tela de erro pro usuário.
const CHUNK_RELOAD_KEY = 'nosigilo_chunk_reload_at';
// Uma tentativa só não bastava: durante um deploy os arquivos ficam sendo
// reescritos por dezenas de segundos, então o reload imediato falhava de novo
// e o usuário caía na tela de erro. Tenta algumas vezes, esperando mais a cada
// rodada, para atravessar a janela do deploy.
const CHUNK_RELOAD_DELAYS_MS = [1500, 5000, 12000];
// Depois desse tempo sem falhar, um novo erro conta como outro incidente
// (ex.: deploy seguinte com a mesma aba aberta) e ganha novas tentativas.
const CHUNK_INCIDENT_WINDOW_MS = 120000;
function isChunkLoadError(error: Error) {
  const msg = String(error?.message || '');
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(msg);
}

// A versão nova está no ar quando o index.html atual aponta para um script que
// o servidor já entrega. Durante o build o index.html ainda é o antigo e os
// arquivos antigos já sumiram: aí o script dele dá 404.
async function versaoNovaPronta() {
  try {
    const html = await (await fetch(`/?v=${Date.now()}`, { cache: 'no-store' })).text();
    const script = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1];
    if (!script) return false;
    const r = await fetch(script, { method: 'HEAD', cache: 'no-store' });
    return r.ok;
  } catch {
    return false;
  }
}

const CONFERIR_A_CADA_MS = 3000;
const DESISTIR_APOS_MS = 3 * 60_000;

// Endereço do arquivo que falhou ("Failed to fetch dynamically imported module: https://…/assets/X.js").
function arquivoQueFalhou(error: Error | null): string | null {
  return String(error?.message || '').match(/https?:\/\/\S+?\.js/)?.[0] ?? null;
}

// Quantas vezes esta tela já chegou em 100% e recarregou sem resolver (no mesmo incidente).
const RECARGAS_KEY = 'nosigilo_tela_atualizacao';
function recargasFeitas(): number {
  try {
    const v = JSON.parse(sessionStorage.getItem(RECARGAS_KEY) || 'null') as { n: number; at: number } | null;
    return v && Date.now() - v.at < CHUNK_INCIDENT_WINDOW_MS * 2 ? v.n : 0;
  } catch { return 0; }
}
function anotarRecarga(n: number) {
  try { sessionStorage.setItem(RECARGAS_KEY, JSON.stringify({ n, at: Date.now() })); } catch { /* modo privado */ }
}

// Recarrega de um jeito que não reaproveita o "não encontrado" guardado:
// 1ª vez, busca de novo da rede o arquivo que falhou (sobrescreve o 404 que o
// celular guardou durante o deploy); 2ª vez, limpa o cache do app e o service
// worker; depois disso, para e mostra o botão.
async function recarregarSemCacheVelho(arquivo: string | null): Promise<boolean> {
  const n = recargasFeitas();
  if (n >= 3) return false;
  anotarRecarga(n + 1);
  try { sessionStorage.removeItem(CHUNK_RELOAD_KEY); } catch { /* modo privado */ }
  if (arquivo) { try { await fetch(arquivo, { cache: 'reload' }); } catch { /* segue */ } }
  if (n >= 1) {
    try {
      const chaves = await caches.keys();
      await Promise.all(chaves.map((k) => caches.delete(k)));
      const regs = await navigator.serviceWorker?.getRegistrations?.();
      await Promise.all((regs ?? []).map((r) => r.unregister()));
    } catch { /* segue */ }
  }
  const url = new URL(window.location.href);
  url.searchParams.set('_r', String(Date.now()));
  window.location.replace(url.toString());
  return true;
}

/**
 * "Estamos atualizando o NoSigilo": barra de progresso enquanto o deploy
 * termina e recarga sozinha quando a versão nova fica pronta. O botão só
 * aparece se passar de 3 minutos (algo além de um deploy normal).
 */
function TelaDeAtualizacao({ arquivo = null }: { arquivo?: string | null }) {
  const [progresso, setProgresso] = React.useState(4);
  const [desistiu, setDesistiu] = React.useState(false);

  React.useEffect(() => {
    const inicio = Date.now();
    let parar = false;
    // Sobe rápido no começo e desacelera perto de 90%: um deploy leva de 30 s a 3 min.
    const barra = window.setInterval(() => {
      const t = (Date.now() - inicio) / 1000;
      setProgresso((atual) => Math.max(atual, 90 * (1 - Math.exp(-t / 45))));
    }, 250);
    const conferir = async () => {
      if (parar) return;
      if (await versaoNovaPronta()) {
        setProgresso(100);
        // Já recarregou e continuou preso: em vez de ficar em 100% para sempre, mostra o botão.
        if (!(await recarregarSemCacheVelho(arquivo))) setDesistiu(true);
        return;
      }
      if (Date.now() - inicio > DESISTIR_APOS_MS) { setDesistiu(true); return; }
      window.setTimeout(() => void conferir(), CONFERIR_A_CADA_MS);
    };
    void conferir();
    return () => { parar = true; window.clearInterval(barra); };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, minHeight: '100vh', padding: 24, textAlign: 'center', background: '#1a1a1a', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
      <style>{'@keyframes nsBrilho{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}'}</style>
      <h2 style={{ fontSize: 20, margin: 0 }}>Estamos atualizando o NoSigilo</h2>
      <p style={{ margin: 0, color: '#bbb', maxWidth: 420, lineHeight: 1.5 }}>
        {desistiu
          ? 'Está demorando mais que o normal. Toque no botão para tentar de novo.'
          : 'Leva só alguns segundos. A página vai recarregar sozinha quando terminar.'}
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progresso)}
        style={{ position: 'relative', width: 'min(320px, 80vw)', height: 8, borderRadius: 999, background: '#333', overflow: 'hidden' }}
      >
        <div style={{ position: 'absolute', inset: 0, width: `${progresso}%`, background: 'linear-gradient(90deg, #e83e68, #ff7a59)', borderRadius: 999, transition: 'width 250ms linear', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, width: '40%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)', animation: 'nsBrilho 1.2s ease-in-out infinite' }} />
        </div>
      </div>
      <span style={{ fontSize: 13, color: '#888' }}>{Math.round(progresso)}%</span>
      {desistiu && (
        <button
          type="button"
          onClick={() => {
            // Recomeça as tentativas (limpando o cache do app) a partir do toque.
            anotarRecarga(1);
            void recarregarSemCacheVelho(arquivo).then((ok) => { if (!ok) window.location.reload(); });
          }}
          style={{ background: '#e83e68', color: '#fff', border: 0, borderRadius: 12, padding: '12px 28px', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
        >
          Tentar de novo
        </button>
      )}
    </div>
  );
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null; reloading: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null, reloading: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    if (!isChunkLoadError(error)) return;
    // Conta as tentativas do incidente atual para não recarregar em loop quando
    // o arquivo está genuinamente ausente (e não só sendo reescrito por um deploy).
    let attempt = 0;
    try {
      const raw = sessionStorage.getItem(CHUNK_RELOAD_KEY);
      const prev = raw ? (JSON.parse(raw) as { count: number; at: number }) : null;
      const sameIncident = prev && Date.now() - prev.at < CHUNK_INCIDENT_WINDOW_MS;
      attempt = sameIncident ? prev!.count : 0;
      sessionStorage.setItem(CHUNK_RELOAD_KEY, JSON.stringify({ count: attempt + 1, at: Date.now() }));
    } catch {
      // sessionStorage indisponível (modo privado etc.) — segue sem o guard
    }
    const delay = CHUNK_RELOAD_DELAYS_MS[attempt];
    if (delay === undefined) return; // esgotou as tentativas → mostra a tela com o botão
    this.setState({ reloading: true });
    window.setTimeout(() => window.location.reload(), delay);
  }
  render() {
    if (this.state.reloading) return <TelaDeAtualizacao arquivo={arquivoQueFalhou(this.state.error)} />;
    if (this.state.error) {
      // Falha de chunk que sobreviveu às tentativas: quase sempre é um deploy
      // ainda em andamento. Mostra algo acionável em vez do stack trace.
      if (isChunkLoadError(this.state.error)) return <TelaDeAtualizacao arquivo={arquivoQueFalhou(this.state.error)} />;
      return (
        <div style={{ padding: 24, fontFamily: 'monospace', color: '#fff', background: '#1a1a1a', minHeight: '100vh' }}>
          <h2 style={{ color: '#f55', marginBottom: 16 }}>Erro ao carregar o app</h2>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13, color: '#ffd', background: '#000', padding: 16, borderRadius: 8 }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById("root")!;
root.innerHTML = '';
// App montando: sai a tela de abertura (index.html) e o aviso de falha não
// aparece mais.
(window as unknown as { __nsMontado?: boolean }).__nsMontado = true;
document.getElementById('boot-ns')?.remove();
createRoot(root).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // A versão no endereço fura qualquer cache no caminho (a Cloudflare
    // guardava o sw.js por 4h): cada versão publicada registra o service
    // worker daquela versão, e as correções chegam na hora.
    navigator.serviceWorker
      .register(`/sw.js?v=${encodeURIComponent(__APP_VERSION__)}`, { updateViaCache: 'none' })
      .catch(() => {});
  });
}

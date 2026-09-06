import { createRoot } from "react-dom/client";
import React from "react";
import App from "./App.tsx";
import "./index.css";
import { capturaOrigem } from "./utils/origemCadastro";

// Antes de o React Router assumir e reescrever a URL: quem chega pelas paginas
// regionais de SEO traz ?origem= no link do CTA, e e a unica chance de ler isso.
capturaOrigem();

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
    if (this.state.reloading) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#1a1a1a', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
          Atualizando…
        </div>
      );
    }
    if (this.state.error) {
      // Falha de chunk que sobreviveu às tentativas: quase sempre é um deploy
      // ainda em andamento. Mostra algo acionável em vez do stack trace.
      if (isChunkLoadError(this.state.error)) {
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, minHeight: '100vh', padding: 24, textAlign: 'center', background: '#1a1a1a', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
            <h2 style={{ fontSize: 20, margin: 0 }}>Estamos atualizando o NoSigilo</h2>
            <p style={{ margin: 0, color: '#bbb', maxWidth: 420, lineHeight: 1.5 }}>
              Isso leva alguns segundos. Toque no botão abaixo para carregar a versão nova.
            </p>
            <button
              type="button"
              onClick={() => {
                try { sessionStorage.removeItem(CHUNK_RELOAD_KEY); } catch { /* modo privado */ }
                window.location.reload();
              }}
              style={{ background: '#e83e68', color: '#fff', border: 0, borderRadius: 12, padding: '12px 28px', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
            >
              Tentar de novo
            </button>
          </div>
        );
      }
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
createRoot(root).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {});
  });
}

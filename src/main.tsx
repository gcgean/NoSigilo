import { createRoot } from "react-dom/client";
import React from "react";
import App from "./App.tsx";
import "./index.css";

// Depois de um deploy, uma aba já aberta ainda tem o bundle ANTIGO em memória.
// Se o usuário navega pra uma rota cujo chunk não estava carregado ainda, o
// dynamic import() busca o arquivo hash antigo — que o deploy já substituiu no
// servidor — e falha. Não é um bug de app: é o index.html da aba estar
// desatualizado. A correção é recarregar (busca o index.html atual, com os
// hashes certos), não mostrar uma tela de erro pro usuário.
const CHUNK_RELOAD_KEY = 'nosigilo_chunk_reload_at';
// Janela pra considerar "mesmo incidente" (não recarrega de novo em loop) sem
// travar a aba pra sempre: uma falha nova horas depois (outro deploy, mesma
// aba ainda aberta) ganha sua própria tentativa.
const CHUNK_RELOAD_GUARD_MS = 15000;
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
    // Só recarrega se não tentou nos últimos segundos — evita loop caso o
    // reload não resolva (arquivo genuinamente ausente, não só desatualizado).
    let recentlyTried = false;
    try {
      const lastAttempt = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
      recentlyTried = Date.now() - lastAttempt < CHUNK_RELOAD_GUARD_MS;
      if (!recentlyTried) sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    } catch {
      // sessionStorage indisponível (modo privado etc.) — segue sem o guard
    }
    if (!recentlyTried) {
      this.setState({ reloading: true });
      window.location.reload();
    }
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

import { createRoot } from "react-dom/client";
import React from "react";
import App from "./App.tsx";
import "./index.css";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: 'sans-serif', color: '#111' }}>
          <h2 style={{ color: '#c00' }}>Erro ao carregar o app</h2>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13 }}>
            {this.state.error.message}
            {'\n'}
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

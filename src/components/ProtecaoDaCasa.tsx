import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Proteção contra print nas salas e cabines d'A Casa.
 * Nenhum site consegue bloquear o print do celular de verdade; aqui dificultamos
 * e deixamos rastro:
 * - marca d'água com o nome e o id de quem está vendo (print vazado mostra quem foi);
 * - a tela escurece quando a janela perde o foco (ferramenta de recorte no PC,
 *   troca de app ou gravação pelo seletor de tarefas no celular) e na tecla PrintScreen;
 * - sem seleção de texto, sem copiar e sem menu do botão direito.
 */
export default function ProtecaoDaCasa({ nome, id }: { nome: string; id: string }) {
  const [oculto, setOculto] = useState(false);

  useEffect(() => {
    const esconder = () => setOculto(true);
    const mostrar = () => setOculto(false);
    const aoVisibilidade = () => (document.visibilityState === 'hidden' ? esconder() : mostrar());
    const aoTecla = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen' || (e.metaKey && e.shiftKey) || (e.key.toLowerCase() === 's' && e.shiftKey && (e.metaKey || e.ctrlKey))) {
        esconder();
        try { void navigator.clipboard?.writeText(''); } catch { /* sem acesso */ }
        setTimeout(mostrar, 1500);
      }
    };
    const bloquear = (e: Event) => e.preventDefault();
    window.addEventListener('blur', esconder);
    window.addEventListener('focus', mostrar);
    document.addEventListener('visibilitychange', aoVisibilidade);
    window.addEventListener('keyup', aoTecla);
    window.addEventListener('keydown', aoTecla);
    document.addEventListener('copy', bloquear);
    document.addEventListener('cut', bloquear);
    document.addEventListener('contextmenu', bloquear);
    const estiloAntigo = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    (document.body.style as any).webkitUserSelect = 'none';
    (document.body.style as any).webkitTouchCallout = 'none';
    return () => {
      window.removeEventListener('blur', esconder);
      window.removeEventListener('focus', mostrar);
      document.removeEventListener('visibilitychange', aoVisibilidade);
      window.removeEventListener('keyup', aoTecla);
      window.removeEventListener('keydown', aoTecla);
      document.removeEventListener('copy', bloquear);
      document.removeEventListener('cut', bloquear);
      document.removeEventListener('contextmenu', bloquear);
      document.body.style.userSelect = estiloAntigo;
      (document.body.style as any).webkitUserSelect = '';
      (document.body.style as any).webkitTouchCallout = '';
    };
  }, []);

  const marca = `${nome} · ${id.slice(0, 8)} · NoSigilo`;
  return createPortal(
    <>
      {/* Marca d'água por cima de tudo, sem atrapalhar os toques. */}
      <div className="pointer-events-none fixed inset-0 z-[99998] select-none overflow-hidden opacity-[0.07]" aria-hidden>
        <div className="absolute -inset-1/2 flex rotate-[-25deg] flex-wrap content-start gap-x-16 gap-y-14">
          {Array.from({ length: 120 }).map((_, i) => (
            <span key={i} className="whitespace-nowrap text-sm font-bold text-white">{marca}</span>
          ))}
        </div>
      </div>
      {oculto && (
        <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center gap-2 bg-black text-center text-white">
          <p className="text-3xl">🔒</p>
          <p className="font-semibold">Conteúdo protegido</p>
          <p className="max-w-xs text-xs text-white/60">O que acontece na Casa fica na Casa. Prints e gravações são proibidos e levam à exclusão da conta.</p>
        </div>
      )}
    </>,
    document.body,
  );
}

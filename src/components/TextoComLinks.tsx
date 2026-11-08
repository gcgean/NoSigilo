import { Fragment, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { dominioDoLink, separarLinksDoTexto } from '@/utils/linksNoTexto';
import { cn } from '@/lib/utils';

/**
 * Link de fora do NoSigilo: antes de abrir, avisa para onde vai (domínio em
 * destaque) e lembra de nunca digitar a senha nem pagar por link de
 * desconhecido. Abre em outra aba, sem passar quem indicou (noreferrer).
 */
export function LinkExterno({ href, children, className, onAvisoAberto }: { href: string; children: ReactNode; className?: string; onAvisoAberto?: (aberto: boolean) => void }) {
  const [aberto, setAbertoInterno] = useState(false);
  const setAberto = (v: boolean) => { setAbertoInterno(v); onAvisoAberto?.(v); };
  const dominio = dominioDoLink(href);
  return (
    <>
      <a
        href={href}
        rel="noopener noreferrer nofollow ugc"
        target="_blank"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAberto(true); }}
        className={cn('break-all font-semibold underline underline-offset-2', className)}
      >
        {children}
      </a>
      <AlertDialog open={aberto} onOpenChange={setAberto}>
        <AlertDialogContent className="max-w-[92vw] sm:max-w-md" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Você vai sair do NoSigilo</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Este link abre <b className="break-all text-foreground">{dominio}</b>, um site fora do NoSigilo.</p>
                <p>Nunca digite sua senha do NoSigilo nem faça pagamentos por links de desconhecidos.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { window.open(href, '_blank', 'noopener,noreferrer'); }}>
              <ExternalLink className="mr-1.5 h-4 w-4" /> Abrir link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Texto com endereços clicáveis. Link do NoSigilo abre aqui dentro; de fora
 * passa pelo aviso. `externos={false}` deixa links de fora como texto (pedido
 * de contato ainda não aceito, por exemplo).
 */
export default function TextoComLinks({ texto, externos = true, className }: { texto: string; externos?: boolean; className?: string }) {
  const navigate = useNavigate();
  const partes = separarLinksDoTexto(texto);
  if (!partes.some((p) => p.href)) return <>{texto}</>;
  return (
    <>
      {partes.map((p, i) => {
        if (!p.href) return <Fragment key={i}>{p.texto}</Fragment>;
        if (p.interno) {
          const destino = new URL(p.href);
          return (
            <a
              key={i}
              href={p.href}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`${destino.pathname}${destino.search}${destino.hash}`); }}
              className={cn('break-all font-semibold underline underline-offset-2', className)}
            >
              {p.texto}
            </a>
          );
        }
        if (!externos) return <Fragment key={i}>{p.texto}</Fragment>;
        return <LinkExterno key={i} href={p.href} className={className}>{p.texto}</LinkExterno>;
      })}
    </>
  );
}

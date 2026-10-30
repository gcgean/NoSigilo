import { useEffect, useState } from 'react';
import { Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { videoSearchService } from '@/services/api';
import { cn } from '@/lib/utils';

export type TemaVideo = { slug: string; nome: string; total: number };
export const MAX_TEMAS_VIDEO = 2;

// A lista é a mesma para o app todo e quase nunca muda: busca uma vez só.
let cache: Promise<TemaVideo[]> | null = null;
export function carregarTemasVideo(forcar = false): Promise<TemaVideo[]> {
  if (!cache || forcar) {
    cache = videoSearchService.temas().then((r) => r.temas).catch((e) => { cache = null; throw e; });
  }
  return cache;
}

export function useTemasVideo() {
  const [temas, setTemas] = useState<TemaVideo[]>([]);
  useEffect(() => {
    let vivo = true;
    carregarTemasVideo().then((t) => { if (vivo) setTemas(t); }).catch(() => {});
    return () => { vivo = false; };
  }, []);
  return temas;
}

export function nomeDoTema(temas: TemaVideo[], slug: string) {
  return temas.find((t) => t.slug === slug)?.nome ?? slug;
}

/** Chips para escolher até 2 temas. */
export function ChipsTemasVideo({
  temas,
  valor,
  onChange,
  className,
}: {
  temas: TemaVideo[];
  valor: string[];
  onChange: (v: string[]) => void;
  className?: string;
}) {
  const alternar = (slug: string) => {
    if (valor.includes(slug)) onChange(valor.filter((s) => s !== slug));
    // No limite, o mais antigo sai para o novo entrar.
    else onChange([...valor, slug].slice(-MAX_TEMAS_VIDEO));
  };
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {temas.map((t) => {
        const ativo = valor.includes(t.slug);
        return (
          <button
            key={t.slug}
            type="button"
            onClick={() => alternar(t.slug)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              ativo
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground'
            )}
          >
            {t.nome}
          </button>
        );
      })}
    </div>
  );
}

/** "Qual o tema do vídeo?" — usado antes de enviar (Perfil) e para trocar depois. */
export function DialogoTemaVideo({
  open,
  inicial,
  titulo = 'Qual o tema do vídeo?',
  confirmar = 'Continuar',
  onConfirmar,
  onFechar,
}: {
  open: boolean;
  inicial?: string[];
  titulo?: string;
  confirmar?: string;
  onConfirmar: (temas: string[]) => void;
  onFechar: () => void;
}) {
  const temas = useTemasVideo();
  const [valor, setValor] = useState<string[]>(inicial ?? []);
  useEffect(() => { if (open) setValor(inicial ?? []); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Tag className="h-4 w-4 text-primary" /> {titulo}</DialogTitle>
          <DialogDescription>
            Escolha até {MAX_TEMAS_VIDEO}. Assim quem curte esse tema encontra seu vídeo em Buscar Vídeos.
          </DialogDescription>
        </DialogHeader>
        <ChipsTemasVideo temas={temas} valor={valor} onChange={setValor} className="max-h-[50vh] overflow-y-auto" />
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button className="bg-gradient-primary" disabled={valor.length === 0} onClick={() => onConfirmar(valor)}>
            {confirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

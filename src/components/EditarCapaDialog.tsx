import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { capaService } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { cn } from '@/lib/utils';
import type { FotoDeCapa } from '@/components/CapaDoPerfil';

/**
 * Escolha das duas fotos da capa (só fotos públicas) e da opção de borrar.
 * Sem escolha, o sistema usa as duas fotos públicas mais curtidas.
 */
export default function EditarCapaDialog({
  aberto,
  aoFechar,
  fotosPublicas,
  escolhidasAtuais,
  borradaAtual,
  aoSalvar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  fotosPublicas: Array<{ id: string; url: string }>;
  escolhidasAtuais: string[];
  borradaAtual: boolean;
  aoSalvar: (r: { capa: FotoDeCapa[]; capaBorrada: boolean; capaEscolhida: boolean }) => void;
}) {
  const { toast } = useToast();
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  const [borrada, setBorrada] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setEscolhidas(escolhidasAtuais.slice(0, 2));
    setBorrada(borradaAtual);
  }, [aberto, escolhidasAtuais, borradaAtual]);

  const alternar = (id: string) => {
    setEscolhidas((atual) => {
      if (atual.includes(id)) return atual.filter((x) => x !== id);
      if (atual.length >= 2) return [atual[1], id]; // troca a mais antiga
      return [...atual, id];
    });
  };

  const salvar = async (automatico = false) => {
    setSalvando(true);
    try {
      const r = await capaService.salvar({ mediaIds: automatico ? [] : escolhidas, borrada });
      aoSalvar(r);
      toast({ title: 'Capa atualizada' });
      aoFechar();
    } catch {
      toast({ title: 'Não foi possível salvar a capa', variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Capa do perfil</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Escolha até 2 fotos públicas. Fotos privadas nunca aparecem na capa.
        </p>

        {fotosPublicas.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Você ainda não tem fotos públicas. Publique uma foto para usar na capa.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {fotosPublicas.map((f) => {
              const pos = escolhidas.indexOf(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => alternar(f.id)}
                  className={cn(
                    'relative aspect-square overflow-hidden rounded-lg border-2',
                    pos >= 0 ? 'border-primary' : 'border-transparent'
                  )}
                >
                  <img src={resolveServerUrl(f.url)} alt="" className="h-full w-full object-cover" />
                  {pos >= 0 && (
                    <span className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {pos + 1}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
          <span className="text-sm">
            <span className="font-medium">Capa borrada para visitantes</span>
            <span className="block text-xs text-muted-foreground">Quem visita vê borrado até tocar. Bom para quem abre o app em público.</span>
          </span>
          <Switch checked={borrada} onCheckedChange={setBorrada} />
        </label>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void salvar(true)}
            disabled={salvando}
            className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm text-muted-foreground hover:bg-secondary disabled:opacity-60"
          >
            Escolher automaticamente
          </button>
          <button
            type="button"
            onClick={() => void salvar(false)}
            disabled={salvando}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Salvar capa
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

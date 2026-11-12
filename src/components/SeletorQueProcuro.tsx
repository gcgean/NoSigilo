import { useState } from 'react';
import { Check, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { profileService } from '@/services/api';
import { GRUPOS_QUE_PROCURO, gruposDoPerfil, listaDosGrupos, resumoDoQueProcuro, type GrupoQueProcuro } from '@/utils/grupoQueProcuro';
import { cn } from '@/lib/utils';

/**
 * "Mostrando: Mulheres ✎" no topo da Busca e do Match (12/11/2026). Antes o
 * "O que procuro" ficava em Configurações › Perfil › Interesses e ninguém
 * achava: um casal que só procura mulheres via casais e homens. Mudou aqui,
 * salva no perfil e vale para Busca, Match e stories.
 */
export default function SeletorQueProcuro({ onMudou, className }: { onMudou?: () => void; className?: string }) {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const atual = ((user as any)?.lookingFor as string[] | undefined) ?? [];
  const [aberto, setAberto] = useState(false);
  const [escolha, setEscolha] = useState<Set<GrupoQueProcuro>>(() => gruposDoPerfil(atual));
  const [salvando, setSalvando] = useState(false);

  const abrir = () => { setEscolha(gruposDoPerfil(atual)); setAberto(true); };
  const alternar = (id: GrupoQueProcuro) => setEscolha((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const salvar = async () => {
    if (escolha.size === 0) return;
    const lista = listaDosGrupos(escolha, atual);
    setSalvando(true);
    try {
      await profileService.updateProfile({ lookingFor: lista });
      updateUser({ lookingFor: lista } as any);
      setAberto(false);
      toast({ title: `Mostrando: ${resumoDoQueProcuro(lista)}` });
      onMudou?.();
    } catch {
      toast({ title: 'Não foi possível salvar', description: 'Tente de novo em instantes.', variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className={cn('flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary/5 px-4 py-2 text-left', className)}
        aria-label={`Mostrando: ${resumoDoQueProcuro(atual)}. Toque para mudar`}
      >
        <span className="min-w-0 truncate text-sm">
          <span className="text-muted-foreground">Mostrando: </span>
          <b>{resumoDoQueProcuro(atual)}</b>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-pink">
          <Pencil className="h-4 w-4" /> Mudar
        </span>
      </button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        {/* z-[80]: abre por cima do Match e do chat no celular. */}
        <DialogContent overlayClassName="z-[80]" className="z-[80] max-w-sm rounded-2xl">
          <DialogTitle>Quem vocês querem ver?</DialogTitle>
          <DialogDescription>Toque para marcar ou desmarcar. Vale para a Busca, o Match e os stories.</DialogDescription>
          <div className="grid grid-cols-2 gap-3">
            {GRUPOS_QUE_PROCURO.map((g) => {
              const ligado = escolha.has(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => alternar(g.id)}
                  aria-pressed={ligado}
                  className={cn(
                    'relative flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border-2 p-3 text-base font-semibold transition-colors',
                    ligado ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground',
                  )}
                >
                  {ligado && <Check className="absolute right-2 top-2 h-4 w-4 text-primary" />}
                  <span className="text-2xl" aria-hidden>{g.emoji}</span>
                  {g.rotulo}
                </button>
              );
            })}
          </div>
          {escolha.size === 0 && <p className="text-sm text-destructive">Marque pelo menos um tipo de perfil.</p>}
          <Button className="h-12 w-full bg-gradient-primary text-base" disabled={salvando || escolha.size === 0} onClick={() => void salvar()}>
            {salvando ? 'Salvando…' : 'Mostrar esses perfis'}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

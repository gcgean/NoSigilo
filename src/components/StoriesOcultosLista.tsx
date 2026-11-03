import { useEffect, useState } from 'react';
import { storiesService } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { useToast } from '@/hooks/use-toast';

/**
 * Configurações › Privacidade › "Stories ocultos": perfis cujos stories a
 * pessoa escolheu não ver mais (menu ⋯ do story), com "Mostrar de novo".
 */
export default function StoriesOcultosLista() {
  const { toast } = useToast();
  const [perfis, setPerfis] = useState<Array<{ id: string; name: string; avatar: string | null }> | null>(null);
  const [voltando, setVoltando] = useState<string | null>(null);

  useEffect(() => {
    storiesService.listarOcultos().then((r) => setPerfis(r.perfis)).catch(() => setPerfis([]));
  }, []);

  const mostrar = async (id: string, nome: string) => {
    setVoltando(id);
    try {
      await storiesService.mostrarAutor(id);
      setPerfis((p) => (p ?? []).filter((x) => x.id !== id));
      toast({ title: `Os stories de ${nome} voltam a aparecer` });
    } catch {
      toast({ title: 'Não deu certo', description: 'Tente de novo.', variant: 'destructive' });
    } finally {
      setVoltando(null);
    }
  };

  return (
    <div className="space-y-3 pt-2 border-t border-border/50">
      <div>
        <p className="font-medium">Stories ocultos</p>
        <p className="text-sm text-muted-foreground">
          Perfis cujos stories você escolheu não ver mais (no menu ⋯ do story). Eles não ficam sabendo.
        </p>
      </div>
      {perfis === null ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : perfis.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum perfil oculto.</p>
      ) : (
        <ul className="space-y-2">
          {perfis.map((p) => (
            <li key={p.id} className="flex items-center gap-3">
              {p.avatar ? (
                <img src={resolveServerUrl(p.avatar)} alt="" className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-sm font-semibold">{p.name[0]?.toUpperCase() || 'U'}</span>
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
              <button
                type="button"
                disabled={voltando === p.id}
                onClick={() => void mostrar(p.id, p.name)}
                className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-60"
              >
                {voltando === p.id ? '...' : 'Mostrar de novo'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

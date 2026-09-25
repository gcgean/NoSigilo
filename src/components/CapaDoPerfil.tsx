import { useState } from 'react';
import { Eye, ImagePlus, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveServerUrl } from '@/utils/serverUrl';

export type FotoDeCapa = { mediaId: string; url: string };

/**
 * Capa do perfil: até duas fotos públicas lado a lado no topo.
 *
 * - Sem foto: fundo da marca com convite para adicionar (vira empurrão para
 *   postar — perfil com foto recebe muito mais mensagem).
 * - Borrada: o dono pode pedir; quem visita vê borrado até tocar, para abrir o
 *   app em lugar público sem expor nada.
 */
export default function CapaDoPerfil({
  fotos,
  borrada,
  ehDono,
  onEditar,
}: {
  fotos: FotoDeCapa[];
  borrada?: boolean;
  ehDono?: boolean;
  onEditar?: () => void;
}) {
  const [revelada, setRevelada] = useState(false);
  const esconder = !!borrada && !revelada && !ehDono;

  if (fotos.length === 0) {
    return (
      <div className="relative h-36 w-full overflow-hidden rounded-t-2xl bg-gradient-to-br from-primary/40 via-fuchsia-700/30 to-indigo-900/40 sm:h-44">
        {ehDono && (
          <button
            type="button"
            onClick={onEditar}
            className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-sm font-medium text-white/90 hover:text-white"
          >
            <ImagePlus className="h-6 w-6" />
            Adicione fotos à sua capa
            <span className="text-xs font-normal text-white/70">Perfil com foto recebe muito mais mensagem</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative h-36 w-full overflow-hidden rounded-t-2xl bg-black sm:h-44">
      <div className={cn('grid h-full w-full gap-0.5', fotos.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
        {fotos.map((f) => (
          <img
            key={f.mediaId}
            src={resolveServerUrl(f.url)}
            alt=""
            aria-hidden
            draggable={false}
            className={cn('h-full w-full object-cover transition', esconder && 'scale-110 blur-2xl')}
          />
        ))}
      </div>
      {/* Degradê embaixo: o avatar sobreposto fica legível sobre qualquer foto. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent" />

      {esconder && (
        <button
          type="button"
          onClick={() => setRevelada(true)}
          className="absolute inset-0 flex items-center justify-center gap-1.5 text-sm font-semibold text-white"
        >
          <Eye className="h-4 w-4" /> Toque para ver a capa
        </button>
      )}

      {ehDono && (
        <button
          type="button"
          onClick={onEditar}
          className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur hover:bg-black/70"
        >
          <Pencil className="h-3 w-3" /> Editar capa
        </button>
      )}
    </div>
  );
}

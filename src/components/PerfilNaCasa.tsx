import { useEffect, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import apiClient from '@/utils/apiClient';
import { resolveServerUrl } from '@/utils/serverUrl';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

/**
 * Perfil da pessoa por cima d'A Casa: fotos, bio e o que procura, sem sair da
 * sala (a rádio e o chat continuam rodando atrás).
 */
type Perfil = {
  id: string; name: string; avatar: string | null; bio: string | null; status: string | null;
  city: string | null; state: string | null; gender: string | null;
  birthDate: string | null; partnerBirthDate: string | null;
  lookingFor?: string[] | null; fetiches?: string[] | null; intentions?: string[] | null;
  distanceKm: number | null; publicPhotosCount: number; isOnline?: boolean;
};
type Foto = { id: string; url: string };

const idade = (d: string | null) => {
  if (!d) return null;
  const n = new Date(d);
  if (Number.isNaN(n.getTime())) return null;
  const hoje = new Date();
  let a = hoje.getFullYear() - n.getFullYear();
  if (hoje.getMonth() < n.getMonth() || (hoje.getMonth() === n.getMonth() && hoje.getDate() < n.getDate())) a--;
  return a > 17 && a < 100 ? a : null;
};

export default function PerfilNaCasa({ userId, onFechar }: { userId: string | null; onFechar: () => void }) {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [erro, setErro] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    setPerfil(null); setFotos([]); setErro(false); setAberta(null);
    apiClient.get(`/users/${userId}`).then((r) => setPerfil(r.data)).catch(() => setErro(true));
    apiClient.get(`/users/${userId}/photos`, { params: { visibility: 'public' } })
      .then((r) => setFotos(Array.isArray(r.data) ? r.data.slice(0, 12) : []))
      .catch(() => {});
  }, [userId]);

  const idades = perfil ? [idade(perfil.birthDate), idade(perfil.partnerBirthDate)].filter((x): x is number => x != null) : [];
  const etiquetas = perfil ? [...(perfil.lookingFor ?? []).map((x) => `Procura: ${x}`), ...(perfil.intentions ?? []), ...(perfil.fetiches ?? [])].slice(0, 12) : [];

  return (
    <Dialog open={!!userId} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="z-[9996] max-h-[90vh] max-w-md overflow-y-auto border-fuchsia-500/30 bg-zinc-950 p-0 text-white">
        <DialogTitle className="sr-only">{perfil?.name ?? 'Perfil'}</DialogTitle>
        {erro && <p className="p-6 text-center text-sm text-white/70">Não foi possível abrir este perfil agora.</p>}
        {!perfil && !erro && <p className="p-6 text-center text-sm text-white/60">Carregando…</p>}
        {perfil && (
          <div>
            <div className="flex items-center gap-4 bg-gradient-to-br from-fuchsia-900/60 to-rose-900/50 p-5">
              <img
                src={perfil.avatar ? resolveServerUrl(perfil.avatar) : '/icon-192.png'}
                alt="" className="h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-fuchsia-400"
              />
              <div className="min-w-0">
                <p className="truncate text-lg font-bold">{perfil.name}{idades.length ? `, ${idades.join(' e ')}` : ''}</p>
                <p className="text-xs text-white/70">{perfil.gender}</p>
                {(perfil.city || perfil.distanceKm != null) && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-white/70">
                    <MapPin className="h-3 w-3" />
                    {[perfil.city, perfil.state].filter(Boolean).join(' - ')}
                    {perfil.distanceKm != null ? ` · ${perfil.distanceKm < 2 ? 'menos de 2' : perfil.distanceKm} km` : ''}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-4 p-5">
              {perfil.status && <p className="text-sm italic text-fuchsia-200">“{perfil.status}”</p>}
              {perfil.bio && <p className="whitespace-pre-line text-sm text-white/85">{perfil.bio}</p>}
              {etiquetas.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {etiquetas.map((t) => <span key={t} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px]">{t}</span>)}
                </div>
              )}
              {fotos.length > 0 ? (
                <div className="grid grid-cols-3 gap-1.5">
                  {fotos.map((f) => (
                    <button key={f.id} type="button" onClick={() => setAberta(f.url)} className="aspect-square overflow-hidden rounded-lg">
                      <img src={resolveServerUrl(f.url)} alt="" className="h-full w-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/50">Sem fotos públicas.</p>
              )}
              <a href={`/users/${perfil.id}`} className="block text-center text-[11px] text-white/50 underline">
                Abrir o perfil completo (sai da Casa)
              </a>
            </div>
          </div>
        )}

        {aberta && (
          <div className="fixed inset-0 z-[9997] flex items-center justify-center bg-black/95" onClick={() => setAberta(null)}>
            <button type="button" className="absolute right-3 top-3 rounded-full bg-white/10 p-2" aria-label="Fechar foto"><X className="h-5 w-5" /></button>
            <img src={resolveServerUrl(aberta)} alt="" className="max-h-full max-w-full object-contain" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

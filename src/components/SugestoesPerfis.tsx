import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { matchService } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { textoDistancia } from '@/utils/distancia';
import { useToast } from '@/hooks/use-toast';

type Sugestao = {
  id: string;
  name: string;
  gender?: string | null;
  city?: string | null;
  state?: string | null;
  mainMediaUrl?: string | null;
  avatar?: string | null;
  distanceKm?: number | null;
  isOnline?: boolean;
};

const DISPENSADAS_KEY = 'nosigilo:sugestoes-dispensadas';

/**
 * "Sugestões para você" no meio do feed: os mesmos perfis do Match (mesmas
 * regras de proximidade, interesse, atividade e Super Curtida/Disponível hoje),
 * em carrossel. Curtir aqui é a mesma curtida do Match; o X só esconde.
 */
export default function SugestoesPerfis() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [lista, setLista] = useState<Sugestao[]>([]);
  const [curtidos, setCurtidos] = useState<Set<string>>(new Set());

  useEffect(() => {
    let dispensadas: string[] = [];
    try { dispensadas = JSON.parse(localStorage.getItem(DISPENSADAS_KEY) || '[]'); } catch { /* ok */ }
    matchService.getCards()
      .then((cards: any) => {
        const arr = (Array.isArray(cards) ? cards : []) as Sugestao[];
        setLista(arr.filter((c) => (c.mainMediaUrl || c.avatar) && !dispensadas.includes(String(c.id))).slice(0, 12));
      })
      .catch(() => setLista([]));
  }, []);

  const dispensar = (id: string) => {
    setLista((atual) => atual.filter((c) => c.id !== id));
    try {
      const ant = JSON.parse(localStorage.getItem(DISPENSADAS_KEY) || '[]') as string[];
      localStorage.setItem(DISPENSADAS_KEY, JSON.stringify([...ant, id].slice(-300)));
    } catch { /* ok */ }
  };

  const curtir = async (s: Sugestao) => {
    setCurtidos((atual) => new Set(atual).add(s.id));
    try {
      const r = await matchService.like(s.id);
      if (r?.mutual) toast({ title: '💞 Deu match!', description: `Você e ${s.name} se curtiram. A conversa já está liberada.` });
    } catch {
      setCurtidos((atual) => { const n = new Set(atual); n.delete(s.id); return n; });
    }
  };

  if (lista.length === 0) return null;

  return (
    <Card className="glass overflow-hidden p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-bold">Sugestões para você</p>
        <button type="button" onClick={() => navigate('/match')} className="text-xs font-semibold text-brand-pink hover:underline">Ver no Match</button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {lista.map((s) => {
          const foto = s.mainMediaUrl || s.avatar;
          const curtiu = curtidos.has(s.id);
          return (
            <div key={s.id} className="relative w-36 shrink-0 overflow-hidden rounded-xl border bg-card">
              <button type="button" onClick={() => dispensar(s.id)} aria-label="Não mostrar"
                className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70">
                <X className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => navigate(`/users/${s.id}`)} className="block w-full text-left">
                <div className="relative aspect-[3/4] w-full bg-muted">
                  {foto ? <img src={resolveServerUrl(foto)} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
                  {s.isOnline && <span className="absolute bottom-1.5 left-1.5 rounded-full bg-[#22c55e] px-1.5 text-[9px] font-bold uppercase leading-4 text-white">online</span>}
                </div>
                <div className="px-2 pt-1.5">
                  <p className="truncate text-xs font-semibold">{s.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{s.gender || ''}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {textoDistancia(s.distanceKm, { cidade: s.city }) || [s.city, s.state].filter(Boolean).join(', ')}
                  </p>
                </div>
              </button>
              <div className="p-2">
                <button type="button" disabled={curtiu} onClick={() => void curtir(s)}
                  className="flex w-full items-center justify-center gap-1 rounded-lg bg-gradient-primary py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                  <Heart className="h-3.5 w-3.5" fill={curtiu ? 'white' : 'none'} /> {curtiu ? 'Curtido' : 'Curtir'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

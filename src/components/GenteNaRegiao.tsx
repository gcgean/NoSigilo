import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { locationService } from '@/services/api';

type Regiao = { mostrar: boolean; raioKm?: number; naRegiao?: number };

// Uma consulta por sessão de tela basta: o número muda devagar.
let cache: { valor: Regiao; em: number } | null = null;
const VALE_MS = 10 * 60_000;

/** Arredonda para baixo e mostra com "+": 647 vira "640+", 23 vira "20+". */
export function numeroComMais(n: number): string {
  if (n >= 1000) return `${(Math.floor(n / 100) * 100).toLocaleString('pt-BR')}+`;
  if (n >= 100) return `${Math.floor(n / 10) * 10}+`;
  if (n >= 20) return `${Math.floor(n / 5) * 5}+`;
  return String(n);
}

/**
 * Convite positivo para ampliar a distância: "Tem muito mais gente perto de
 * você — 640+ perfis ativos a até 50 km". Some quando a pessoa já está vendo
 * esse raio (ou maior). Nunca diz que a cidade dela tem pouca gente.
 */
export function GenteNaRegiao({ raioAtualKm, onVer }: { raioAtualKm: number | null; onVer: (raioKm: number) => void }) {
  const [regiao, setRegiao] = useState<Regiao | null>(cache && Date.now() - cache.em < VALE_MS ? cache.valor : null);

  useEffect(() => {
    if (regiao) return;
    let vivo = true;
    locationService.getRegiao()
      .then((r) => { cache = { valor: r, em: Date.now() }; if (vivo) setRegiao(r); })
      .catch(() => { /* sem aviso: não atrapalha a tela */ });
    return () => { vivo = false; };
  }, [regiao]);

  if (!regiao?.mostrar || !regiao.raioKm || !regiao.naRegiao) return null;
  if (raioAtualKm !== null && raioAtualKm >= regiao.raioKm) return null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
      <MapPin className="h-4 w-4 shrink-0 text-emerald-500" />
      <p className="min-w-0 flex-1 text-xs leading-5 text-foreground">
        {/* Sem a quantidade de perfis (13/11/2026, a pedido do dono). */}
        Tem muito mais gente perto de você, a até <b>{regiao.raioKm} km</b>.
      </p>
      <button
        type="button"
        onClick={() => onVer(regiao.raioKm!)}
        className="min-h-[36px] shrink-0 rounded-full bg-emerald-500 px-3 text-xs font-semibold text-white hover:bg-emerald-600"
      >
        Ver até {regiao.raioKm} km
      </button>
    </div>
  );
}

import { useEffect, useState } from 'react';
import apiClient from '@/utils/apiClient';
import { resolveServerUrl } from '@/utils/serverUrl';
import { Button } from '@/components/ui/button';

/** Ranking d'A Casa: pontos de desafios, duelos, relâmpagos e drinks (noite ou mês). */
type Linha = { posicao: number; id: string; nome: string; cat: string; avatar: string | null; pontos: number };

const MEDALHA = ['🥇', '🥈', '🥉'];

export default function RankingDaCasa() {
  const [periodo, setPeriodo] = useState<'noite' | 'mes'>('noite');
  const [cat, setCat] = useState<'casal' | 'todos'>('casal');
  const [linhas, setLinhas] = useState<Linha[] | null>(null);

  useEffect(() => {
    setLinhas(null);
    apiClient.get('/casa/ranking', { params: { periodo, cat } })
      .then((r) => setLinhas(r.data.ranking ?? []))
      .catch(() => setLinhas([]));
  }, [periodo, cat]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant={periodo === 'noite' ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setPeriodo('noite')}>Da noite</Button>
        <Button size="sm" variant={periodo === 'mes' ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setPeriodo('mes')}>Do mês</Button>
        <span className="mx-1" />
        <Button size="sm" variant={cat === 'casal' ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setCat('casal')}>💑 Casais</Button>
        <Button size="sm" variant={cat === 'todos' ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setCat('todos')}>Todos</Button>
      </div>
      {linhas === null && <p className="text-xs text-muted-foreground">Carregando…</p>}
      {linhas?.length === 0 && <p className="text-xs text-muted-foreground">Ninguém pontuou ainda. Cumpra desafios, vença duelos e receba drinks para subir 🔥</p>}
      <ol className="space-y-1.5">
        {linhas?.map((l) => (
          <li key={l.id} className="flex items-center gap-3 rounded-xl border p-2">
            <span className="w-7 text-center text-lg">{MEDALHA[l.posicao - 1] ?? <span className="text-sm text-muted-foreground">{l.posicao}º</span>}</span>
            <div className="h-9 w-9 overflow-hidden rounded-full bg-secondary">
              {l.avatar && <img src={resolveServerUrl(l.avatar)} alt="" className="h-full w-full object-cover" />}
            </div>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{l.nome}</span>
            <span className="text-sm font-bold tabular-nums text-fuchsia-500">{l.pontos} pts</span>
          </li>
        ))}
      </ol>
      <p className="text-[11px] text-muted-foreground">
        Pontos: desafio da foto 10 · desafio sugerido cumprido 10 · duelo vencido 30 (participar 5) · relâmpago 15 (cumprir 5) · drink recebido 2
      </p>
    </div>
  );
}

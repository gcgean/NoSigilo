import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import apiClient from '@/utils/apiClient';

/** Admin: quanto tempo as pessoas ficam n'A Casa, noite a noite. */
type Noite = { noite: string; pessoas: number; medianaMin: number; ate2Min: number; de2a10Min: number; de10a30Min: number; mais30Min: number; voltaram: number };

const dataCurta = (noite: string) => noite.slice(5).split('-').reverse().join('/');

export default function PermanenciaDaCasa() {
  const [noites, setNoites] = useState<Noite[] | null>(null);
  useEffect(() => {
    apiClient.get('/casa/admin/permanencia').then((r) => setNoites(r.data.noites ?? [])).catch(() => setNoites([]));
  }, []);

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <Timer className="h-5 w-5 text-fuchsia-500" />
        <p className="font-semibold">Quanto tempo ficam na Casa</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Soma as salas de cada pessoa. Trocar de sala ou cair e voltar em até 3 min conta como a mesma visita. Só existe a partir das noites em que a saída passou a ser registrada.
      </p>
      {noites === null ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : noites.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ainda sem noites medidas.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-3 font-medium">Noite</th>
                <th className="py-1 pr-3 text-right font-medium">Pessoas</th>
                <th className="py-1 pr-3 text-right font-medium">Tempo típico</th>
                <th className="py-1 pr-3 text-right font-medium">Menos de 2 min</th>
                <th className="py-1 pr-3 text-right font-medium">2 a 10 min</th>
                <th className="py-1 pr-3 text-right font-medium">10 a 30 min</th>
                <th className="py-1 pr-3 text-right font-medium">30 min ou mais</th>
                <th className="py-1 text-right font-medium">Voltaram</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {noites.map((n) => (
                <tr key={n.noite} className="border-t">
                  <td className="py-1.5 pr-3">{dataCurta(n.noite)}</td>
                  <td className="py-1.5 pr-3 text-right">{n.pessoas}</td>
                  <td className="py-1.5 pr-3 text-right font-semibold">{n.medianaMin} min</td>
                  <td className="py-1.5 pr-3 text-right">{n.ate2Min}</td>
                  <td className="py-1.5 pr-3 text-right">{n.de2a10Min}</td>
                  <td className="py-1.5 pr-3 text-right">{n.de10a30Min}</td>
                  <td className="py-1.5 pr-3 text-right">{n.mais30Min}</td>
                  <td className="py-1.5 text-right">{n.voltaram}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

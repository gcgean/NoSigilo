import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import apiClient from '@/utils/apiClient';

/** Admin: notas de 1 a 5 e sugestões que as pessoas deixam ao sair d'A Casa. */
type Avaliacoes = {
  total: number;
  media: number | null;
  porNota: Record<string, number>;
  ultimas: Array<{ nota: number; sugestao: string | null; noite: string | null; em: string; nome: string; genero: string | null }>;
};

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function AvaliacoesDaCasa() {
  const [dados, setDados] = useState<Avaliacoes | null>(null);
  const [soComTexto, setSoComTexto] = useState(true);
  useEffect(() => {
    apiClient.get('/casa/admin/avaliacoes').then((r) => setDados(r.data)).catch(() => setDados({ total: 0, media: null, porNota: {}, ultimas: [] }));
  }, []);

  const lista = (dados?.ultimas ?? []).filter((a) => !soComTexto || a.sugestao);
  const maior = Math.max(1, ...Object.values(dados?.porNota ?? {}));

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <Star className="h-5 w-5 text-amber-500" />
        <p className="font-semibold">Avaliação d'A Casa</p>
      </div>
      <p className="text-xs text-muted-foreground">Nota de 1 a 5 pedida ao sair da sala, uma vez por pessoa (só para quem nunca avaliou).</p>
      {dados === null ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : dados.total === 0 ? (
        <p className="text-sm text-muted-foreground">Ainda ninguém avaliou. A pergunta aparece a partir da próxima noite.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <p className="text-3xl font-bold">{dados.media?.toLocaleString('pt-BR')} <span className="text-base font-medium text-muted-foreground">/ 5</span></p>
              <p className="text-xs text-muted-foreground">{dados.total} avaliação(ões)</p>
            </div>
            <div className="min-w-[180px] flex-1 space-y-1">
              {[5, 4, 3, 2, 1].map((n) => (
                <div key={n} className="flex items-center gap-2 text-xs">
                  <span className="w-8 text-right">{n} 🔥</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-rose-500" style={{ width: `${((dados.porNota[String(n)] ?? 0) / maior) * 100}%` }} />
                  </span>
                  <span className="w-6 text-muted-foreground">{dados.porNota[String(n)] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={soComTexto} onChange={(e) => setSoComTexto(e.target.checked)} /> Só as que têm sugestão escrita
          </label>
          <ul className="max-h-96 space-y-2 overflow-y-auto">
            {lista.map((a, i) => (
              <li key={`${a.em}-${i}`} className="rounded-xl border p-3 text-sm">
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate"><b className="text-foreground">{a.nome}</b>{a.genero ? ` · ${a.genero}` : ''}</span>
                  <span className="shrink-0">{'🔥'.repeat(a.nota)} · {quando(a.em)}</span>
                </div>
                {a.sugestao && <p className="mt-1 whitespace-pre-wrap break-words">{a.sugestao}</p>}
              </li>
            ))}
            {lista.length === 0 && <li className="text-sm text-muted-foreground">Nenhuma com sugestão escrita ainda.</li>}
          </ul>
        </>
      )}
    </div>
  );
}

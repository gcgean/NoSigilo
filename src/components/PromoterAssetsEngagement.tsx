import { useEffect, useState } from 'react';
import { promoterService } from '@/services/api';

export default function PromoterAssetsEngagement() {
  const [data, setData] = useState<Awaited<ReturnType<typeof promoterService.assetsEngagement>>>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    promoterService.assetsEngagement().then((result) => {
      if (active) setData(result);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);

  return <section className="glass space-y-3 rounded-2xl p-4">
    <h2 className="font-semibold">Acessos à central de divulgação</h2>
    <p className="text-sm text-muted-foreground">Cada promotor conta uma vez por dia. Os dados começam a partir da ativação da medição.</p>
    {error && <p role="alert" className="text-sm">Não foi possível carregar as métricas.</p>}
    {!error && !data && <p role="status" className="text-sm">Carregando métricas…</p>}
    {data && <>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Promotores ativos', data.ativos],
          ['Acessaram em 30 dias', data.unicos],
          ['Acessaram em 7 dias', data.ultimos7],
          ['Voltaram em outro dia (30 dias)', data.retornaram],
        ].map(([label, value]) => <div key={label} className="rounded-xl border p-3"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="text-xl font-bold">{value}</dd></div>)}
      </dl>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Acessos por data</summary>
        {data.porDia.length ? <table className="mt-2 w-full text-left"><thead><tr><th scope="col">Data</th><th scope="col">Promotores</th></tr></thead><tbody>
          {data.porDia.map(({ dia, total }) => <tr key={dia} className="border-t"><td className="py-2">{dia.split('-').reverse().join('/')}</td><td>{total}</td></tr>)}
        </tbody></table> : <p className="mt-2 text-muted-foreground">Ainda não há acessos registrados.</p>}
      </details>
    </>}
  </section>;
}

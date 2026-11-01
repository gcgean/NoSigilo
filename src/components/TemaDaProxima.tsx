/** Tema da próxima noite de festa, embaixo da contagem regressiva d'A Casa. */
export default function TemaDaProxima({ tema }: { tema: { nome: string; descricao: string; dress: string | null } }) {
  return (
    <div className="mt-4 rounded-2xl bg-black/30 px-4 py-3 ring-1 ring-fuchsia-400/30">
      <p className="text-[11px] font-bold uppercase tracking-wide text-fuchsia-300">Tema da próxima festa</p>
      <p className="mt-0.5 text-lg font-black">{tema.nome}</p>
      <p className="text-sm text-white/75">{tema.descricao}</p>
      {tema.dress && <p className="mt-1 text-xs font-semibold text-amber-200">👗 Dress code: {tema.dress}</p>}
    </div>
  );
}

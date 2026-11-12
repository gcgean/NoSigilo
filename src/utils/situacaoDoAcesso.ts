// Situação do acesso Premium em linguagem de gente: até quando vale, de onde
// vem (assinatura paga ou dias grátis) e se a assinatura já venceu. Usado no
// topo da página de Planos, que antes só mostrava a data para quem estava com
// a assinatura paga em dia (11/11/2026: casal com 9 dias grátis não sabia até
// quando podia usar nem que a assinatura tinha vencido).

export type SituacaoDoAcesso = {
  /** 'pago' = assinatura em dia; 'gratis' = dias ganhos/período grátis; 'vencido' = sem acesso. */
  tipo: 'pago' | 'gratis' | 'vencido';
  /** Fim do acesso que está valendo agora (o mais distante). */
  ate: Date | null;
  dias: number;
  /** Quando a assinatura paga venceu, se venceu. */
  assinaturaVencidaEm: Date | null;
};

const data = (v?: string | null) => {
  const t = v ? new Date(v).getTime() : NaN;
  return Number.isFinite(t) ? new Date(t) : null;
};

// Acima disso é acesso "sem prazo" (mulher verificada, embaixador: 2099).
const SEM_PRAZO_MS = 3650 * 24 * 60 * 60 * 1000;

export function situacaoDoAcesso(
  user: { isPremium?: boolean | null; trialEndsAt?: string | null; hubLicenseEndAt?: string | null } | null | undefined,
  agora = Date.now(),
): SituacaoDoAcesso | null {
  if (!user) return null;
  const licenca = data(user.hubLicenseEndAt);
  const gratis = data(user.trialEndsAt);
  const pagoEmDia = !!licenca && licenca.getTime() > agora;
  const gratisValendo = !!gratis && gratis.getTime() > agora;
  const assinaturaVencidaEm = licenca && !pagoEmDia ? licenca : null;
  const diasAte = (d: Date) => Math.max(0, Math.ceil((d.getTime() - agora) / 86_400_000));

  if (pagoEmDia || gratisValendo) {
    // Vale o que termina por último.
    const ate = [pagoEmDia ? licenca : null, gratisValendo ? gratis : null]
      .filter((d): d is Date => !!d)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    if (ate.getTime() - agora > SEM_PRAZO_MS) return null;
    const tipo = pagoEmDia && licenca!.getTime() >= ate.getTime() ? 'pago' : 'gratis';
    return { tipo, ate, dias: diasAte(ate), assinaturaVencidaEm };
  }
  if (!licenca && !gratis) return null;
  const ultimo = [licenca, gratis].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];
  return { tipo: 'vencido', ate: ultimo, dias: 0, assinaturaVencidaEm };
}

export const dataCurta = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

-- 086: uma comissao por assinante POR MES, nao uma para sempre.
--
-- O que estava errado: ensurePromoterCommission() so olhava
-- subscriber_user_id, sem periodo. A primeira assinatura gerava comissao e
-- toda renovacao depois era descartada em silencio — enquanto a pagina do
-- promotor prometia "20% via Pix todo mes" e "comissao recorrente enquanto o
-- assinante mantiver o plano". O codigo ja foi corrigido; este indice existe
-- para a regra nao depender so dele.
--
-- Por que UNIQUE e nao so um indice: dois webhooks do mesmo pagamento
-- chegando juntos passariam os dois pelo SELECT antes de qualquer INSERT. O
-- banco e o unico lugar que resolve isso sem transacao explicita.
--
-- Efeito colateral aceito de proposito: assinante que paga DUAS vezes no mesmo
-- mes (troca de plano, cobranca avulsa) gera uma comissao so. Pagar a menos
-- num caso raro e melhor do que pagar em dobro por corrida de webhook, e o que
-- foi prometido ao promotor e "R$ 1,98 todo mes".
--
-- Linhas antigas com period NULL nao conflitam: no Postgres, NULL nunca e
-- igual a NULL para efeito de UNIQUE.

CREATE UNIQUE INDEX IF NOT EXISTS uq_promoter_commissions_assinante_periodo
  ON promoter_commissions (subscriber_user_id, period);

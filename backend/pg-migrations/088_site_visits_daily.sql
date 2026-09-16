-- 087: resumo diario de visitas, para poder descartar o detalhe antigo.
--
-- site_visits tinha 1,36 milhao de linhas e 1,2 GB em 15/09/2026 — 53% do
-- banco — crescendo ~27 mil linhas/dia. O detalhe visita a visita so serve
-- para os ultimos dias; o historico longo so e usado como contagem por dia.
--
-- Este resumo guarda o que os graficos do admin mostram, por dia e pelas
-- dimensoes que eles usam. O que se perde ao descartar o cru e o detalhe
-- individual (pagina exata, referencia, IP) de mais de 90 dias.
--
-- "unicos" e uma contagem ja resolvida no momento da agregacao: nao da para
-- somar linhas depois e chegar ao mesmo numero (a mesma pessoa aparece em
-- varias combinacoes). Por isso cada dia tambem tem uma linha com
-- origin_type/device_type/country = '' , que e o total do dia inteiro.
CREATE TABLE IF NOT EXISTS site_visits_daily (
  dia          TEXT NOT NULL,          -- YYYY-MM-DD
  origin_type  TEXT NOT NULL DEFAULT '',
  device_type  TEXT NOT NULL DEFAULT '',
  country      TEXT NOT NULL DEFAULT '',
  visitas      BIGINT NOT NULL DEFAULT 0,
  unicos       BIGINT NOT NULL DEFAULT 0,
  logados      BIGINT NOT NULL DEFAULT 0,
  atualizado_em TEXT NOT NULL,
  PRIMARY KEY (dia, origin_type, device_type, country)
);

CREATE INDEX IF NOT EXISTS idx_site_visits_daily_dia ON site_visits_daily (dia DESC);

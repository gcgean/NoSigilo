-- Eventos in-page para o funil da landing (página de vendas): além do page view
-- (site_visits), registra clique em CTA e entrada/saída de cada seção, para medir
-- conversão (visitou → clicou cadastrar → cadastrou) e onde as pessoas abandonam.
CREATE TABLE IF NOT EXISTS site_events (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  page_path TEXT,
  section TEXT,
  label TEXT,
  dwell_ms INTEGER,
  referrer_domain TEXT,
  origin_type TEXT,
  utm_source TEXT,
  device_type TEXT,
  country TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_site_events_type_created ON site_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_events_session ON site_events(session_id);
CREATE INDEX IF NOT EXISTS idx_site_events_origin ON site_events(origin_type);

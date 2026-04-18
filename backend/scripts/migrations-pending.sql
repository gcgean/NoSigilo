-- =============================================================
-- MIGRAÇÕES PENDENTES — NoSigilo
-- Gerado em: 2025
-- =============================================================
-- Execute este arquivo no servidor de produção ANTES de
-- reiniciar o backend.
--
-- IMPORTANTE: O backend aplica automaticamente via _migrations.
-- Este script é um backup manual caso precise rodar via CLI:
--   sqlite3 data/nosigilo.sqlite < scripts/migrations-pending.sql
-- =============================================================

-- Garante tabela de controle de migrações
CREATE TABLE IF NOT EXISTS _migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

-- ─── 021_reports.sql ────────────────────────────────────────
INSERT OR IGNORE INTO _migrations VALUES ('021_reports.sql', datetime('now'));
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_user_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_name TEXT,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (reporter_user_id) REFERENCES users(id)
);

-- ─── 022_user_ban.sql ───────────────────────────────────────
INSERT OR IGNORE INTO _migrations VALUES ('022_user_ban.sql', datetime('now'));
ALTER TABLE users ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN banned_at TEXT;
ALTER TABLE users ADD COLUMN banned_by TEXT;

-- ─── 023_deactivate_profile.sql ─────────────────────────────
INSERT OR IGNORE INTO _migrations VALUES ('023_deactivate_profile.sql', datetime('now'));
ALTER TABLE users ADD COLUMN is_deactivated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN deactivated_at TEXT;

-- ─── 024_post_reels_only.sql ────────────────────────────────
INSERT OR IGNORE INTO _migrations VALUES ('024_post_reels_only.sql', datetime('now'));
ALTER TABLE posts ADD COLUMN is_reels_only INTEGER NOT NULL DEFAULT 0;

-- ─── 026_media_source.sql ───────────────────────────────────
INSERT OR IGNORE INTO _migrations VALUES ('026_media_source.sql', datetime('now'));
ALTER TABLE media ADD COLUMN source TEXT NOT NULL DEFAULT 'post';

-- ─── 027_message_delete.sql ─────────────────────────────────
INSERT OR IGNORE INTO _migrations VALUES ('027_message_delete.sql', datetime('now'));
ALTER TABLE messages ADD COLUMN deleted_for_all INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN deleted_by_ids TEXT NOT NULL DEFAULT '[]';

-- =============================================================
-- FIM DAS MIGRAÇÕES
-- =============================================================

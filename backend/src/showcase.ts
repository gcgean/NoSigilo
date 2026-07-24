import { randomUUID } from 'node:crypto';
import type { DbHandle } from './db.js';

// Revezamento dos perfis de vitrine: mantém stories sempre ativos (recria a
// partir da mídia do perfil) e resurge 1 post por perfil (bump created_at), pra
// deixar o feed/stories vivos e gerar o "efeito manada".
// Usado tanto pelo scheduler (horários de pico) quanto pelo botão do admin.
export async function runShowcaseRotation(db: DbHandle): Promise<{ profiles: number; storiesCreated: number; postsBumped: number }> {
  const now = new Date();
  const nowStr = now.toISOString();
  const expiresStr = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const showcase = (await db.queryAll('SELECT id FROM users WHERE COALESCE(is_showcase, 0) = 1')) as any[];
  if (!Array.isArray(showcase) || showcase.length === 0) {
    return { profiles: 0, storiesCreated: 0, postsBumped: 0 };
  }

  const STORY_TARGET = 3;
  let storiesCreated = 0;
  let postsBumped = 0;

  for (const u of showcase) {
    const uid = String(u.id);
    // 1) Mantém stories ativos: se tem menos que o alvo, cria a partir da mídia
    //    pública do perfil que ainda não está num story ativo (revezando).
    const activeRow = (await db.queryOne('SELECT COUNT(*) AS c FROM stories WHERE user_id = ? AND expires_at > ?', [uid, nowStr])) as any;
    const need = STORY_TARGET - Number(activeRow?.c || 0);
    if (need > 0) {
      const media = (await db.queryAll(
        `SELECT m.id FROM media m
         WHERE m.user_id = ? AND m.is_private = 0
           AND (m.mime_type LIKE 'image/%' OR m.mime_type LIKE 'video/%')
           AND NOT EXISTS (SELECT 1 FROM stories s WHERE s.media_id = m.id AND s.expires_at > ?)
         ORDER BY (SELECT MAX(s2.created_at) FROM stories s2 WHERE s2.media_id = m.id) ASC NULLS FIRST, m.created_at ASC
         LIMIT ?`,
        [uid, nowStr, need]
      )) as any[];
      for (const m of media) {
        await db.run('INSERT INTO stories (id, user_id, media_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)', [randomUUID(), uid, String(m.id), nowStr, expiresStr]);
        storiesCreated++;
      }
    }
    // 2) Resurge o post mais antigo do perfil (bump da data) — revezando a cada rodada.
    const post = (await db.queryOne('SELECT id FROM posts WHERE user_id = ? ORDER BY created_at ASC LIMIT 1', [uid])) as any;
    if (post) {
      await db.run('UPDATE posts SET created_at = ? WHERE id = ?', [nowStr, String(post.id)]);
      postsBumped++;
    }
  }
  await db.persist();
  console.log(`[showcase] Revezamento: +${storiesCreated} stories, ${postsBumped} posts resurgidos (${showcase.length} perfis)`);
  return { profiles: showcase.length, storiesCreated, postsBumped };
}

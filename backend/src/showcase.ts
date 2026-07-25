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

// Semeia SINAL DE INTERESSE para homens recém-cadastrados que ainda não
// receberam nenhum sinal de mulher/casal. Os dados mostram que homem que recebe
// ao menos 1 sinal converte ~5x mais (17,5% vs 3,4%), e 2/3 nunca recebem nada —
// então perfis de vitrine (mulher/casal) VISITAM e CURTEM esses homens, gerando
// a notificação real "você recebeu um match" que puxa ele de volta e alimenta a
// isca do paywall ("X te querem"). Idempotente: só age em quem tem ZERO sinal,
// então cada homem é semeado uma única vez.
export async function seedInterestForNewMen(
  db: DbHandle,
  opts: { windowHours?: number; maxMen?: number } = {}
): Promise<{ seeded: number; visits: number; likes: number }> {
  const windowHours = opts.windowHours ?? 72;
  const maxMen = opts.maxMen ?? 300;
  const now = new Date();
  const nowStr = now.toISOString();
  const sinceStr = new Date(now.getTime() - windowHours * 60 * 60 * 1000).toISOString();

  // Fonte crível do sinal para um homem: perfis de vitrine mulher/casal.
  const showcase = (await db.queryAll(
    `SELECT id, name FROM users
      WHERE COALESCE(is_showcase, 0) = 1
        AND (LOWER(COALESCE(gender,'')) LIKE 'mulher%' OR LOWER(COALESCE(gender,'')) LIKE 'casal%')`
  )) as any[];
  if (!Array.isArray(showcase) || showcase.length === 0) {
    return { seeded: 0, visits: 0, likes: 0 };
  }

  // Homens novos (janela) SEM nenhum sinal de mulher/casal (visita OU like).
  const men = (await db.queryAll(
    `SELECT u.id FROM users u
      WHERE LOWER(COALESCE(u.gender,'')) LIKE 'homem%'
        AND u.created_at >= ?
        AND (u.is_banned = 0 OR u.is_banned IS NULL)
        AND (u.is_deactivated = 0 OR u.is_deactivated IS NULL)
        AND NOT EXISTS (
          SELECT 1 FROM likes l JOIN users lu ON lu.id = l.user_id
           WHERE l.target_type = 'user' AND l.target_id = u.id
             AND (LOWER(COALESCE(lu.gender,'')) LIKE 'mulher%' OR LOWER(COALESCE(lu.gender,'')) LIKE 'casal%'))
        AND NOT EXISTS (
          SELECT 1 FROM profile_visits pv JOIN users vu ON vu.id = pv.visitor_user_id
           WHERE pv.visited_user_id = u.id
             AND (LOWER(COALESCE(vu.gender,'')) LIKE 'mulher%' OR LOWER(COALESCE(vu.gender,'')) LIKE 'casal%'))
      ORDER BY u.created_at DESC
      LIMIT ?`,
    [sinceStr, maxMen]
  )) as any[];
  if (!Array.isArray(men) || men.length === 0) {
    return { seeded: 0, visits: 0, likes: 0 };
  }

  const pick = () => showcase[Math.floor(Math.random() * showcase.length)];
  let visits = 0;
  let likes = 0;

  for (const m of men) {
    const manId = String(m.id);
    // 1 a 2 perfis de vitrine distintos demonstram interesse (visita + like).
    const primary = pick();
    const chosen = [primary];
    if (showcase.length > 1 && Math.random() < 0.45) {
      let second = pick();
      let tries = 0;
      while (second.id === primary.id && tries < 4) { second = pick(); tries++; }
      if (second.id !== primary.id) chosen.push(second);
    }

    for (let i = 0; i < chosen.length; i++) {
      const sc = chosen[i];
      const scId = String(sc.id);
      const actorName = sc?.name ? String(sc.name) : 'Alguém';
      // Visita (sinal silencioso, alimenta o contador).
      await db.run(
        'INSERT INTO profile_visits (id, visitor_user_id, visited_user_id, created_at) VALUES (?, ?, ?, ?)',
        [randomUUID(), scId, manId, nowStr]
      );
      visits++;
      // O primeiro também CURTE → gera a notificação real de match (gancho de volta).
      if (i === 0) {
        await db.run(
          'INSERT INTO likes (id, user_id, target_type, target_id, created_at) VALUES (?, ?, ?, ?, ?)',
          [randomUUID(), scId, 'user', manId, nowStr]
        );
        likes++;
        await db.run(
          `INSERT INTO notifications (id, user_id, type, title, description, data_json, is_read, created_at)
           VALUES (?, ?, 'profile.liked', ?, ?, ?, 0, ?)`,
          [randomUUID(), manId, 'Você recebeu um match', `${actorName} deu match com você.`, JSON.stringify({ actorId: scId, actorName }), nowStr]
        );
      }
    }
  }

  await db.persist();
  console.log(`[showcase] Sinal semeado p/ homens novos: ${men.length} homens, +${visits} visitas, +${likes} likes (${showcase.length} perfis vitrine)`);
  return { seeded: men.length, visits, likes };
}

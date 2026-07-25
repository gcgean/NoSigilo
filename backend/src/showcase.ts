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

// Mensagens de abertura da vitrine (voz feminina/casal, provocante sem explícito).
const OPENING_LINES = [
  'Oi 😏 gostei do seu perfil… você faz meu tipo.',
  'Vi que você é novo por aqui 👀 me chamou atenção.',
  'Oii, tudo bem? Achei você bem interessante 🔥',
  'Confesso que fiquei curiosa com o seu perfil 😌',
  'Você por aqui… que sorte a minha 😈',
  'Bateu uma vontade de te conhecer melhor 🔥',
];

// Perfis de vitrine mulher/casal — a fonte crível do sinal para um homem.
async function showcaseSourcesForMen(db: DbHandle): Promise<any[]> {
  const rows = (await db.queryAll(
    `SELECT id, name FROM users
      WHERE COALESCE(is_showcase, 0) = 1
        AND (LOWER(COALESCE(gender,'')) LIKE 'mulher%' OR LOWER(COALESCE(gender,'')) LIKE 'casal%')`
  )) as any[];
  return Array.isArray(rows) ? rows : [];
}

// Aplica os sinais de interesse (visita + like + notificação de match e,
// opcionalmente, uma DM de abertura) de 1–2 perfis de vitrine para UM homem.
async function applyInterestSignals(
  db: DbHandle,
  manId: string,
  showcase: any[],
  nowStr: string,
  withMessage: boolean
): Promise<{ visits: number; likes: number; messaged: number }> {
  const pick = () => showcase[Math.floor(Math.random() * showcase.length)];
  let visits = 0;
  let likes = 0;
  let messaged = 0;

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
    if (i === 0) {
      // Curte → notificação real de match (gancho de volta).
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
      // Abre conversa com uma DM — ele vê "1 mensagem não lida" (travada p/ não
      // premium: ver mensagem recebida é premium). É o gancho mais forte.
      if (withMessage) {
        const pair = [manId, scId].sort((a, b) => a.localeCompare(b));
        let convId: string;
        const existing = (await db.queryOne('SELECT id FROM conversations WHERE user_a_id = ? AND user_b_id = ?', [pair[0], pair[1]])) as any;
        if (existing?.id) {
          convId = String(existing.id);
        } else {
          convId = randomUUID();
          await db.run('INSERT INTO conversations (id, user_a_id, user_b_id, created_at) VALUES (?, ?, ?, ?)', [convId, pair[0], pair[1], nowStr]);
        }
        const line = OPENING_LINES[Math.floor(Math.random() * OPENING_LINES.length)];
        await db.run(
          'INSERT INTO messages (id, conversation_id, sender_id, content, media_id, is_view_once, is_delivered, created_at) VALUES (?, ?, ?, ?, NULL, 0, 1, ?)',
          [randomUUID(), convId, scId, line, nowStr]
        );
        messaged++;
      }
    }
  }
  return { visits, likes, messaged };
}

// Semeia SINAL DE INTERESSE para UM homem recém-cadastrado — chamado no momento
// do cadastro, para a vitrine "se comunicar" com ele na hora e não deixar ele
// sair sem assinar. No-op se o perfil não for homem ou não houver vitrine.
export async function seedInterestForNewUser(
  db: DbHandle,
  userId: string
): Promise<{ seeded: boolean; visits: number; likes: number; messaged: number }> {
  const u = (await db.queryOne('SELECT id, gender FROM users WHERE id = ? LIMIT 1', [userId])) as any;
  if (!u || !String(u.gender || '').toLowerCase().startsWith('homem')) {
    return { seeded: false, visits: 0, likes: 0, messaged: 0 };
  }
  const showcase = await showcaseSourcesForMen(db);
  if (showcase.length === 0) return { seeded: false, visits: 0, likes: 0, messaged: 0 };

  const r = await applyInterestSignals(db, String(u.id), showcase, new Date().toISOString(), true);
  await db.persist();
  console.log(`[showcase] Sinal semeado no cadastro do homem ${userId}: +${r.visits} visitas, +${r.likes} likes, +${r.messaged} DMs`);
  return { seeded: true, ...r };
}

// Semeia SINAL DE INTERESSE para homens recém-cadastrados que ainda não
// receberam nenhum sinal de mulher/casal (rede de segurança do scheduler, caso
// o seeding no cadastro tenha falhado ou não havia vitrine na hora). Os dados
// mostram que homem que recebe ao menos 1 sinal converte ~5x mais (17,5% vs
// 3,4%) e 2/3 nunca recebem nada. Idempotente: só age em quem tem ZERO sinal.
export async function seedInterestForNewMen(
  db: DbHandle,
  opts: { windowHours?: number; maxMen?: number } = {}
): Promise<{ seeded: number; visits: number; likes: number }> {
  const windowHours = opts.windowHours ?? 72;
  const maxMen = opts.maxMen ?? 300;
  const nowStr = new Date().toISOString();
  const sinceStr = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

  const showcase = await showcaseSourcesForMen(db);
  if (showcase.length === 0) return { seeded: 0, visits: 0, likes: 0 };

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

  let visits = 0;
  let likes = 0;
  for (const m of men) {
    const r = await applyInterestSignals(db, String(m.id), showcase, nowStr, true);
    visits += r.visits;
    likes += r.likes;
  }

  await db.persist();
  console.log(`[showcase] Sinal semeado p/ homens novos: ${men.length} homens, +${visits} visitas, +${likes} likes (${showcase.length} perfis vitrine)`);
  return { seeded: men.length, visits, likes };
}

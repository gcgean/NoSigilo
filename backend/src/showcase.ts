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

  let dupsRemoved = 0;

  for (const u of showcase) {
    const uid = String(u.id);
    // 0) Limpa duplicatas: mantém apenas 1 story ATIVO por mídia (remove repetidos
    //    do mesmo story que possam ter surgido por corrida/reinício). Sem isso o
    //    ring da vitrine mostra a mesma foto várias vezes.
    const activeStories = (await db.queryAll(
      'SELECT id, media_id FROM stories WHERE user_id = ? AND expires_at > ? AND media_id IS NOT NULL ORDER BY created_at DESC',
      [uid, nowStr]
    )) as any[];
    const seenMedia = new Set<string>();
    for (const s of activeStories) {
      const mid = String(s.media_id);
      if (seenMedia.has(mid)) {
        await db.run('DELETE FROM stories WHERE id = ?', [String(s.id)]);
        dupsRemoved++;
      } else {
        seenMedia.add(mid);
      }
    }
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
  console.log(`[showcase] Revezamento: +${storiesCreated} stories, ${postsBumped} posts resurgidos, ${dupsRemoved} stories duplicados removidos (${showcase.length} perfis)`);
  return { profiles: showcase.length, storiesCreated, postsBumped };
}

// Mensagens de abertura da vitrine, por combinação (quem envia → quem recebe).
// Tom quente (plataforma adulta), sem passar de convite explícito.
const COUPLE_TO_MAN = [
  'Oi, gostei do seu perfil, é do tipo que estou procurando pra uma brincadeira gostosa com a minha esposa 🔥',
  'Olá, gostei do seu perfil… curte uma brincadeira em off com a minha esposa e eu assistindo? 😈',
  'Olá, gostei do perfil, curte fazer uma DP na minha esposa comigo? 🥵',
  'Olá, gostei do perfil… curte comer a minha esposa comigo junto? 😏',
  'Olá, gostei do seu perfil, toparia um ménage gostoso com a gente? 🔥',
];
const WOMAN_TO_MAN = [
  'Oi 😏 gostei muito do seu perfil… tô doida por um homem de verdade pra brincar hoje 🔥',
  'Olá gato, seu perfil me deixou com vontade 🥵 curte um encontro bem discreto?',
  'Oi… adorei o que vi 😈 tô precisando de alguém pra me satisfazer, topa?',
  'Gostei demais de você 🔥 topa me conhecer sem compromisso e no sigilo? 😏',
  'Oi 😏 seu perfil me deixou curiosa (e safada)… vem me conhecer?',
];
const MAN_TO_WOMAN = [
  'Oi gata 😏 gostei muito do seu perfil… topa um encontro bem discreto e gostoso comigo?',
  'Olá linda 🔥 adorei você… curte um homem que sabe te dar prazer no sigilo?',
  'Oi 😈 seu perfil me deixou louco… vamos marcar algo bem safado só nós dois?',
  'Gostei demais de você 🥵 me deixa te satisfazer do jeitinho que você merece?',
  'Oi 😏 tô muito a fim de te conhecer… topa uma aventura gostosa comigo?',
];
const COUPLE_TO_COUPLE = [
  'Gostei de vocês 🔥 bem que poderíamos marcar uma brincadeira gostosa, topam?',
  'Gostamos do casal 😏 vamos conversar melhor?',
  'Estamos a fim de um casal pra brincar com a gente no mesmo ambiente… topam? 🥵',
  'Queremos um casal pra uma brincadeira hoje, que tal? 🔥',
  'Queremos vocês 😈 topam aprontar com a gente hoje?',
  'Estamos muito a fim de aprontar hoje… vamos? 🔥',
];

// Normaliza o gênero para um dos três tokens principais.
function genderToken(g: unknown): 'homem' | 'mulher' | 'casal' | '' {
  const l = String(g || '').toLowerCase();
  if (l.startsWith('homem')) return 'homem';
  if (l.startsWith('mulher')) return 'mulher';
  if (l.startsWith('casal')) return 'casal';
  return '';
}

// Quem pode enviar sinal para um destinatário deste gênero (perfis que ele
// tipicamente curte). Trans/CD/etc. ('') ficam de fora por ora.
function allowedSenderTokens(recipient: 'homem' | 'mulher' | 'casal' | ''): Array<'homem' | 'mulher' | 'casal'> {
  if (recipient === 'homem') return ['mulher', 'casal'];
  if (recipient === 'mulher') return ['homem'];
  if (recipient === 'casal') return ['casal'];
  return [];
}

// O destinatário "curte" o gênero de quem envia? (looking_for_json). Sem
// preferência declarada = curte todos.
function recipientLikesGender(lookingForJson: unknown, senderToken: string): boolean {
  let arr: string[] = [];
  try { arr = JSON.parse(String(lookingForJson || '[]')); } catch { /* ignore */ }
  if (!Array.isArray(arr) || arr.length === 0) return true;
  return arr.some((p) => {
    const l = String(p || '').toLowerCase().trim();
    if (senderToken === 'homem') return l.startsWith('hom') || l === 'man' || l === 'male';
    if (senderToken === 'mulher') return l.startsWith('mul') || l === 'woman' || l === 'female';
    if (senderToken === 'casal') return l.startsWith('cas') || l === 'couple';
    return false;
  });
}

// Frase de abertura conforme (quem envia → quem recebe).
function openingLine(senderToken: string, recipientToken: string): string {
  let lines: string[] = MAN_TO_WOMAN;
  if (recipientToken === 'homem') lines = senderToken === 'casal' ? COUPLE_TO_MAN : WOMAN_TO_MAN;
  else if (recipientToken === 'mulher') lines = MAN_TO_WOMAN;
  else if (recipientToken === 'casal') lines = COUPLE_TO_COUPLE;
  return lines[Math.floor(Math.random() * lines.length)];
}

// Todos os perfis de vitrine (id, nome, gênero) — filtrados por compatibilidade
// depois, por destinatário.
async function allShowcaseProfiles(db: DbHandle): Promise<any[]> {
  const rows = (await db.queryAll(
    `SELECT id, name, gender FROM users
      WHERE COALESCE(is_showcase, 0) = 1
        AND (LOWER(COALESCE(gender,'')) LIKE 'homem%'
          OR LOWER(COALESCE(gender,'')) LIKE 'mulher%'
          OR LOWER(COALESCE(gender,'')) LIKE 'casal%')`
  )) as any[];
  return Array.isArray(rows) ? rows : [];
}

// Perfis de vitrine compatíveis para ENVIAR sinal a um destinatário: o gênero de
// quem envia precisa estar entre os que o destinatário curte E existir uma
// combinação de mensagem válida (quem envia → quem recebe).
function compatibleSenders(recipientToken: 'homem' | 'mulher' | 'casal' | '', lookingForJson: unknown, showcase: any[]): any[] {
  const allowed = new Set(allowedSenderTokens(recipientToken));
  if (allowed.size === 0) return [];
  return showcase.filter((sc) => {
    const st = genderToken(sc.gender);
    return st !== '' && allowed.has(st) && recipientLikesGender(lookingForJson, st);
  });
}

// Aplica os sinais de interesse (visita + like + notificação de match e,
// opcionalmente, uma DM de abertura) de 1–2 perfis de vitrine para UM usuário.
async function applyInterestSignals(
  db: DbHandle,
  recipientId: string,
  recipientToken: string,
  senders: any[],
  nowStr: string,
  withMessage: boolean
): Promise<{ visits: number; likes: number; messaged: number }> {
  const pick = () => senders[Math.floor(Math.random() * senders.length)];
  let visits = 0;
  let likes = 0;
  let messaged = 0;

  const primary = pick();
  const chosen = [primary];
  if (senders.length > 1 && Math.random() < 0.45) {
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
      [randomUUID(), scId, recipientId, nowStr]
    );
    visits++;
    if (i === 0) {
      // Curte → notificação real de match (gancho de volta).
      await db.run(
        'INSERT INTO likes (id, user_id, target_type, target_id, created_at) VALUES (?, ?, ?, ?, ?)',
        [randomUUID(), scId, 'user', recipientId, nowStr]
      );
      likes++;
      await db.run(
        `INSERT INTO notifications (id, user_id, type, title, description, data_json, is_read, created_at)
         VALUES (?, ?, 'profile.liked', ?, ?, ?, 0, ?)`,
        [randomUUID(), recipientId, 'Você recebeu um match', `${actorName} deu match com você.`, JSON.stringify({ actorId: scId, actorName }), nowStr]
      );
      // Abre conversa com uma DM — ele vê "1 mensagem não lida" (travada p/ não
      // premium: ver mensagem recebida é premium). É o gancho mais forte.
      if (withMessage) {
        const pair = [recipientId, scId].sort((a, b) => a.localeCompare(b));
        let convId: string;
        const existing = (await db.queryOne('SELECT id FROM conversations WHERE user_a_id = ? AND user_b_id = ?', [pair[0], pair[1]])) as any;
        if (existing?.id) {
          convId = String(existing.id);
        } else {
          convId = randomUUID();
          await db.run('INSERT INTO conversations (id, user_a_id, user_b_id, created_at) VALUES (?, ?, ?, ?)', [convId, pair[0], pair[1], nowStr]);
        }
        const line = openingLine(genderToken(sc.gender), recipientToken);
        // is_view_once/is_delivered são BOOLEAN no Postgres — não passamos inteiros
        // aqui; deixamos os defaults (FALSE/TRUE). is_read fica 0 (não lida).
        await db.run(
          'INSERT INTO messages (id, conversation_id, sender_id, content, media_id, created_at) VALUES (?, ?, ?, ?, NULL, ?)',
          [randomUUID(), convId, scId, line, nowStr]
        );
        messaged++;
      }
    }
  }
  return { visits, likes, messaged };
}

// Semeia SINAL DE INTERESSE para UM usuário recém-cadastrado (homem, mulher ou
// casal) — chamado no momento do cadastro, para a vitrine "se comunicar" com ele
// na hora e não deixar sair sem assinar. Só envia de perfis COMPATÍVEIS (que ele
// curta). No-op se o perfil for de tipo não suportado ou não houver vitrine.
export async function seedInterestForNewUser(
  db: DbHandle,
  userId: string
): Promise<{ seeded: boolean; visits: number; likes: number; messaged: number }> {
  const u = (await db.queryOne('SELECT id, gender, looking_for_json FROM users WHERE id = ? LIMIT 1', [userId])) as any;
  const recipientToken = genderToken(u?.gender);
  if (!u || recipientToken === '') return { seeded: false, visits: 0, likes: 0, messaged: 0 };

  const showcase = await allShowcaseProfiles(db);
  const senders = compatibleSenders(recipientToken, u.looking_for_json, showcase);
  if (senders.length === 0) return { seeded: false, visits: 0, likes: 0, messaged: 0 };

  const r = await applyInterestSignals(db, String(u.id), recipientToken, senders, new Date().toISOString(), true);
  await db.persist();
  console.log(`[showcase] Sinal semeado no cadastro (${recipientToken}) ${userId}: +${r.visits} visitas, +${r.likes} likes, +${r.messaged} DMs`);
  return { seeded: true, ...r };
}

// Rede de segurança do scheduler: semeia sinal para usuários novos (homem,
// mulher ou casal) que ainda NÃO receberam nenhum like de um perfil de vitrine
// (idempotente — quem já foi semeado tem esse like e é pulado). Cada um recebe
// apenas de perfis compatíveis que curta.
export async function seedInterestForNewUsers(
  db: DbHandle,
  opts: { windowHours?: number; maxUsers?: number } = {}
): Promise<{ seeded: number; visits: number; likes: number }> {
  const windowHours = opts.windowHours ?? 72;
  const maxUsers = opts.maxUsers ?? 400;
  const nowStr = new Date().toISOString();
  const sinceStr = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

  const showcase = await allShowcaseProfiles(db);
  if (showcase.length === 0) return { seeded: 0, visits: 0, likes: 0 };

  const candidates = (await db.queryAll(
    `SELECT u.id, u.gender, u.looking_for_json FROM users u
      WHERE (LOWER(COALESCE(u.gender,'')) LIKE 'homem%'
          OR LOWER(COALESCE(u.gender,'')) LIKE 'mulher%'
          OR LOWER(COALESCE(u.gender,'')) LIKE 'casal%')
        AND u.created_at >= ?
        AND (u.is_banned = 0 OR u.is_banned IS NULL)
        AND (u.is_deactivated = 0 OR u.is_deactivated IS NULL)
        AND COALESCE(u.is_showcase, 0) = 0
        AND NOT EXISTS (
          SELECT 1 FROM likes l JOIN users lu ON lu.id = l.user_id
           WHERE l.target_type = 'user' AND l.target_id = u.id AND COALESCE(lu.is_showcase, 0) = 1)
      ORDER BY u.created_at DESC
      LIMIT ?`,
    [sinceStr, maxUsers]
  )) as any[];
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { seeded: 0, visits: 0, likes: 0 };
  }

  let seeded = 0;
  let visits = 0;
  let likes = 0;
  for (const c of candidates) {
    const recipientToken = genderToken(c.gender);
    const senders = compatibleSenders(recipientToken, c.looking_for_json, showcase);
    if (senders.length === 0) continue;
    const r = await applyInterestSignals(db, String(c.id), recipientToken, senders, nowStr, true);
    seeded++;
    visits += r.visits;
    likes += r.likes;
  }

  await db.persist();
  console.log(`[showcase] Sinal semeado p/ novos usuários: ${seeded} usuários, +${visits} visitas, +${likes} likes (${showcase.length} perfis vitrine)`);
  return { seeded, visits, likes };
}

// Curtidas de engajamento: a cada ~5 min, os perfis de vitrine curtem TODOS os
// posts elegíveis das últimas 24h de autores COMPATÍVEIS (casal→casal,
// homem→mulher, mulher/casal→homem). Dedup POR VITRINE (cada vitrine curte um
// post uma vez só) + TETO por post (CAP) pra não virar enxurrada. Cada post
// ganha até CAP curtidas de vitrines diferentes ao longo das rodadas. Gera a
// notificação real "Curtiram sua publicação" no autor.
export async function runShowcaseFeedLikes(
  db: DbHandle,
  opts: { windowHours?: number; maxPerRun?: number; capRatio?: number } = {}
): Promise<{ liked: number }> {
  const windowHours = opts.windowHours ?? 24;
  const maxPerRun = opts.maxPerRun ?? 400; // limite de segurança total por rodada
  const capRatio = opts.capRatio ?? 0.5;   // teto por post = 50% das vitrines COMPATÍVEIS
  const nowStr = new Date().toISOString();
  const sinceStr = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

  const showcase = await allShowcaseProfiles(db);
  if (showcase.length === 0) return { liked: 0 };

  // Posts recentes de autores NÃO-vitrine (o teto é dinâmico, calculado por post).
  const posts = (await db.queryAll(
    `SELECT p.id, p.user_id, u.gender AS author_gender, u.looking_for_json AS author_looking
       FROM posts p JOIN users u ON u.id = p.user_id
      WHERE p.created_at >= ?
        AND COALESCE(u.is_showcase, 0) = 0
        AND (u.is_banned = 0 OR u.is_banned IS NULL)
        AND (u.is_deactivated = 0 OR u.is_deactivated IS NULL)
      ORDER BY p.created_at DESC
      LIMIT 400`,
    [sinceStr]
  )) as any[];
  if (!Array.isArray(posts) || posts.length === 0) return { liked: 0 };

  // Embaralha para espalhar as curtidas (não pega sempre os mesmos posts).
  for (let i = posts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [posts[i], posts[j]] = [posts[j], posts[i]];
  }

  let liked = 0;
  for (const post of posts) {
    if (liked >= maxPerRun) break;
    const authorToken = genderToken(post.author_gender);
    const senders = compatibleSenders(authorToken, post.author_looking, showcase);
    if (senders.length === 0) continue;

    // Teto do post = até 50% das vitrines compatíveis (mín. 1).
    const target = Math.max(1, Math.round(senders.length * capRatio));

    // Quem já curtiu ESTE post (dedup por vitrine).
    const already = (await db.queryAll(
      `SELECT user_id FROM likes WHERE target_type = 'post' AND target_id = ?`,
      [String(post.id)]
    )) as any[];
    const alreadySet = new Set(already.map((r) => String(r.user_id)));
    const likedCompatible = senders.filter((sc) => alreadySet.has(String(sc.id))).length;
    const notLiked = senders.filter((sc) => !alreadySet.has(String(sc.id)) && String(sc.id) !== String(post.user_id));
    let toAdd = Math.min(target - likedCompatible, notLiked.length);
    if (toAdd <= 0) continue;

    // Embaralha as vitrines candidatas e completa o post até o teto.
    for (let i = notLiked.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [notLiked[i], notLiked[j]] = [notLiked[j], notLiked[i]];
    }
    for (const sc of notLiked) {
      if (toAdd <= 0 || liked >= maxPerRun) break;
      const scId = String(sc.id);
      await db.run(
        'INSERT INTO likes (id, user_id, target_type, target_id, created_at) VALUES (?, ?, ?, ?, ?)',
        [randomUUID(), scId, 'post', String(post.id), nowStr]
      );
      const actorName = sc?.name ? String(sc.name) : 'Alguém';
      await db.run(
        `INSERT INTO notifications (id, user_id, type, title, description, data_json, is_read, created_at)
         VALUES (?, ?, 'post.liked', ?, ?, ?, 0, ?)`,
        [randomUUID(), String(post.user_id), 'Curtiram sua publicação', `${actorName} curtiu sua publicação.`, JSON.stringify({ postId: String(post.id), actorId: scId, actorName }), nowStr]
      );
      toAdd--;
      liked++;
    }
  }

  if (liked > 0) await db.persist();
  console.log(`[showcase] Likes de engajamento: +${liked} curtidas de vitrine (teto ${Math.round(capRatio * 100)}% das compatíveis por post)`);
  return { liked };
}

// Engajamento em STORIES: TODAS as vitrines VISUALIZAM os stories ativos de
// perfis reais, e 50% das vitrines COMPATÍVEIS reagem (like) ao story. Views são
// silenciosas (só inflam o contador de visualizações); likes geram a notificação
// real "Reagiram ao seu story". Idempotente (dedup por vitrine).
export async function runShowcaseStoryEngagement(
  db: DbHandle,
  opts: { capRatio?: number; maxViewsPerRun?: number; maxLikesPerRun?: number } = {}
): Promise<{ views: number; likes: number }> {
  const capRatio = opts.capRatio ?? 0.5;
  const maxViews = opts.maxViewsPerRun ?? 3000;
  const maxLikes = opts.maxLikesPerRun ?? 400;
  const nowStr = new Date().toISOString();

  const showcase = await allShowcaseProfiles(db);
  if (showcase.length === 0) return { views: 0, likes: 0 };

  // Stories ativos de perfis REAIS (não-vitrine).
  const stories = (await db.queryAll(
    `SELECT s.id, s.user_id, u.gender AS author_gender, u.looking_for_json AS author_looking
       FROM stories s JOIN users u ON u.id = s.user_id
      WHERE s.expires_at > ?
        AND COALESCE(u.is_showcase, 0) = 0
        AND (u.is_banned = 0 OR u.is_banned IS NULL)
        AND (u.is_deactivated = 0 OR u.is_deactivated IS NULL)
      ORDER BY s.created_at DESC
      LIMIT 500`,
    [nowStr]
  )) as any[];
  if (!Array.isArray(stories) || stories.length === 0) return { views: 0, likes: 0 };

  const REACTIONS = ['heart', 'fire', 'love'];
  let views = 0;
  let likes = 0;

  for (const story of stories) {
    const sid = String(story.id);
    const authorId = String(story.user_id);

    // 1) VIEWS: todas as vitrines visualizam o story (menos quem já viu).
    if (views < maxViews) {
      const viewers = (await db.queryAll('SELECT viewer_id FROM story_views WHERE story_id = ?', [sid])) as any[];
      const viewerSet = new Set(viewers.map((v) => String(v.viewer_id)));
      for (const sc of showcase) {
        if (views >= maxViews) break;
        const scId = String(sc.id);
        if (scId === authorId || viewerSet.has(scId)) continue;
        await db.run('INSERT INTO story_views (id, story_id, viewer_id, viewed_at) VALUES (?, ?, ?, ?)', [randomUUID(), sid, scId, nowStr]);
        views++;
      }
    }

    // 2) LIKES: 50% das vitrines COMPATÍVEIS reagem ao story.
    if (likes < maxLikes) {
      const authorToken = genderToken(story.author_gender);
      const senders = compatibleSenders(authorToken, story.author_looking, showcase);
      if (senders.length > 0) {
        const target = Math.max(1, Math.round(senders.length * capRatio));
        const likers = (await db.queryAll('SELECT liker_id FROM story_likes WHERE story_id = ?', [sid])) as any[];
        const likerSet = new Set(likers.map((l) => String(l.liker_id)));
        const likedCompatible = senders.filter((sc) => likerSet.has(String(sc.id))).length;
        const notLiked = senders.filter((sc) => !likerSet.has(String(sc.id)) && String(sc.id) !== authorId);
        for (let i = notLiked.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [notLiked[i], notLiked[j]] = [notLiked[j], notLiked[i]];
        }
        let toAdd = Math.min(target - likedCompatible, notLiked.length);
        for (const sc of notLiked) {
          if (toAdd <= 0 || likes >= maxLikes) break;
          const scId = String(sc.id);
          const reaction = REACTIONS[Math.floor(Math.random() * REACTIONS.length)];
          await db.run('INSERT INTO story_likes (id, story_id, liker_id, liked_at, reaction) VALUES (?, ?, ?, ?, ?)', [randomUUID(), sid, scId, nowStr, reaction]);
          const actorName = sc?.name ? String(sc.name) : 'Alguém';
          await db.run(
            `INSERT INTO notifications (id, user_id, type, title, description, data_json, is_read, created_at)
             VALUES (?, ?, 'story.liked', ?, ?, ?, 0, ?)`,
            [randomUUID(), authorId, 'Reagiram ao seu story', `${actorName} reagiu ao seu story.`, JSON.stringify({ storyId: sid, actorId: scId, actorName, reaction }), nowStr]
          );
          toAdd--;
          likes++;
        }
      }
    }
  }

  if (views > 0 || likes > 0) await db.persist();
  console.log(`[showcase] Engajamento de stories: +${views} views, +${likes} likes de vitrine`);
  return { views, likes };
}

// Publica (ou atualiza) um episódio das Novelinhas.
// Uso (em /app no container, ou em backend/ local):
//   npx tsx scripts/novelinha-publicar.ts <pasta-com-os-arquivos> <slug> <ordem>
// A pasta precisa ter: capa.jpg, video.mp4, trecho.mp4 e info.json ({"titulo","descricao"}).
// Copia os arquivos para storage/public com nome aleatório e grava media + novelinhas.
import path from 'node:path';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { env } from '../src/env.js';
import { initDb, queryOne, run } from '../src/db.js';

const [pasta, slug, ordemTxt] = process.argv.slice(2);
if (!pasta || !slug) { console.error('uso: novelinha-publicar.ts <pasta> <slug> <ordem>'); process.exit(1); }
const ordem = Number(ordemTxt || 0);
const info = JSON.parse(readFileSync(path.join(pasta, 'info.json'), 'utf-8')) as { titulo: string; descricao: string };

const db = await initDb({
  databaseFile: env.DATABASE_FILE,
  migrationsDir: path.join(process.cwd(), 'migrations'),
  pgMigrationsDir: path.join(process.cwd(), 'pg-migrations'),
  databaseUrl: env.DATABASE_URL || undefined,
});
const admin = (await queryOne(db, 'SELECT id FROM users WHERE is_admin = 1 ORDER BY created_at ASC LIMIT 1', [])) as any;
if (!admin) { console.error('nenhum admin'); process.exit(1); }
const destino = path.join(process.cwd(), 'storage', 'public');
mkdirSync(destino, { recursive: true });

const agora = new Date().toISOString();
const guardar = async (arquivo: string, mime: string) => {
  const origem = path.join(pasta, arquivo);
  if (!existsSync(origem)) throw new Error(`falta ${arquivo}`);
  const id = randomUUID();
  const nome = `${randomUUID()}${path.extname(arquivo)}`;
  copyFileSync(origem, path.join(destino, nome));
  await run(db, 'INSERT INTO media (id, user_id, filename, original_name, mime_type, size, is_private, is_main, created_at, source, processando) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 0)',
    [id, String(admin.id), nome, `novelinha-${slug}-${arquivo}`, mime, statSync(origem).size, agora, 'novelinha']);
  return id;
};
let duracao = 0;
try {
  duracao = Math.round(Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(pasta, 'video.mp4')]).toString().trim()));
} catch { duracao = 0; }

const capa = await guardar('capa.jpg', 'image/jpeg');
const video = await guardar('video.mp4', 'video/mp4');
const trecho = await guardar('trecho.mp4', 'video/mp4');
const existe = (await queryOne(db, 'SELECT id FROM novelinhas WHERE slug = ?', [slug])) as any;
if (existe) {
  await run(db, 'UPDATE novelinhas SET titulo = ?, descricao = ?, capa_media_id = ?, video_media_id = ?, trailer_media_id = ?, duracao_seg = ?, ordem = ?, publicado = 1 WHERE id = ?',
    [info.titulo, info.descricao, capa, video, trecho, duracao, ordem, String(existe.id)]);
} else {
  await run(db, 'INSERT INTO novelinhas (id, slug, titulo, descricao, capa_media_id, video_media_id, trailer_media_id, duracao_seg, ordem, publicado, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
    [randomUUID(), slug, info.titulo, info.descricao, capa, video, trecho, duracao, ordem, agora]);
}
await db.persist();
console.log(`novelinha ${slug} publicada (${duracao}s)`);
process.exit(0);

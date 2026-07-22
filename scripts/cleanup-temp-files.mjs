#!/usr/bin/env node
// Limpeza de arquivos temporários de compressão de mídia.
//
// Quando o backend comprime um upload (ffmpeg para vídeo, webp para imagem),
// ele escreve um arquivo intermediário `<original>.compressed.mp4` /
// `.compressed.webp` e o remove ao terminar. Se o processo cai no meio (crash,
// restart, OOM), esse intermediário fica órfão em backend/storage. São 100%
// transitórios: nenhum registro no banco aponta para eles.
//
// SEGURANÇA:
//   • Só toca em arquivos que terminam EXATAMENTE em .compressed.mp4/.webp.
//   • Só remove os mais velhos que --min-age-hours (padrão 6h), para nunca
//     apagar um arquivo de uma compressão ainda em andamento.
//   • Dry-run por padrão: apenas LISTA. Exclui de verdade só com --apply.
//   • Nunca segue symlinks; nunca sai do diretório de storage.
//
// Uso:
//   node scripts/cleanup-temp-files.mjs            # dry-run (só lista)
//   node scripts/cleanup-temp-files.mjs --apply    # apaga de verdade
//   node scripts/cleanup-temp-files.mjs --min-age-hours=12
//   STORAGE_DIR=/caminho/no/servidor node scripts/cleanup-temp-files.mjs --apply

import { readdirSync, lstatSync, unlinkSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SUFFIXES = ['.compressed.mp4', '.compressed.webp'];

function parseArgs(argv) {
  const apply = argv.includes('--apply');
  const ageArg = argv.find((a) => a.startsWith('--min-age-hours='));
  const parsed = ageArg ? Number(ageArg.split('=')[1]) : NaN;
  const minAgeHours = Number.isFinite(parsed) && parsed >= 0 ? parsed : 6;
  return { apply, minAgeHours };
}

function resolveStorageDir() {
  if (process.env.STORAGE_DIR) return path.resolve(process.env.STORAGE_DIR);
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.join(scriptDir, '..');
  return path.join(repoRoot, 'backend', 'storage');
}

function isTempCompressed(name) {
  return SUFFIXES.some((s) => name.endsWith(s));
}

/** Percorre o diretório recursivamente coletando os temporários elegíveis. */
function collect(dir, cutoffMs, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // diretório inacessível — ignora
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    let stat;
    try {
      stat = lstatSync(full); // lstat: não segue symlink
    } catch {
      continue;
    }
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      collect(full, cutoffMs, out);
    } else if (stat.isFile() && isTempCompressed(entry.name) && stat.mtimeMs < cutoffMs) {
      out.push({ path: full, size: stat.size, mtimeMs: stat.mtimeMs });
    }
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function main() {
  const { apply, minAgeHours } = parseArgs(process.argv.slice(2));
  const storageDir = resolveStorageDir();

  console.log(`[cleanup] storage: ${storageDir}`);
  console.log(`[cleanup] modo: ${apply ? 'APPLY (vai apagar)' : 'dry-run (só lista)'} | idade mínima: ${minAgeHours}h`);

  if (!existsSync(storageDir)) {
    console.log('[cleanup] diretório de storage não existe — nada a fazer.');
    return;
  }

  const cutoffMs = Date.now() - minAgeHours * 60 * 60 * 1000;
  const found = [];
  collect(storageDir, cutoffMs, found);

  if (found.length === 0) {
    console.log('[cleanup] nenhum temporário órfão elegível encontrado. ✔');
    return;
  }

  let totalBytes = 0;
  let removed = 0;
  for (const f of found) {
    totalBytes += f.size;
    const rel = path.relative(storageDir, f.path);
    if (apply) {
      try {
        unlinkSync(f.path);
        removed += 1;
        console.log(`  apagado: ${rel} (${formatBytes(f.size)})`);
      } catch (err) {
        console.warn(`  FALHOU: ${rel} — ${err?.message || err}`);
      }
    } else {
      console.log(`  apagaria: ${rel} (${formatBytes(f.size)})`);
    }
  }

  console.log(
    apply
      ? `[cleanup] ${removed}/${found.length} arquivo(s) apagado(s), ${formatBytes(totalBytes)} liberados.`
      : `[cleanup] ${found.length} arquivo(s) seriam apagados, liberando ${formatBytes(totalBytes)}. Rode com --apply para executar.`
  );
}

main();

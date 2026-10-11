import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { DbHandle } from './db.js';

// Tempo de resposta da API, resumido a cada 5 minutos (média, p95, máximo,
// erros e as rotas mais lentas). Base do gráfico "Desempenho do servidor" do
// admin: mostra SE o site ficou lento e EM QUE horário.
//
// Guarda as durações do intervalo em memória (no máximo LIMITE_AMOSTRAS; acima
// disso, amostragem aleatória para o p95 continuar representativo sem crescer).

const LIMITE_AMOSTRAS = 5000;
const INTERVALO_MS = 5 * 60 * 1000;
const DIAS_GUARDADOS = 30;

type PorRota = { n: number; soma: number; max: number };
let balde = novoBalde();

function novoBalde() {
  return {
    inicio: new Date().toISOString(),
    n: 0,
    soma: 0,
    max: 0,
    erros: 0,
    duracoes: [] as number[],
    porRota: new Map<string, PorRota>(),
  };
}

// "/api/users/:id" em vez de um endereço por usuário. Express preenche
// req.route quando a rota casou; sem isso, troca ids pelo marcador.
function nomeDaRota(req: Request): string {
  const rota = (req as any).route?.path;
  if (typeof rota === 'string') return `${req.method} ${req.baseUrl || ''}${rota}`;
  const caminho = String(req.originalUrl || req.url || '').split('?')[0]
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d+(?=\/|$)/g, '/:n');
  return `${req.method} ${caminho}`;
}

export function medirTempoDeResposta() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith('/api/')) return next();
    const inicio = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
      balde.n++;
      balde.soma += ms;
      if (ms > balde.max) balde.max = ms;
      if (res.statusCode >= 500) balde.erros++;
      if (balde.duracoes.length < LIMITE_AMOSTRAS) balde.duracoes.push(ms);
      else {
        const j = Math.floor(Math.random() * balde.n);
        if (j < LIMITE_AMOSTRAS) balde.duracoes[j] = ms;
      }
      const rota = nomeDaRota(req);
      const r = balde.porRota.get(rota) ?? { n: 0, soma: 0, max: 0 };
      r.n++;
      r.soma += ms;
      if (ms > r.max) r.max = ms;
      balde.porRota.set(rota, r);
    });
    next();
  };
}

function percentil(valores: number[], p: number) {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.min(ordenados.length - 1, Math.floor((p / 100) * ordenados.length))];
}

async function gravarBalde(db: DbHandle, persist: () => Promise<void>) {
  const b = balde;
  balde = novoBalde();
  if (b.n === 0) return;
  // As 5 rotas que mais somaram tempo no intervalo (onde o servidor gastou).
  const lentas = [...b.porRota.entries()]
    .sort((x, y) => y[1].soma - x[1].soma)
    .slice(0, 5)
    .map(([rota, r]) => ({ rota, pedidos: r.n, mediaMs: Math.round(r.soma / r.n), maxMs: Math.round(r.max) }));
  await db.run(
    'INSERT INTO desempenho_respostas (id, inicio, pedidos, media_ms, p95_ms, max_ms, erros, lentas_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [randomUUID(), b.inicio, b.n, Math.round(b.soma / b.n), Math.round(percentil(b.duracoes, 95)), Math.round(b.max), b.erros, JSON.stringify(lentas)]
  );
  const corte = new Date(Date.now() - DIAS_GUARDADOS * 86_400_000).toISOString();
  await db.run('DELETE FROM desempenho_respostas WHERE inicio < ?', [corte]);
  await persist();
}

export function iniciarGravacaoDeDesempenho(db: DbHandle, persist: () => Promise<void>) {
  const timer = setInterval(() => {
    gravarBalde(db, persist).catch((e) => console.error('[desempenho] falha ao gravar:', e));
  }, INTERVALO_MS);
  // Não segura o processo vivo (testes encerram normalmente).
  (timer as any).unref?.();
}

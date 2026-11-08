// Transforma o que a pessoa digitou como cidade numa cidade de verdade da
// tabela `cities` (nome oficial, UF e coordenadas).
//
// Sem isso, "Fortaleza ce", "Belém-PA" ou um bairro ("Sabiaguaba", "Itaquera")
// ficavam gravados sem coordenadas: a pessoa não aparecia na busca por
// distância e só via quem tinha digitado exatamente o mesmo texto — achava que
// não havia ninguém perto (nota 0 na pesquisa de 08/11/2026).
import type { DbHandle } from './db.js';
import { queryAll } from './db.js';
import { normalizeText } from './seedCities.js';

const ESTADOS: Record<string, string> = {
  AC: 'acre', AL: 'alagoas', AP: 'amapa', AM: 'amazonas', BA: 'bahia', CE: 'ceara',
  DF: 'distrito federal', ES: 'espirito santo', GO: 'goias', MA: 'maranhao',
  MT: 'mato grosso', MS: 'mato grosso do sul', MG: 'minas gerais', PA: 'para',
  PB: 'paraiba', PR: 'parana', PE: 'pernambuco', PI: 'piaui', RJ: 'rio de janeiro',
  RN: 'rio grande do norte', RS: 'rio grande do sul', RO: 'rondonia', RR: 'roraima',
  SC: 'santa catarina', SP: 'sao paulo', SE: 'sergipe', TO: 'tocantins',
};

// Bairros que aparecem digitados como cidade. Só os que já vimos na base;
// os demais passam a ser recusados na edição do perfil (a pessoa escolhe da lista).
const BAIRROS: Record<string, { cidade: string; uf: string }> = {
  sabiaguaba: { cidade: 'fortaleza', uf: 'CE' },
  maraponga: { cidade: 'fortaleza', uf: 'CE' },
  messejana: { cidade: 'fortaleza', uf: 'CE' },
  aldeota: { cidade: 'fortaleza', uf: 'CE' },
  itaquera: { cidade: 'sao paulo', uf: 'SP' },
  tatuape: { cidade: 'sao paulo', uf: 'SP' },
  'zona leste': { cidade: 'sao paulo', uf: 'SP' },
  'zona sul': { cidade: 'sao paulo', uf: 'SP' },
  'zona norte': { cidade: 'sao paulo', uf: 'SP' },
  realengo: { cidade: 'rio de janeiro', uf: 'RJ' },
  'campo grande rj': { cidade: 'rio de janeiro', uf: 'RJ' },
  copacabana: { cidade: 'rio de janeiro', uf: 'RJ' },
  'barra da tijuca': { cidade: 'rio de janeiro', uf: 'RJ' },
};

export type Candidato = { nome: string; uf: string | null };

/** Formas de ler o texto digitado, da mais fiel para a mais solta. Pura (testável). */
export function candidatosDaCidade(cidade: unknown, uf: unknown): Candidato[] {
  const texto = normalizeText(String(cidade ?? '')).replace(/\s+/g, ' ').trim();
  const ufInformada = String(uf ?? '').trim().toUpperCase();
  const ufValida = ufInformada.length === 2 ? ufInformada : null;
  if (texto.length < 2) return [];
  const lista: Candidato[] = [];
  const add = (nome: string, u: string | null) => {
    const n = nome.replace(/[\s,/-]+$/g, '').trim();
    if (n.length >= 2 && !lista.some((c) => c.nome === n && c.uf === u)) lista.push({ nome: n, uf: u });
  };
  add(texto, ufValida);
  // UF colada no fim: "fortaleza ce", "belem-pa", "natal/rn", "praia grande sp".
  const sigla = texto.match(/^(.*?)[\s,/-]+([a-z]{2})$/);
  if (sigla && ESTADOS[sigla[2].toUpperCase()]) add(sigla[1], sigla[2].toUpperCase());
  // Nome do estado colado no fim: "fortaleza ceara", "sobral ceara".
  for (const [sg, nomeUf] of Object.entries(ESTADOS)) {
    if (texto.endsWith(` ${nomeUf}`) && texto.length > nomeUf.length + 2) add(texto.slice(0, -nomeUf.length - 1), sg);
  }
  // Bairro conhecido.
  const bairro = BAIRROS[texto] ?? (sigla ? BAIRROS[sigla[1]] : undefined);
  if (bairro) add(bairro.cidade, bairro.uf);
  // Distrito Federal: Taguatinga, Gama, Ceilândia… são regiões de Brasília.
  if (ufValida === 'DF' || sigla?.[2] === 'df') add('brasilia', 'DF');
  return lista;
}

export type CidadeResolvida = { city: string; state: string; lat: number; lon: number };

export async function resolverCidade(db: DbHandle, cidade: unknown, uf: unknown): Promise<CidadeResolvida | null> {
  for (const c of candidatosDaCidade(cidade, uf)) {
    const linhas = (await queryAll(
      db,
      c.uf
        ? 'SELECT name, state, lat, lon FROM cities WHERE name_norm = ? AND UPPER(state) = ? LIMIT 2'
        : 'SELECT name, state, lat, lon FROM cities WHERE name_norm = ? LIMIT 5',
      c.uf ? [c.nome, c.uf] : [c.nome]
    )) as any[];
    const validas = linhas.filter((l) => l.lat != null && l.lon != null);
    // Sem UF: só aceita quando o nome é único no Brasil (Portugal fica de fora
    // da adivinhação — quem é de lá escolhe na lista).
    const escolhida = c.uf ? validas[0] : (() => {
      const br = validas.filter((l) => String(l.state).toUpperCase() !== 'PT');
      return br.length === 1 ? br[0] : undefined;
    })();
    if (escolhida) {
      return {
        city: String(escolhida.name),
        state: String(escolhida.state).toUpperCase(),
        lat: Number(escolhida.lat),
        lon: Number(escolhida.lon),
      };
    }
  }
  return null;
}

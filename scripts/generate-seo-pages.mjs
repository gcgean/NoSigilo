// Gera páginas estáticas de SEO por estado (UF) em dist/swing/{slug}/index.html
// Rodado automaticamente após o `vite build` (ver package.json -> "build").
// São páginas HTML reais, indexáveis por Bing/Google sem depender de JavaScript,
// que funcionam como funil: o conteúdo regional atrai a busca e os CTAs levam ao app.
//
// O visual reproduz o da landing /descobrir (src/pages/CampaignLanding.tsx +
// CampaignLanding.css) — hero com foto, seções alternadas com ícone, bloco de
// privacidade em vinho escuro, FAQ e CTA final. A landing é um componente React
// renderizado no cliente; estas páginas são o MESMO desenho visual, mas em HTML
// puro gerado no build, para não depender de JS na indexação. O conteúdo (texto,
// FAQ, prova social) continua único por cidade — só o layout foi copiado.
//
// Também regenera dist/sitemap.xml com a home + páginas institucionais + todos os estados.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Pasta de saída configurável (--outDir=dist_new) para permitir o build em
// staging: compila numa pasta paralela e só troca pela de produção no fim,
// em vez de esvaziar a pasta que está servindo o site durante o build.
// Via argv, e não variável de ambiente, para funcionar igual no Windows e Linux.
const outDirArg = process.argv.find((a) => a.startsWith('--outDir='));
const OUT_DIR_NAME = outDirArg ? outDirArg.slice('--outDir='.length) : 'dist';
const DIST = resolve(__dirname, '..', OUT_DIR_NAME);
const SITE = 'https://nosigilo.net';
// Domínio canônico único. Antes as páginas regionais viviam em
// nosigilo.baselider.com.br enquanto o resto do site se declarava em
// nosigilo.net — os dois domínios servem o mesmo site, então o Google via
// sinais contraditórios (canonical apontando para um domínio que redirecionava
// de volta) e não indexava a home nem as páginas institucionais.
//
// Agora tudo aponta para SITE. baselider continua servindo normalmente, mas
// declarando nosigilo.net como o original, que é como se migra de domínio sem
// deslogar ninguém: a sessão fica no localStorage, preso à origem.
//
// REGIONAL segue existindo só para não reescrever os ~15 pontos de uso abaixo.
const REGIONAL = SITE;
const TODAY = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
//  Prova social com numero real
// ---------------------------------------------------------------------------
// Cada pagina regional mostra quantos perfis existem ali. Isso resolve dois
// problemas de uma vez: converte melhor que texto generico, e da a cada pagina
// um dado que so existe nela — sem o que 48 paginas do mesmo molde correriam
// risco de serem lidas pelo Google como doorway pages.
//
// A regra e nunca exibir um numero fraco. Rio Branco tem 5 perfis; mostrar
// isso afundaria a pagina. Entao ha um corte: abaixo do minimo, a pagina sobe
// um nivel (estado, depois nacional) ate achar um numero que sustente.
const MIN_CIDADE = 50;
const MIN_ESTADO = 100;

let STATS = null;
try {
  STATS = JSON.parse(readFileSync(resolve(__dirname, 'seo-stats.json'), 'utf8'));
} catch {
  // Sem o arquivo o site continua gerando, apenas sem os numeros.
  console.warn('[seo] seo-stats.json ausente — paginas sairao sem prova social');
}

/** Arredonda para baixo ate um numero "redondo". 821 -> 800, 194 -> 150, 78 -> 70.
 *  Sempre para baixo, nunca para cima: assim a afirmacao continua verdadeira
 *  mesmo que alguns perfis saiam entre uma atualizacao e outra. */
function arredondaParaBaixo(n) {
  if (n >= 1000) return Math.floor(n / 1000) * 1000;
  if (n >= 500) return Math.floor(n / 100) * 100;
  if (n >= 100) return Math.floor(n / 50) * 50;
  return Math.floor(n / 10) * 10;
}

const fmt = (n) => n.toLocaleString('pt-BR');

/** O Google corta a description por volta de 155 caracteres e substitui o resto
 *  por reticências — uma frase cortada no meio custa clique. Esta função recebe
 *  as variantes em ordem de preferência (da mais informativa à mais enxuta) e
 *  devolve a primeira que couber, em vez de truncar no meio da palavra. */
function melhorDesc(variantes) {
  const CABE = 155;
  return variantes.find((d) => [...d].length <= CABE) || variantes[variantes.length - 1];
}

/** O titulo abre com a consulta exata que as pessoas digitam. O Search Console
 *  mostrou a pagina de Fortaleza na posicao 17 para "troca de casais em
 *  fortaleza", enquanto quem esta na pagina 1 (Sexlog, ComunidadeSwing, ysos)
 *  abre o titulo com essa frase; o nosso enterrava ela depois de "Swing e".
 *
 *  O Google corta o titulo por volta de 60 caracteres, e cidade de nome longo
 *  ("Campos dos Goytacazes") estoura isso sozinha. Entao as variantes vao da
 *  mais completa para a mais curta e fica a primeira que couber — a frase da
 *  busca sobrevive em todas, o que se perde e o complemento. */
function melhorTitle(variantes) {
  const CABE = 60;
  return variantes.find((t) => [...t].length <= CABE) || variantes[variantes.length - 1];
}

/** Número de perfis da cidade, ou 0 se não atinge o mínimo. Usado na meta
 *  description: no resultado da busca, "Mais de 800 perfis em Fortaleza" é o
 *  único argumento que um concorrente não consegue copiar. */
function numeroCidade(city, st) {
  const n = STATS?.cidades?.[`${st.slug}/${city.slug}`] ?? 0;
  return n >= MIN_CIDADE ? arredondaParaBaixo(n) : 0;
}

function numeroEstado(st) {
  const n = STATS?.estados?.[st.slug] ?? 0;
  return n >= MIN_ESTADO ? arredondaParaBaixo(n) : 0;
}

/** Frase de prova social para uma cidade, caindo para o estado e depois para o
 *  Brasil quando o numero local nao sustenta. Retorna '' se nao houver dado. */
function provaSocialCidade(city, st) {
  if (!STATS) return '';
  const nCidade = STATS.cidades?.[`${st.slug}/${city.slug}`] ?? 0;
  if (nCidade >= MIN_CIDADE) {
    return `<strong>Mais de ${fmt(arredondaParaBaixo(nCidade))} perfis em ${esc(city.name)}</strong> já fazem parte da comunidade.`;
  }
  const nEstado = STATS.estados?.[st.slug] ?? 0;
  if (nEstado >= MIN_ESTADO) {
    return `<strong>Mais de ${fmt(arredondaParaBaixo(nEstado))} perfis no estado</strong> já fazem parte da comunidade, e a busca filtra por cidade.`;
  }
  const nBrasil = STATS.nacional ?? 0;
  if (!nBrasil) return '';
  return `<strong>Mais de ${fmt(arredondaParaBaixo(nBrasil))} perfis no Brasil</strong> já fazem parte da comunidade.`;
}

/** Mesma logica para a pagina de estado. */
function provaSocialEstado(st) {
  if (!STATS) return '';
  const nEstado = STATS.estados?.[st.slug] ?? 0;
  if (nEstado >= MIN_ESTADO) {
    return `<strong>Mais de ${fmt(arredondaParaBaixo(nEstado))} perfis no estado</strong> já fazem parte da comunidade.`;
  }
  const nBrasil = STATS.nacional ?? 0;
  if (!nBrasil) return '';
  return `<strong>Mais de ${fmt(arredondaParaBaixo(nBrasil))} perfis no Brasil</strong> já fazem parte da comunidade.`;
}

/** Estados brasileiros: nome, slug, capital, cidades-chave e região. */
const STATES = [
  { uf: 'AC', name: 'Acre', slug: 'acre', capital: 'Rio Branco', cities: ['Rio Branco', 'Cruzeiro do Sul', 'Sena Madureira'], region: 'Norte' },
  { uf: 'AL', name: 'Alagoas', slug: 'alagoas', capital: 'Maceió', cities: ['Maceió', 'Arapiraca', 'Palmeira dos Índios'], region: 'Nordeste' },
  { uf: 'AP', name: 'Amapá', slug: 'amapa', capital: 'Macapá', cities: ['Macapá', 'Santana', 'Laranjal do Jari'], region: 'Norte' },
  { uf: 'AM', name: 'Amazonas', slug: 'amazonas', capital: 'Manaus', cities: ['Manaus', 'Parintins', 'Itacoatiara'], region: 'Norte' },
  { uf: 'BA', name: 'Bahia', slug: 'bahia', capital: 'Salvador', cities: ['Salvador', 'Feira de Santana', 'Vitória da Conquista', 'Camaçari'], region: 'Nordeste' },
  { uf: 'CE', name: 'Ceará', slug: 'ceara', capital: 'Fortaleza', cities: ['Fortaleza', 'Caucaia', 'Juazeiro do Norte', 'Sobral'], region: 'Nordeste' },
  { uf: 'DF', name: 'Distrito Federal', slug: 'distrito-federal', capital: 'Brasília', cities: ['Brasília', 'Taguatinga', 'Ceilândia'], region: 'Centro-Oeste' },
  { uf: 'ES', name: 'Espírito Santo', slug: 'espirito-santo', capital: 'Vitória', cities: ['Vitória', 'Vila Velha', 'Serra', 'Cariacica'], region: 'Sudeste' },
  { uf: 'GO', name: 'Goiás', slug: 'goias', capital: 'Goiânia', cities: ['Goiânia', 'Aparecida de Goiânia', 'Anápolis'], region: 'Centro-Oeste' },
  { uf: 'MA', name: 'Maranhão', slug: 'maranhao', capital: 'São Luís', cities: ['São Luís', 'Imperatriz', 'Timon'], region: 'Nordeste' },
  { uf: 'MT', name: 'Mato Grosso', slug: 'mato-grosso', capital: 'Cuiabá', cities: ['Cuiabá', 'Várzea Grande', 'Rondonópolis'], region: 'Centro-Oeste' },
  { uf: 'MS', name: 'Mato Grosso do Sul', slug: 'mato-grosso-do-sul', capital: 'Campo Grande', cities: ['Campo Grande', 'Dourados', 'Três Lagoas'], region: 'Centro-Oeste' },
  { uf: 'MG', name: 'Minas Gerais', slug: 'minas-gerais', capital: 'Belo Horizonte', cities: ['Belo Horizonte', 'Uberlândia', 'Contagem', 'Juiz de Fora'], region: 'Sudeste' },
  { uf: 'PA', name: 'Pará', slug: 'para', capital: 'Belém', cities: ['Belém', 'Ananindeua', 'Santarém', 'Marabá'], region: 'Norte' },
  { uf: 'PB', name: 'Paraíba', slug: 'paraiba', capital: 'João Pessoa', cities: ['João Pessoa', 'Campina Grande', 'Patos'], region: 'Nordeste' },
  { uf: 'PR', name: 'Paraná', slug: 'parana', capital: 'Curitiba', cities: ['Curitiba', 'Londrina', 'Maringá', 'Ponta Grossa'], region: 'Sul' },
  { uf: 'PE', name: 'Pernambuco', slug: 'pernambuco', capital: 'Recife', cities: ['Recife', 'Jaboatão dos Guararapes', 'Olinda', 'Caruaru'], region: 'Nordeste' },
  { uf: 'PI', name: 'Piauí', slug: 'piaui', capital: 'Teresina', cities: ['Teresina', 'Parnaíba', 'Picos'], region: 'Nordeste' },
  { uf: 'RJ', name: 'Rio de Janeiro', slug: 'rio-de-janeiro', capital: 'Rio de Janeiro', cities: ['Rio de Janeiro', 'Niterói', 'Nova Iguaçu', 'Duque de Caxias'], region: 'Sudeste' },
  { uf: 'RN', name: 'Rio Grande do Norte', slug: 'rio-grande-do-norte', capital: 'Natal', cities: ['Natal', 'Mossoró', 'Parnamirim'], region: 'Nordeste' },
  { uf: 'RS', name: 'Rio Grande do Sul', slug: 'rio-grande-do-sul', capital: 'Porto Alegre', cities: ['Porto Alegre', 'Caxias do Sul', 'Pelotas', 'Canoas'], region: 'Sul' },
  { uf: 'RO', name: 'Rondônia', slug: 'rondonia', capital: 'Porto Velho', cities: ['Porto Velho', 'Ji-Paraná', 'Ariquemes'], region: 'Norte' },
  { uf: 'RR', name: 'Roraima', slug: 'roraima', capital: 'Boa Vista', cities: ['Boa Vista', 'Rorainópolis', 'Caracaraí'], region: 'Norte' },
  { uf: 'SC', name: 'Santa Catarina', slug: 'santa-catarina', capital: 'Florianópolis', cities: ['Florianópolis', 'Joinville', 'Blumenau', 'Chapecó'], region: 'Sul' },
  { uf: 'SP', name: 'São Paulo', slug: 'sao-paulo', capital: 'São Paulo', cities: ['São Paulo', 'Campinas', 'Guarulhos', 'Santos', 'Ribeirão Preto'], region: 'Sudeste' },
  { uf: 'SE', name: 'Sergipe', slug: 'sergipe', capital: 'Aracaju', cities: ['Aracaju', 'Nossa Senhora do Socorro', 'Lagarto'], region: 'Nordeste' },
  { uf: 'TO', name: 'Tocantins', slug: 'tocantins', capital: 'Palmas', cities: ['Palmas', 'Araguaína', 'Gurupi'], region: 'Norte' },
];

// ============================================================
//  >>> ESCOLHA AQUI o que publicar <<<
// ============================================================
// ENABLED_STATES: slugs dos estados a gerar. Use a string 'all' para os 27.
//   Ex.: ['sao-paulo', 'rio-de-janeiro']  ou  'all'
// 'all' = todos os 27 estados (Norte, Nordeste, Centro-Oeste, Sudeste e Sul).
const ENABLED_STATES = 'all';

// ENABLED_CITIES: cidades com página própria em /swing/{estado}/{cidade}/.
//   Chave = slug do estado (deve estar habilitado acima).
//   Valor = lista de { name, slug }.
//   Deixe {} para nenhuma cidade. Ex.:
//   const ENABLED_CITIES = { 'sao-paulo': [{ name: 'Campinas', slug: 'campinas' }] };
const ENABLED_CITIES = {
  // Selecao guiada pelos dados, nao pelo mapa: entram as cidades onde ja
  // existem perfis de verdade (ver scripts/seo-stats.json). Por isso ha
  // cidades sem pagina de capital que superam capitais — Campina Grande tem
  // mais perfis que Natal e Manaus, Caruaru tem mais que Salvador. Uma pagina
  // de cidade sem ninguem por perto atrai visita e entrega um vazio.
  //
  // Corte atual: 8+ perfis visiveis. Foi 20, depois 15, e desceu porque o
  // Search Console mostrou que a cauda longa e onde o site ganha: Porto Velho
  // converte 14% e Manaus 22%, enquanto Sao Paulo, com o dobro de impressoes,
  // converte 3,5%. Cidade pequena disputa termo barato e entrega o clique.
  //
  // Abaixo de 8 nao vale: quem se cadastra por uma pagina dessas encontra
  // pouca gente por perto e nao volta.
  'acre': [{ name: 'Rio Branco', slug: 'rio-branco' }],
  'alagoas': [{ name: 'Maceió', slug: 'maceio' }],
  'amapa': [{ name: 'Macapá', slug: 'macapa' }],
  'amazonas': [{ name: 'Manaus', slug: 'manaus' }],
  'bahia': [
    { name: 'Feira de Santana', slug: 'feira-de-santana' },
    { name: 'Salvador', slug: 'salvador' },
  ],
  'ceara': [
    { name: 'Aquiraz', slug: 'aquiraz' },
    { name: 'Aracati', slug: 'aracati' },
    { name: 'Caucaia', slug: 'caucaia' },
    { name: 'Crato', slug: 'crato' },
    { name: 'Eusébio', slug: 'eusebio' },
    { name: 'Fortaleza', slug: 'fortaleza' },
    { name: 'Horizonte', slug: 'horizonte' },
    { name: 'Iguatu', slug: 'iguatu' },
    { name: 'Itapipoca', slug: 'itapipoca' },
    { name: 'Juazeiro do Norte', slug: 'juazeiro-do-norte' },
    { name: 'Limoeiro do Norte', slug: 'limoeiro-do-norte' },
    { name: 'Maracanaú', slug: 'maracanau' },
    { name: 'Pacajus', slug: 'pacajus' },
    { name: 'Quixadá', slug: 'quixada' },
    { name: 'Sobral', slug: 'sobral' },
    { name: 'Tianguá', slug: 'tiangua' },
  ],
  'distrito-federal': [{ name: 'Brasília', slug: 'brasilia' }],
  'espirito-santo': [
    { name: 'Aracruz', slug: 'aracruz' },
    { name: 'Cariacica', slug: 'cariacica' },
    { name: 'Guarapari', slug: 'guarapari' },
    { name: 'Serra', slug: 'serra' },
    { name: 'Vila Velha', slug: 'vila-velha' },
    { name: 'Vitória', slug: 'vitoria' },
  ],
  'goias': [
    { name: 'Aparecida de Goiânia', slug: 'aparecida-de-goiania' },
    { name: 'Goiânia', slug: 'goiania' },
  ],
  'maranhao': [
    { name: 'Imperatriz', slug: 'imperatriz' },
    { name: 'São Luís', slug: 'sao-luis' },
  ],
  'mato-grosso': [{ name: 'Cuiabá', slug: 'cuiaba' }],
  'mato-grosso-do-sul': [{ name: 'Campo Grande', slug: 'campo-grande' }],
  'minas-gerais': [
    { name: 'Belo Horizonte', slug: 'belo-horizonte' },
    { name: 'Betim', slug: 'betim' },
    { name: 'Contagem', slug: 'contagem' },
    { name: 'Governador Valadares', slug: 'governador-valadares' },
    { name: 'Ipatinga', slug: 'ipatinga' },
    { name: 'Juiz de Fora', slug: 'juiz-de-fora' },
    { name: 'Sete Lagoas', slug: 'sete-lagoas' },
    { name: 'Uberlândia', slug: 'uberlandia' },
    { name: 'Vespasiano', slug: 'vespasiano' },
  ],
  'para': [
    { name: 'Ananindeua', slug: 'ananindeua' },
    { name: 'Belém', slug: 'belem' },
    { name: 'Parauapebas', slug: 'parauapebas' },
  ],
  'paraiba': [
    { name: 'Campina Grande', slug: 'campina-grande' },
    { name: 'João Pessoa', slug: 'joao-pessoa' },
  ],
  'parana': [
    { name: 'Curitiba', slug: 'curitiba' },
    { name: 'Foz do Iguaçu', slug: 'foz-do-iguacu' },
    { name: 'Londrina', slug: 'londrina' },
    { name: 'Maringá', slug: 'maringa' },
  ],
  'pernambuco': [
    { name: 'Caruaru', slug: 'caruaru' },
    { name: 'Garanhuns', slug: 'garanhuns' },
    { name: 'Ipojuca', slug: 'ipojuca' },
    { name: 'Jaboatão dos Guararapes', slug: 'jaboatao-dos-guararapes' },
    { name: 'Olinda', slug: 'olinda' },
    { name: 'Paulista', slug: 'paulista' },
    { name: 'Petrolina', slug: 'petrolina' },
    { name: 'Recife', slug: 'recife' },
  ],
  'piaui': [{ name: 'Teresina', slug: 'teresina' }],
  'rio-de-janeiro': [
    { name: 'Campos dos Goytacazes', slug: 'campos-dos-goytacazes' },
    { name: 'Duque de Caxias', slug: 'duque-de-caxias' },
    { name: 'Niterói', slug: 'niteroi' },
    { name: 'Nova Iguaçu', slug: 'nova-iguacu' },
    { name: 'Rio de Janeiro', slug: 'rio-de-janeiro' },
    { name: 'São Gonçalo', slug: 'sao-goncalo' },
    { name: 'Volta Redonda', slug: 'volta-redonda' },
  ],
  'rio-grande-do-norte': [
    { name: 'Caicó', slug: 'caico' },
    { name: 'Mossoró', slug: 'mossoro' },
    { name: 'Natal', slug: 'natal' },
    { name: 'Parnamirim', slug: 'parnamirim' },
    { name: 'Pau dos Ferros', slug: 'pau-dos-ferros' },
  ],
  'rio-grande-do-sul': [
    { name: 'Caxias do Sul', slug: 'caxias-do-sul' },
    { name: 'Novo Hamburgo', slug: 'novo-hamburgo' },
    { name: 'Pelotas', slug: 'pelotas' },
    { name: 'Porto Alegre', slug: 'porto-alegre' },
    { name: 'Rio Grande', slug: 'rio-grande' },
  ],
  'rondonia': [
    { name: 'Ariquemes', slug: 'ariquemes' },
    { name: 'Cacoal', slug: 'cacoal' },
    { name: 'Candeias do Jamari', slug: 'candeias-do-jamari' },
    { name: 'Ji Paraná', slug: 'ji-parana' },
    { name: 'Porto Velho', slug: 'porto-velho' },
  ],
  'roraima': [{ name: 'Boa Vista', slug: 'boa-vista' }],
  'santa-catarina': [
    { name: 'Blumenau', slug: 'blumenau' },
    { name: 'Florianópolis', slug: 'florianopolis' },
    { name: 'Joinville', slug: 'joinville' },
  ],
  'sao-paulo': [
    { name: 'Campinas', slug: 'campinas' },
    { name: 'Caraguatatuba', slug: 'caraguatatuba' },
    { name: 'Diadema', slug: 'diadema' },
    { name: 'Franca', slug: 'franca' },
    { name: 'Guarulhos', slug: 'guarulhos' },
    { name: 'Jundiaí', slug: 'jundiai' },
    { name: 'Osasco', slug: 'osasco' },
    { name: 'Presidente Prudente', slug: 'presidente-prudente' },
    { name: 'Ribeirão Preto', slug: 'ribeirao-preto' },
    { name: 'Santo André', slug: 'santo-andre' },
    { name: 'Santos', slug: 'santos' },
    { name: 'Sorocaba', slug: 'sorocaba' },
    { name: 'São Bernardo do Campo', slug: 'sao-bernardo-do-campo' },
    { name: 'São José do Rio Preto', slug: 'sao-jose-do-rio-preto' },
    { name: 'São José dos Campos', slug: 'sao-jose-dos-campos' },
    { name: 'São Paulo', slug: 'sao-paulo' },
    { name: 'Taboão da Serra', slug: 'taboao-da-serra' },
  ],
  'sergipe': [{ name: 'Aracaju', slug: 'aracaju' }],
  'tocantins': [{ name: 'Palmas', slug: 'palmas' }],

};
// ============================================================

const ALL_STATES = STATES;
const SELECTED_STATES = ENABLED_STATES === 'all'
  ? ALL_STATES
  : ALL_STATES.filter((s) => ENABLED_STATES.includes(s.slug));

// Lista achatada de cidades habilitadas, já vinculadas ao estado-pai.
const SELECTED_CITIES = Object.entries(ENABLED_CITIES).flatMap(([stateSlug, cities]) => {
  const st = ALL_STATES.find((s) => s.slug === stateSlug);
  if (!st) { console.warn(`[seo] estado desconhecido em ENABLED_CITIES: ${stateSlug}`); return []; }
  return (cities || []).map((c) => ({ ...c, state: st }));
});

// ---------------------------------------------------------------------------
//  Numeros frescos, direto do banco
// ---------------------------------------------------------------------------
// O seo-stats.json continua existindo como reserva: e o que vale quando o
// gerador roda fora do servidor (na maquina de quem desenvolve, onde nao ha
// Postgres) ou quando o banco nao responde. Uma pagina sem numero e um
// problema pequeno; uma pagina que nao gera e um problema grande.
//
// Vai por `docker exec ... psql` em vez de um cliente Postgres porque o
// gerador esta no package.json da raiz, que nao tem o pg instalado (ele vive
// no backend). Um comando a mais no build sai mais barato que uma dependencia
// a mais na raiz — e e exatamente o mesmo caminho que o scripts/seo-stats.sql
// ja usa a mao.
const PG_CONTAINER = process.env.SEO_PG_CONTAINER || 'nosigilo-postgres';

const semAcentos = (t) => String(t ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().trim();

const SQL_STATS = `
  WITH visiveis AS (
    SELECT trim(city) AS city, trim(state) AS state
    FROM users
    -- is_banned e is_deactivated sao INTEGER, nao boolean (heranca do SQLite):
    -- comparar com \`false\` da "COALESCE types integer and boolean cannot be matched".
    WHERE COALESCE(is_banned, 0) = 0
      AND COALESCE(is_deactivated, 0) = 0
      AND deleted_at IS NULL
  )
  SELECT json_build_object(
    'nacional',   (SELECT COUNT(*) FROM visiveis),
    'porUf',      (SELECT json_object_agg(state, n) FROM (
                     SELECT upper(state) AS state, COUNT(*) AS n FROM visiveis
                     WHERE char_length(COALESCE(state, '')) = 2 GROUP BY 1) t),
    'porCidade',  (SELECT json_object_agg(city, n) FROM (
                     SELECT city, COUNT(*) AS n FROM visiveis
                     WHERE char_length(COALESCE(city, '')) >= 3 GROUP BY 1) t)
  )::text;
`;

const SEM_BANCO = process.argv.includes('--sem-banco');

/** Manda SQL pelo stdin do psql, e nao por `-c`.
 *
 *  A primeira versao usava `-c` com o SQL entre aspas do shell, e o psql
 *  recebia os \n literais como meta-comandos dele — o comando morria antes de
 *  chegar ao banco. Pelo stdin nao ha nada para escapar: e o mesmo caminho que
 *  o scripts/seo-stats.sql ja usa a mao. */
function psql(sql) {
  return execFileSync('docker', [
    'exec', '-i', PG_CONTAINER, 'sh', '-c',
    'psql -U $POSTGRES_USER -d $POSTGRES_DB -t -A -q -v ON_ERROR_STOP=1 -f -',
  ], { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 });
}

/** Ultima linha nao vazia da saida — onde vem o resultado do SELECT final. */
function ultimaLinha(saida) {
  return String(saida).split(String.fromCharCode(10)).map((l) => l.trim()).filter(Boolean).pop() || '';
}

function statsDoBanco() {
  if (SEM_BANCO) return null;
  let bruto;
  try {
    bruto = psql(SQL_STATS);
  } catch (e) {
    console.warn(`[seo] banco indisponivel (${String(e.message).split(String.fromCharCode(10))[0]}) — usando seo-stats.json`);
    return null;
  }

  let dados;
  try { dados = JSON.parse(ultimaLinha(bruto)); }
  catch { console.warn('[seo] resposta do banco ilegivel — usando seo-stats.json'); return null; }
  if (!dados || typeof dados.nacional !== 'number') return null;

  const estados = {};
  for (const st of SELECTED_STATES) {
    const n = dados.porUf?.[st.uf];
    if (typeof n === 'number') estados[st.slug] = n;
  }

  // A consulta agrupa cidade so pelo nome, e nao por estado+cidade, porque uma
  // parte dos perfis tem o campo state vazio — agrupar pelos dois fatiaria a
  // mesma cidade em duas linhas e cada metade pareceria menor do que e.
  //
  // O preco disso e a homonimia: "Santa Luzia" existe na PB e em MG. Quando o
  // mesmo nome cai em mais de uma cidade publicada, ninguem leva o numero e as
  // duas caem para o total do estado. Repetir a mesma contagem nas duas seria
  // inventar gente que nao esta la.
  // SOMA as variantes, nao sobrescreve. A consulta agrupa por trim(city)
  // exato, entao "Fortaleza", "fortaleza" e "FORTALEZA" chegam como tres
  // chaves; sem somar, sobrava so a ultima e a cidade parecia ter uma fracao
  // dos perfis. Quebrava justamente as maiores, que tem mais variantes —
  // Fortaleza caiu abaixo do corte de 50 e a pagina perdeu o numero.
  // Normalizar tambem junta acento: "Sao Paulo" e "São Paulo" sao a mesma.
  const porNome = new Map();
  for (const [nome, n] of Object.entries(dados.porCidade || {})) {
    const k = semAcentos(nome);
    porNome.set(k, (porNome.get(k) || 0) + n);
  }
  const vezes = new Map();
  for (const c of SELECTED_CITIES) {
    const k = semAcentos(c.name);
    vezes.set(k, (vezes.get(k) || 0) + 1);
  }
  const cidades = {};
  let ambiguas = 0;
  for (const c of SELECTED_CITIES) {
    const k = semAcentos(c.name);
    if (vezes.get(k) > 1) { ambiguas++; continue; }
    const n = porNome.get(k);
    if (typeof n === 'number') cidades[`${c.state.slug}/${c.slug}`] = n;
  }
  if (ambiguas) console.warn(`[seo] ${ambiguas} cidade(s) de nome repetido ficaram sem numero proprio`);

  console.log(`[seo] numeros do banco: ${dados.nacional} perfis, ${Object.keys(estados).length} estados, ${Object.keys(cidades).length} cidades`);
  return { nacional: dados.nacional, estados, cidades };
}

const doBanco = statsDoBanco();
if (doBanco) STATS = doBanco;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const list = (arr) => {
  if (arr.length === 1) return arr[0];
  return arr.slice(0, -1).join(', ') + ' e ' + arr[arr.length - 1];
};

/** URL do cadastro carregando de qual pagina o visitante veio.
 *
 *  E o que permite responder, no admin, se estas paginas trazem gente que se
 *  cadastra ou so visita. Vai como caminho curto (swing/ceara/fortaleza) para
 *  nao precisar de encoding na URL; o backend normaliza para /swing/ceara/
 *  fortaleza/ e descarta o que nao casar com esse formato. */
function cadastroUrl(origem) {
  return `/register?origem=${origem}`;
}

/** Links para os estados publicados (rodapé de cada página → ajuda o crawler a achar todas). */
function statesNav(currentSlug) {
  return SELECTED_STATES.map((s) =>
    s.slug === currentSlug
      ? `<strong>${esc(s.name)}</strong>`
      : `<a href="${REGIONAL}/swing/${s.slug}/">${esc(s.name)}</a>`
  ).join(' · ');
}

/** Cidades publicadas de um estado (para links na página do estado). */
function citiesOf(stateSlug) {
  return SELECTED_CITIES.filter((c) => c.state.slug === stateSlug);
}

/** Capitais publicadas na mesma região, exceto a propria — vira bloco de links
 *  cruzados. Sinaliza ao Google que estas páginas formam um conjunto regional,
 *  em vez de 27 páginas soltas que so trocam o nome da cidade. */
function neighborCities(city) {
  return SELECTED_CITIES
    .filter((c) => c.state.region === city.state.region && c.state.slug !== city.state.slug)
    .slice(0, 6);
}

/** Estados publicados da mesma região, exceto o próprio. */
function neighborStates(st) {
  return SELECTED_STATES.filter((s) => s.region === st.region && s.slug !== st.slug);
}

/** Trilha de navegação. Diferente do FAQ, este ainda rende resultado visível:
 *  o Google troca a URL crua pela trilha "nosigilo.net › swing › Ceará ›
 *  Fortaleza" no resultado da busca. */
function breadcrumbLd(trilha) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trilha.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE}${item.path}`,
    })),
  };
}

/** JSON-LD do FAQ. NOTA: desde agosto/2023 o Google restringiu o rich result de
 *  FAQ a sites governamentais e de saúde reconhecidos, então NÃO espere os
 *  blocos expansíveis no resultado. O que isto entrega é conteúdo que responde
 *  buscas de cauda longa, profundidade real na página e material que o Google
 *  cita nas AI Overviews. */
function faqJsonLd(itens) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: itens.map((q) => ({
      '@type': 'Question',
      name: q.p,
      acceptedAnswer: { '@type': 'Answer', text: String(q.r).replace(/<[^>]*>/g, '') },
    })),
  };
}

/** Perguntas de uma página de cidade. Todas respondidas com o que o produto
 *  realmente faz — nada de número de perfis por cidade ou nomes de casas
 *  noturnas, que seriam invenção. */
function faqCidade(city, st) {
  return [
    {
      p: `O NoSigilo é gratuito em ${city.name}?`,
      r: `Sim, o cadastro é gratuito e permite criar seu perfil, navegar e ser encontrado por outros perfis de ${esc(city.name)}. Recursos avançados, como enviar mensagens sem limite e ver quem visitou seu perfil, fazem parte do plano premium.`,
    },
    {
      p: 'Preciso ser um casal para entrar?',
      r: 'Não. O NoSigilo é aberto a casais, mulheres solteiras e homens solteiros do meio liberal. Os filtros permitem que cada perfil encontre exatamente o tipo de conexão que procura.',
    },
    {
      p: `Como encontro pessoas perto de mim em ${city.name}?`,
      r: `A função <strong>Estou Aqui</strong> mostra quem está por perto em tempo real, e os filtros de busca permitem restringir por cidade e estado — então dá para ver quem está em ${esc(city.name)} ou em outras cidades de ${esc(st.name)}.`,
    },
    {
      p: 'Minhas fotos ficam expostas?',
      r: 'Não. Você separa fotos públicas de fotos privadas e decide quem libera para ver as íntimas. As mensagens privadas ainda contam com visualização única, em que o conteúdo some depois de visto.',
    },
    {
      p: 'O ambiente é seguro e moderado?',
      r: 'Os perfis passam por aprovação antes de circular, existe denúncia em qualquer perfil ou publicação, e há diretrizes de comunidade que a moderação aplica. O acesso é restrito a maiores de 18 anos.',
    },
    {
      p: `Meus conhecidos podem me encontrar aqui?`,
      r: 'O NoSigilo é uma rede fechada e não indexa perfis em buscadores — as páginas públicas do site são apenas informativas, como esta. Nada do que você publica dentro da plataforma aparece no Google.',
    },
  ];
}

/** Perguntas da página de estado — mesma regra: só o que o produto faz. */
function faqEstado(st) {
  return [
    {
      p: `O NoSigilo funciona em todo o ${st.name}?`,
      r: `Sim. A busca cobre ${esc(st.capital)} e as demais cidades do estado, e os filtros permitem restringir por cidade — útil em ${esc(st.name)}, onde o meio liberal se concentra na capital mas existe no interior.`,
    },
    {
      p: 'Quanto custa?',
      r: 'O cadastro é gratuito e já permite criar o perfil, navegar e ser encontrado. O plano premium libera os recursos avançados, como mensagens sem limite e ver quem visitou seu perfil.',
    },
    {
      p: 'Casais e solteiros podem usar?',
      r: 'Sim — casais liberais, mulheres solteiras e homens solteiros. Cada perfil indica o que procura, e os filtros fazem o resto.',
    },
    {
      p: 'Meu perfil aparece no Google?',
      r: 'Não. Os perfis não são indexados por buscadores. As páginas do site que aparecem na busca, como esta, são apenas informativas.',
    },
    {
      p: 'Como funciona a discrição na prática?',
      r: 'Fotos públicas ficam separadas das privadas, que só abrem para quem você liberar. Conteúdo sensível pode ir por mensagem com visualização única, sumindo depois de visto.',
    },
  ];
}

/** Perguntas do hub /swing/. */
function faqHub() {
  return [
    {
      p: 'O NoSigilo cobre todo o Brasil?',
      r: 'Sim. Há páginas por estado para as 27 unidades da federação e para as capitais, e a busca dentro da plataforma filtra por cidade.',
    },
    {
      p: 'Preciso pagar para me cadastrar?',
      r: 'Não. O cadastro é gratuito e já permite criar o perfil, navegar e ser encontrado. O plano premium libera os recursos avançados.',
    },
    {
      p: 'Casais e solteiros podem usar?',
      r: 'Sim — casais liberais, mulheres solteiras e homens solteiros, cada um indicando o que procura.',
    },
    {
      p: 'Meu perfil aparece em buscadores?',
      r: 'Não. Perfis não são indexados. As páginas que aparecem no Google, como esta, são apenas informativas.',
    },
  ];
}

// ---------------------------------------------------------------------------
//  Visual — cópia do layout de /descobrir (CampaignLanding.tsx)
// ---------------------------------------------------------------------------
// /descobrir é um componente React, renderizado no cliente. Estas páginas
// precisam do MESMO desenho visual (paleta, tipografia, seções alternadas com
// foto, bloco de privacidade em vinho, FAQ, CTA final) mas como HTML puro, sem
// depender do bundle React — por isso o CSS abaixo é uma reprodução inline do
// CampaignLanding.css, e os ícones são SVGs próprios (sem depender do pacote
// lucide-react, que só existe dentro do app).
//
// As 4 fotos são as mesmas que a landing usa, nos mesmos papéis (hero,
// recursos, audiência) — a exceção é a seção de privacidade, que ganhou a foto
// dedicada (privacy-editorial-722.webp) em vez de reaproveitar a de recursos.

const ICONS = {
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  message: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7"/><path d="M12 8c0-2.5-2-5-4.5-5S5 5 5 6.5 7 8 7 8h5Zm0 0c0-2.5 2-5 4.5-5S19 5 19 6.5 17 8 17 8h-5Z"/></svg>',
  images: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="14" height="14" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5-9 9"/><path d="M13 21H6a2 2 0 0 1-2-2V6"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  badge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m8 12 3 3 5-6"/><path d="M12 2a3 3 0 0 1 2.6 1.5A3 3 0 0 1 18.5 6 3 3 0 0 1 20 9a3 3 0 0 1-1.5 2.6A3 3 0 0 1 18.5 15a3 3 0 0 1-3.4 3.4A3 3 0 0 1 12 20a3 3 0 0 1-2.6-1.5A3 3 0 0 1 5.5 15 3 3 0 0 1 4 12a3 3 0 0 1 1.5-2.6A3 3 0 0 1 5.5 6 3 3 0 0 1 8.9 3.5 3 3 0 0 1 12 2Z"/></svg>',
  dollar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
};
const icon = (name) => ICONS[name] || '';

/** CSS inline reproduzindo CampaignLanding.css — tokens (cores, tipografia),
 *  seções alternadas com foto e o bloco escuro de privacidade. Sem @import de
 *  fonte: cai para a fonte do sistema, o que mantém a página rápida (sem
 *  requisição extra) e é aceitável para uma página estática de SEO. */
const CAMPAIGN_CSS = `
:root{color-scheme:light;}
*{box-sizing:border-box;}
body{margin:0;background:#fff8f8;color:#1d1216;font-family:"Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.6;}
.cl figure,.cl h1,.cl h2,.cl h3,.cl p{margin:0;}
.cl h1,.cl h2{font-family:Georgia,"Times New Roman",serif;font-weight:400;letter-spacing:-.045em;}
.cl h1 em,.cl h2 em{color:#700c20;font-style:normal;}
.cl a{color:inherit;}
.cl-section{width:min(100% - 2.5rem,1100px);margin-inline:auto;}
.cl-header{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1.4rem clamp(1.25rem,4vw,3rem);}
.cl-brand{font-family:Georgia,serif;font-weight:700;font-size:1.4rem;color:#1d1216;text-decoration:none;}
.cl-brand em{color:#ef405e;font-style:normal;}
.cl-login{color:#700c20;font-weight:700;font-size:.9rem;text-decoration:none;border-bottom:1px solid transparent;}
.cl-login:hover{border-color:currentColor;}
.cl-hero{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:clamp(2rem,5vw,4rem);align-items:center;width:min(100% - 2.5rem,1180px);margin-inline:auto;padding-block:clamp(1rem,3vw,2rem) clamp(3rem,6vw,5rem);}
.cl-crumb{font-size:.78rem;color:#8a7d81;margin-bottom:.9rem;}
.cl-crumb a{color:#8a7d81;text-decoration:underline;text-decoration-color:#ead7d3;}
.cl-hero h1{font-size:clamp(2.1rem,4vw,3.1rem);line-height:1.05;text-wrap:balance;}
.cl-intro{margin-top:1rem;color:#655c61;font-size:1.02rem;line-height:1.6;max-width:34rem;}
.cl-prova{display:inline-flex;margin-top:1.1rem;padding:.7rem 1.1rem;border-radius:.5rem;background:#fff2f2;border:1px solid #ead7d3;border-left:3px solid #ef405e;font-size:.9rem;color:#4e4348;}
.cl-prova strong{color:#700c20;}
.cl-cta{display:inline-flex;align-items:center;justify-content:space-between;gap:.9rem;width:min(100%,21rem);margin-top:1.3rem;padding:.85rem 1.1rem .85rem 1.35rem;border-radius:.35rem;background:#ef405e;box-shadow:0 14px 30px rgba(213,45,76,.22);color:#fff;font-weight:800;font-size:1rem;text-decoration:none;}
.cl-cta:hover{background:#d52d4c;}
.cl-cta svg{width:1.15rem;height:1.15rem;flex:0 0 auto;}
.cl-trust{display:flex;flex-wrap:wrap;gap:1.3rem;margin-top:1.6rem;padding-top:1.2rem;border-top:1px solid #ead7d3;}
.cl-trust-item{display:flex;align-items:center;gap:.5rem;font-size:.72rem;font-weight:700;color:#4e4348;}
.cl-trust-item svg{width:1.05rem;height:1.05rem;color:#700c20;flex:0 0 auto;}
.cl-hero-media{border-radius:.65rem;overflow:hidden;aspect-ratio:4/3;background:#12090c;box-shadow:0 24px 60px rgba(45,20,27,.16);}
.cl-hero-media img{display:block;width:100%;height:100%;object-fit:cover;}
.cl-alt{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(2rem,5vw,4rem);align-items:center;padding-block:clamp(3rem,6vw,5rem);}
.cl-alt-media{border-radius:.65rem;overflow:hidden;aspect-ratio:1/1;background:#1a1115;box-shadow:0 20px 50px rgba(45,20,27,.14);}
.cl-alt-media img{display:block;width:100%;height:100%;object-fit:cover;}
.cl-alt-copy h2{font-size:clamp(1.9rem,3vw,2.6rem);}
.cl-alt-copy>p{margin-top:.85rem;color:#655c61;font-size:.98rem;line-height:1.6;}
.cl-list{margin-top:1.3rem;border-top:1px solid #ead7d3;}
.cl-list-item{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:start;gap:.9rem;padding:1rem 0;border-bottom:1px solid #ead7d3;}
.cl-list-item svg{width:1.4rem;height:1.4rem;color:#700c20;margin-top:.1rem;flex:0 0 auto;}
.cl-list-item h3{font-size:.94rem;font-weight:800;}
.cl-list-item p{margin-top:.2rem;color:#655c61;font-size:.86rem;line-height:1.5;}
.cl-dark{background:linear-gradient(115deg,rgba(255,255,255,.02),transparent 42%),#26080f;color:#fff9f4;}
.cl-dark h2{color:#fff9f4;}
.cl-dark h2 em{color:#cba868;}
.cl-dark .cl-alt-copy>p{color:#d9c9c8;}
.cl-dark .cl-list-item{border-color:rgba(203,168,104,.35);}
.cl-dark .cl-list-item svg{color:#cba868;}
.cl-dark .cl-list-item p{color:#d9c9c8;}
.cl-faq{padding-block:clamp(3rem,6vw,5rem);}
.cl-faq h2{font-size:clamp(1.9rem,3vw,2.6rem);margin-bottom:1.6rem;}
.cl-faq-list{border-top:1px solid #ead7d3;}
.cl-faq-item{padding:1.3rem 0;border-bottom:1px solid #ead7d3;}
.cl-faq-item summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:.9rem;font-family:Georgia,serif;font-size:1.05rem;}
.cl-faq-item summary::-webkit-details-marker{display:none;}
.cl-faq-item summary svg{width:1.9rem;height:1.9rem;flex:0 0 auto;padding:.4rem;border:1px solid #ead7d3;border-radius:50%;color:#700c20;background:#fff2f2;}
.cl-faq-item p{margin-top:.7rem;margin-left:2.8rem;color:#655c61;font-size:.92rem;line-height:1.55;}
.cl-region{padding-block:clamp(2rem,4vw,3rem);border-top:1px solid #ead7d3;}
.cl-region h2{font-size:1.4rem;font-family:Georgia,serif;margin-bottom:.5rem;}
.cl-region p{color:#655c61;font-size:.92rem;margin-bottom:1rem;}
.cl-chips{display:flex;flex-wrap:wrap;gap:.6rem;}
.cl-chips a{background:#fff2f2;border:1px solid #ead7d3;border-radius:999px;padding:.45rem .95rem;font-size:.85rem;text-decoration:none;color:#700c20;font-weight:600;}
.cl-chips a:hover{background:#ead7d3;}
.cl-etiquette{margin:0;padding-left:1.2rem;color:#655c61;font-size:.92rem;line-height:1.75;}
.cl-final{position:relative;overflow:hidden;background:radial-gradient(circle at 5% 25%,rgba(239,64,94,.2),transparent 32%),linear-gradient(120deg,#2a0710,#650d22 68%,#2a0710);color:#fff9f4;}
.cl-final-inner{width:min(100% - 2.5rem,1100px);margin-inline:auto;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:2rem;padding-block:clamp(3rem,6vw,4.5rem);}
.cl-final h2{font-family:Georgia,serif;font-size:clamp(1.8rem,3vw,2.4rem);color:#f2d7a3;max-width:32rem;}
.cl-final p{margin-top:.6rem;color:#e3d2d1;max-width:28rem;}
.cl-final-actions{display:flex;flex-direction:column;align-items:flex-start;gap:.7rem;}
.cl-final-login{color:#f2d7a3;font-size:.85rem;text-decoration:underline;}
.cl-footer{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:1rem;padding:1.3rem clamp(1.25rem,4vw,3rem);background:#151416;color:#ddd3d4;font-size:.78rem;}
.cl-footer-brand{font-family:Georgia,serif;font-weight:700;color:#fff;}
.cl-footer-age{display:flex;align-items:center;gap:.5rem;}
.cl-footer-age svg{width:1rem;height:1rem;color:#cba868;flex:0 0 auto;}
.cl-footer-links a{color:#ddd3d4;text-decoration:none;margin-right:.9rem;}
.cl-footer-links a:hover{text-decoration:underline;}
.cl-footer-states{width:100%;margin-top:.6rem;font-size:.72rem;line-height:2;color:#a8a0a3;}
.cl-footer-states a{color:#a8a0a3;text-decoration:none;}
.cl-footer-states a:hover{text-decoration:underline;}
.cl-footer-states strong{color:#f2d7a3;}
@media (max-width:860px){
  .cl-hero,.cl-alt{grid-template-columns:minmax(0,1fr);}
  .cl-hero-media{order:-1;aspect-ratio:16/9;}
}
`;

function campaignHeader() {
  return `<header class="cl-header">
      <a class="cl-brand" href="/">NoSigilo<em>.net</em></a>
      <a class="cl-login" href="/login">Já sou membro</a>
    </header>`;
}

function campaignFooter(currentStateSlug) {
  return `<footer class="cl-footer">
      <div style="display:flex;align-items:center;gap:1.5rem;flex-wrap:wrap;">
        <span class="cl-footer-brand">NoSigilo.net</span>
        <div class="cl-footer-age">${icon('badge')}<span>Comunidade exclusiva para maiores de 18 anos.</span></div>
      </div>
      <div class="cl-footer-links">
        <a href="/terms">Termos</a><a href="/privacy">Privacidade</a><a href="/guidelines">Diretrizes</a><a href="/swing/">Todos os estados</a>
      </div>
      <div class="cl-footer-states">${statesNav(currentStateSlug)}</div>
    </footer>`;
}

/** Os 4 passos "Como funciona" — mesmo papel da seção "features" da landing
 *  (mesmos 4 ícones: perfil, fotos, localização, conversa), com a 3ª descrição
 *  parametrizada por cidade/capital/estado. */
function comoFuncionaItems(localizacaoDesc) {
  return [
    { ic: 'user', title: 'Crie o perfil', desc: 'Gratuito — indique se é casal, mulher solteira ou homem solteiro, e o que procura.' },
    { ic: 'images', title: 'Separe público do íntimo', desc: 'Fotos públicas ficam visíveis; as privadas só abrem para quem você liberar.' },
    { ic: 'pin', title: 'Encontre gente perto', desc: localizacaoDesc },
    { ic: 'message', title: 'Converse com calma', desc: 'Mensagens privadas, com visualização única para o que é mais sensível.' },
  ];
}

/** Os 3 itens do bloco escuro de privacidade — mesmo papel da seção
 *  "privacyItems" da landing. Conteúdo fixo: não varia por região porque a
 *  garantia é a mesma em qualquer lugar. */
const PRIVACIDADE_ITEMS = [
  { ic: 'eye', title: 'Perfil fora do Google', desc: 'Buscadores não indexam perfis — só páginas informativas como esta.' },
  { ic: 'lock', title: 'Fotos sob seu controle', desc: 'Você decide quem vê as fotos mais íntimas.' },
  { ic: 'shield', title: 'Visualização única', desc: 'Conteúdo sensível pode sumir depois de visto.' },
];

/** Os 3 públicos — mesmo papel da seção "audiences" da landing, com a 1ª
 *  descrição parametrizada por cidade/capital. */
function audienciaItems(casaisDesc) {
  return [
    { ic: 'users', title: 'Casais liberais', desc: casaisDesc },
    { ic: 'user', title: 'Mulheres solteiras', desc: 'Definem o próprio ritmo e com quem querem falar.' },
    { ic: 'user', title: 'Homens solteiros', desc: 'Em encontros de ménage e relações abertas, com discrição.' },
  ];
}

const listItemsHtml = (itens) => itens.map((it) =>
  `<div class="cl-list-item">${icon(it.ic)}<div><h3>${esc(it.title)}</h3><p>${it.desc}</p></div></div>`
).join('');

const FAQ_ICON_CYCLE = ['dollar', 'users', 'pin', 'lock', 'shield', 'eye'];

/** Seção de FAQ no estilo da landing (ícone + pergunta em serif + resposta).
 *  <details>/<summary> mantém expansível sem JavaScript, igual à versão
 *  anterior — só o visual mudou. */
function campaignFaqSection(itens) {
  const items = itens.map((q, i) => `<details class="cl-faq-item">
          <summary>${icon(FAQ_ICON_CYCLE[i % FAQ_ICON_CYCLE.length])}<span>${esc(q.p)}</span></summary>
          <p>${q.r}</p>
        </details>`).join('\n        ');
  return `<section class="cl-section cl-faq">
      <h2>Ainda pensando se é para <em>você</em>?</h2>
      <div class="cl-faq-list">
        ${items}
      </div>
    </section>`;
}

/** Monta o documento HTML completo: head (meta/JSON-LD/CSS) + body no layout
 *  da landing. `body` já vem pronto (header, seções, footer). */
function campaignDocument({ title, desc, url, geoUf, geoPlace, jsonld, body }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <meta name="rating" content="adult" />
  <meta name="rating" content="RTA-5042-1996-1400-1577-RTA" />
  ${geoUf ? `<meta name="geo.region" content="BR-${geoUf}" />` : ''}
  ${geoPlace ? `<meta name="geo.placename" content="${esc(geoPlace)}" />` : ''}
  <link rel="canonical" href="${url}" />
  <link rel="icon" type="image/jpeg" href="/icon.jpg" />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="pt_BR" />
  <meta property="og:site_name" content="NoSigilo.net" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:image" content="${REGIONAL}/icon.jpg" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(desc)}" />
  <meta name="twitter:image" content="${REGIONAL}/icon.jpg" />
  <meta name="theme-color" content="#eb4778" />
  <script type="application/ld+json">${JSON.stringify(jsonld)}</script>
  <style>${CAMPAIGN_CSS}</style>
</head>
<body>
  <main class="cl">
    ${body}
  </main>
</body>
</html>
`;
}

function statePage(st) {
  const cities = list(st.cities);
  const cityPages = citiesOf(st.slug);
  const title = melhorTitle([
    `Troca de Casais em ${st.name} (${st.uf}) — Swing e Casais Liberais | NoSigilo`,
    `Troca de Casais em ${st.name} (${st.uf}) — Swing Liberal | NoSigilo`,
    `Troca de Casais em ${st.name} (${st.uf}) — Swing | NoSigilo`,
    `Troca de Casais em ${st.name} (${st.uf}) | NoSigilo`,
  ]);
  const nEstado = numeroEstado(st);
  const desc = melhorDesc(nEstado
    ? [
        `Mais de ${fmt(nEstado)} perfis no estado. Swing, troca de casais e ménage em ${list(st.cities.slice(0, 3))} — rede adulta discreta, com sigilo. Cadastro grátis.`,
        `Mais de ${fmt(nEstado)} perfis no estado. Swing, troca de casais e ménage em ${list(st.cities.slice(0, 2))} — rede adulta discreta. Cadastro grátis.`,
        `Mais de ${fmt(nEstado)} perfis no estado. Swing e troca de casais numa rede adulta discreta, com sigilo. Cadastro grátis.`,
      ]
    : [
        `Swing, troca de casais e ménage em ${list(st.cities.slice(0, 3))}. Rede adulta discreta, com sigilo de verdade. Cadastro grátis.`,
        `Swing, troca de casais e ménage em ${st.capital} e região. Rede adulta discreta, com sigilo. Cadastro grátis.`,
      ]);
  const url = `${REGIONAL}/swing/${st.slug}/`;

  const jsonld = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      description: desc,
      url,
      inLanguage: 'pt-BR',
      isPartOf: { '@type': 'WebSite', name: 'NoSigilo.net', url: SITE },
      about: { '@type': 'Place', name: `${st.name}, Brasil` },
      areaServed: { '@type': 'AdministrativeArea', name: st.name },
    },
    breadcrumbLd([
      { name: 'Início', path: '/' },
      { name: 'Swing por estado', path: '/swing/' },
      { name: st.name, path: `/swing/${st.slug}/` },
    ]),
    faqJsonLd(faqEstado(st)),
  ];

  const vizinhos = neighborStates(st);
  const prova = provaSocialEstado(st);

  const body = `${campaignHeader()}

    <section class="cl-hero">
      <div class="cl-hero-copy">
        <p class="cl-crumb"><a href="/swing/">Swing por estado</a> › ${esc(st.name)}</p>
        <h1>Swing e Troca de Casais em <em>${esc(st.name)}</em></h1>
        <p class="cl-intro">
          Procurando <strong>swing em ${esc(st.name)}</strong> ou <strong>troca de casais em ${esc(st.capital)}</strong>?
          O NoSigilo.net reúne o meio liberal de ${esc(cities)} num só lugar, longe da exposição das redes sociais
          comuns — casais liberais e singles com os mesmos interesses para swing, ménage e encontros liberais,
          com total discrição.
        </p>
        ${prova ? `<p class="cl-prova">${prova}</p>` : ''}
        <a class="cl-cta" href="${cadastroUrl(`swing/${st.slug}`)}">Criar conta grátis ${icon('arrow')}</a>
        <div class="cl-trust">
          <span class="cl-trust-item">${icon('users')}Casais e singles</span>
          <span class="cl-trust-item">${icon('lock')}Privacidade em primeiro lugar</span>
          <span class="cl-trust-item">${icon('gift')}Entrada gratuita</span>
        </div>
      </div>
      <figure class="cl-hero-media">
        <img src="/landing/hero-masquerade-722.webp" alt="Casal adulto em encontro liberal discreto" width="722" height="361" loading="eager" />
      </figure>
    </section>

    <section class="cl-section cl-alt">
      <div class="cl-alt-copy">
        <h2>Como <em>funciona</em></h2>
        <p>A lógica é simples e pensada para quem não quer se expor: você entra, monta o perfil no seu tempo e só revela o que quiser, para quem quiser.</p>
        <div class="cl-list">
          ${listItemsHtml(comoFuncionaItems(`Filtros por cidade — de ${esc(st.capital)} ao interior de ${esc(st.name)}.`))}
        </div>
      </div>
      <figure class="cl-alt-media">
        <img src="/landing/gaze-couple-722.webp" alt="Casal adulto trocando olhares com discrição" width="722" height="481" loading="lazy" />
      </figure>
    </section>

    <section class="cl-dark">
      <div class="cl-section cl-alt">
        <div class="cl-alt-copy">
          <h2>Sigilo de <em>verdade</em></h2>
          <p>
            Quem vive o meio liberal em ${esc(st.name)} costuma ter a mesma preocupação: ser reconhecido.
            Por isso o sigilo aqui não é promessa de marketing — é como o produto foi construído. As páginas
            que aparecem no Google, como esta, são só informativas: nenhum perfil chega aos resultados de busca.
          </p>
          <div class="cl-list">${listItemsHtml(PRIVACIDADE_ITEMS)}</div>
        </div>
        <figure class="cl-alt-media">
          <img src="/landing/privacy-editorial-722.webp" alt="Retrato em ambiente reservado, simbolizando privacidade" width="722" height="481" loading="lazy" />
        </figure>
      </div>
    </section>

    <section class="cl-section cl-alt">
      <figure class="cl-alt-media">
        <img src="/landing/hero-liberal-party.jpg" alt="Adultos conversando em um encontro social liberal" width="1024" height="768" loading="lazy" />
      </figure>
      <div class="cl-alt-copy">
        <h2>Quem você <em>encontra</em></h2>
        <p>A comunidade reúne três públicos que se procuram — cada perfil indica o que busca, e os filtros fazem o resto.</p>
        <div class="cl-list">${listItemsHtml(audienciaItems(`Buscam troca de casais ou uma terceira pessoa, em ${esc(st.capital)} e em todo o estado.`))}</div>
      </div>
    </section>

    ${cityPages.length ? `<section class="cl-section cl-region">
      <h2>Cidades em ${esc(st.name)}</h2>
      <p>Página própria para quem procura perto de casa.</p>
      <div class="cl-chips">${cityPages.map((c) => `<a href="/swing/${st.slug}/${c.slug}/">Swing em ${esc(c.name)}</a>`).join('')}</div>
    </section>` : ''}

    ${vizinhos.length ? `<section class="cl-section cl-region">
      <h2>Estados vizinhos no ${esc(st.region)}</h2>
      <div class="cl-chips">${vizinhos.map((v) => `<a href="/swing/${v.slug}/">Swing em ${esc(v.name)}</a>`).join('')}</div>
    </section>` : ''}

    ${campaignFaqSection(faqEstado(st))}

    <section class="cl-final">
      <div class="cl-final-inner">
        <div>
          <h2>Seu próximo encontro pode começar com um perfil.</h2>
          <p>Crie sua conta gratuitamente e descubra quem está em ${esc(st.name)} na mesma sintonia.</p>
        </div>
        <div class="cl-final-actions">
          <a class="cl-cta" href="${cadastroUrl(`swing/${st.slug}`)}">Entrar para a comunidade ${icon('arrow')}</a>
          <a class="cl-final-login" href="/login">Já tenho uma conta</a>
        </div>
      </div>
    </section>

    ${campaignFooter(st.slug)}`;

  return campaignDocument({ title, desc, url, geoUf: st.uf, geoPlace: st.name, jsonld, body });
}

function cityPage(city) {
  const st = city.state;
  const url = `${REGIONAL}/swing/${st.slug}/${city.slug}/`;
  const title = melhorTitle([
    `Troca de Casais em ${city.name} (${st.uf}) — Swing e Casais Liberais | NoSigilo`,
    `Troca de Casais em ${city.name} (${st.uf}) — Swing Liberal | NoSigilo`,
    `Troca de Casais em ${city.name} (${st.uf}) — Swing | NoSigilo`,
    `Troca de Casais em ${city.name} (${st.uf}) | NoSigilo`,
  ]);
  const nCidade = numeroCidade(city, st);
  const desc = melhorDesc(nCidade
    ? [
        `Mais de ${fmt(nCidade)} perfis em ${city.name}. Rede adulta discreta de swing, troca de casais e ménage — casais e singles do meio liberal, com sigilo. Cadastro grátis.`,
        `Mais de ${fmt(nCidade)} perfis em ${city.name}. Swing, troca de casais e ménage numa rede adulta discreta, com sigilo de verdade. Cadastro grátis.`,
        `Mais de ${fmt(nCidade)} perfis em ${city.name}. Swing e troca de casais com sigilo. Cadastro grátis.`,
      ]
    : [
        `Rede adulta discreta de swing, troca de casais e ménage em ${city.name}, ${st.name}. Casais e singles do meio liberal, com sigilo. Cadastro grátis.`,
        `Swing, troca de casais e ménage em ${city.name}. Rede adulta discreta, com sigilo de verdade. Cadastro grátis.`,
      ]);

  const jsonld = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      description: desc,
      url,
      inLanguage: 'pt-BR',
      isPartOf: { '@type': 'WebSite', name: 'NoSigilo.net', url: SITE },
      about: { '@type': 'Place', name: `${city.name}, ${st.name}, Brasil` },
      areaServed: { '@type': 'City', name: city.name },
    },
    breadcrumbLd([
      { name: 'Início', path: '/' },
      { name: 'Swing por estado', path: '/swing/' },
      { name: st.name, path: `/swing/${st.slug}/` },
      { name: city.name, path: `/swing/${st.slug}/${city.slug}/` },
    ]),
    faqJsonLd(faqCidade(city, st)),
  ];

  const vizinhas = neighborCities(city);
  const prova = provaSocialCidade(city, st);
  const outrasDoEstado = st.cities.filter((c) => c !== city.name);

  const body = `${campaignHeader()}

    <section class="cl-hero">
      <div class="cl-hero-copy">
        <p class="cl-crumb"><a href="/swing/">Swing por estado</a> › <a href="/swing/${st.slug}/">${esc(st.name)}</a> › ${esc(city.name)}</p>
        <h1>Swing e Troca de Casais em <em>${esc(city.name)}</em></h1>
        <p class="cl-intro">
          Procurando <strong>swing em ${esc(city.name)}</strong> ou <strong>troca de casais em ${esc(city.name)}</strong>?
          O NoSigilo.net reúne o meio liberal de ${esc(city.name)} e região num só lugar, longe da exposição das
          redes sociais comuns — casais liberais, mulheres solteiras e homens solteiros com os mesmos interesses
          para swing, ménage e encontros liberais, com total discrição.
        </p>
        ${prova ? `<p class="cl-prova">${prova}</p>` : ''}
        <a class="cl-cta" href="${cadastroUrl(`swing/${st.slug}/${city.slug}`)}">Criar conta grátis ${icon('arrow')}</a>
        <div class="cl-trust">
          <span class="cl-trust-item">${icon('users')}Casais e singles</span>
          <span class="cl-trust-item">${icon('lock')}Privacidade em primeiro lugar</span>
          <span class="cl-trust-item">${icon('gift')}Entrada gratuita</span>
        </div>
      </div>
      <figure class="cl-hero-media">
        <img src="/landing/hero-masquerade-722.webp" alt="Casal adulto em encontro liberal discreto" width="722" height="361" loading="eager" />
      </figure>
    </section>

    <section class="cl-section cl-alt">
      <div class="cl-alt-copy">
        <h2>Como <em>funciona</em></h2>
        <p>A lógica é simples e pensada para quem não quer se expor: você entra, monta o perfil no seu tempo e só revela o que quiser, para quem quiser.</p>
        <div class="cl-list">
          ${listItemsHtml(comoFuncionaItems(`Filtros por cidade e estado, e a função "Estou Aqui" mostra quem está perto de você em ${esc(city.name)} agora.`))}
        </div>
      </div>
      <figure class="cl-alt-media">
        <img src="/landing/gaze-couple-722.webp" alt="Casal adulto trocando olhares com discrição" width="722" height="481" loading="lazy" />
      </figure>
    </section>

    <section class="cl-dark">
      <div class="cl-section cl-alt">
        <div class="cl-alt-copy">
          <h2>Sigilo de <em>verdade</em></h2>
          <p>
            Quem vive o meio liberal em ${esc(city.name)} costuma ter a mesma preocupação: ser reconhecido.
            Por isso o sigilo aqui não é promessa de marketing — é como o produto foi construído. As páginas
            que aparecem no Google, como esta, são só informativas: nenhum perfil chega aos resultados de busca.
          </p>
          <div class="cl-list">${listItemsHtml(PRIVACIDADE_ITEMS)}</div>
        </div>
        <figure class="cl-alt-media">
          <img src="/landing/privacy-editorial-722.webp" alt="Retrato em ambiente reservado, simbolizando privacidade" width="722" height="481" loading="lazy" />
        </figure>
      </div>
    </section>

    <section class="cl-section cl-alt">
      <figure class="cl-alt-media">
        <img src="/landing/hero-liberal-party.jpg" alt="Adultos conversando em um encontro social liberal" width="1024" height="768" loading="lazy" />
      </figure>
      <div class="cl-alt-copy">
        <h2>Quem você <em>encontra</em></h2>
        <p>A comunidade reúne três públicos que se procuram — cada perfil indica o que busca, e os filtros fazem o resto.</p>
        <div class="cl-list">${listItemsHtml(audienciaItems(`Buscam troca de casais ou uma terceira pessoa, em ${esc(city.name)} e região.`))}</div>
      </div>
    </section>

    <section class="cl-section cl-region">
      <h2>Primeiro encontro liberal: como não errar</h2>
      <p>Vale a mesma etiqueta que sustenta o meio há décadas — e ela protege os dois lados.</p>
      <ul class="cl-etiquette">
        <li><strong>Converse antes.</strong> Alinhe limites, expectativas e o que está fora de cogitação antes de marcar.</li>
        <li><strong>Comece em lugar público.</strong> Um drink em ${esc(city.name)} antes de qualquer coisa reduz o desconforto dos dois lados.</li>
        <li><strong>"Não" encerra o assunto.</strong> Consentimento é contínuo e pode ser retirado a qualquer momento, por qualquer pessoa envolvida.</li>
        <li><strong>Combine com o parceiro.</strong> Nos casais, a regra combinada antes vale mais do que a vontade do momento.</li>
        <li><strong>Discrição é mão dupla.</strong> Não comente, não fotografe, não exponha quem você conheceu.</li>
      </ul>
    </section>

    <section class="cl-section cl-region">
      <h2>Veja também</h2>
      <p>Perfis do meio liberal em todo o estado${outrasDoEstado.length ? `, incluindo ${esc(list(outrasDoEstado))}` : ''}.</p>
      <div class="cl-chips">
        <a href="/swing/${st.slug}/">Swing em ${esc(st.name)}</a>
        ${vizinhas.map((c) => `<a href="/swing/${c.state.slug}/${c.slug}/">Swing em ${esc(c.name)}</a>`).join('')}
      </div>
    </section>

    ${campaignFaqSection(faqCidade(city, st))}

    <section class="cl-final">
      <div class="cl-final-inner">
        <div>
          <h2>Seu próximo encontro pode começar com um perfil.</h2>
          <p>Crie sua conta gratuitamente e descubra quem está em ${esc(city.name)} na mesma sintonia.</p>
        </div>
        <div class="cl-final-actions">
          <a class="cl-cta" href="${cadastroUrl(`swing/${st.slug}/${city.slug}`)}">Entrar para a comunidade ${icon('arrow')}</a>
          <a class="cl-final-login" href="/login">Já tenho uma conta</a>
        </div>
      </div>
    </section>

    ${campaignFooter(st.slug)}`;

  return campaignDocument({ title, desc, url, geoUf: st.uf, geoPlace: city.name, jsonld, body });
}

function hubPage() {
  const title = 'Swing e Troca de Casais por Estado no Brasil | NoSigilo.net';
  const nBrasil = STATS?.nacional ? arredondaParaBaixo(STATS.nacional) : 0;
  const desc = melhorDesc([
    nBrasil
      ? `Mais de ${fmt(nBrasil)} perfis no Brasil. Swing, troca de casais e ménage por estado e cidade — rede adulta discreta, com sigilo. Cadastro grátis.`
      : 'Swing, troca de casais e ménage por estado e cidade. Rede adulta discreta para o meio liberal brasileiro, com sigilo. Cadastro grátis.',
    'Swing, troca de casais e ménage por estado e cidade. Rede adulta discreta, com sigilo. Cadastro grátis.',
  ]);
  const url = `${REGIONAL}/swing/`;
  const byRegion = {};
  for (const s of SELECTED_STATES) (byRegion[s.region] ||= []).push(s);
  const order = ['Sudeste', 'Sul', 'Nordeste', 'Centro-Oeste', 'Norte'].filter((r) => byRegion[r]?.length);

  // O hub e a porta de entrada do cluster regional: o ItemList diz ao Google
  // que estas 27 paginas formam um conjunto, e nao paginas soltas.
  const jsonld = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: title,
      description: desc,
      url,
      inLanguage: 'pt-BR',
      isPartOf: { '@type': 'WebSite', name: 'NoSigilo.net', url: SITE },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: SELECTED_STATES.length,
        itemListElement: SELECTED_STATES.map((st, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: `Swing e troca de casais em ${st.name}`,
          url: `${SITE}/swing/${st.slug}/`,
        })),
      },
    },
    breadcrumbLd([
      { name: 'Início', path: '/' },
      { name: 'Swing por estado', path: '/swing/' },
    ]),
    faqJsonLd(faqHub()),
  ];

  const prova = nBrasil ? `<strong>Mais de ${fmt(nBrasil)} perfis no Brasil</strong> já fazem parte da comunidade.` : '';

  // O diretório de estados e o motivo de a pagina existir — fica logo apos o
  // hero, antes do conteudo institucional, para nao enterrar a navegacao.
  const regionSections = order.map((reg) => `
      <div class="cl-chips" style="margin-bottom:1.4rem;">
        <span style="width:100%;font-weight:800;font-family:Georgia,serif;font-size:1.05rem;color:#700c20;margin-bottom:.4rem;display:block;">${esc(reg)}</span>
        ${byRegion[reg].map((s) => `<a href="/swing/${s.slug}/">${esc(s.name)}</a>`).join('')}
      </div>`).join('');

  const body = `${campaignHeader()}

    <section class="cl-hero">
      <div class="cl-hero-copy">
        <p class="cl-crumb"><a href="/swing/">Swing por estado</a></p>
        <h1>Swing e Troca de Casais <em>por Estado</em></h1>
        <p class="cl-intro">
          O NoSigilo.net conecta o meio liberal brasileiro em todo o país. Escolha seu estado e encontre
          casais e singles para swing, troca de casais e ménage, com sigilo e privacidade de verdade.
        </p>
        ${prova ? `<p class="cl-prova">${prova}</p>` : ''}
        <a class="cl-cta" href="${cadastroUrl(`swing`)}">Criar conta grátis ${icon('arrow')}</a>
        <div class="cl-trust">
          <span class="cl-trust-item">${icon('users')}Casais e singles</span>
          <span class="cl-trust-item">${icon('lock')}Privacidade em primeiro lugar</span>
          <span class="cl-trust-item">${icon('gift')}Entrada gratuita</span>
        </div>
      </div>
      <figure class="cl-hero-media">
        <img src="/landing/hero-masquerade-722.webp" alt="Casal adulto em encontro liberal discreto" width="722" height="361" loading="eager" />
      </figure>
    </section>

    <section class="cl-section cl-region" style="border-top:1px solid #ead7d3;">
      <h2>Escolha seu estado</h2>
      <p>27 unidades da federação, mais páginas de capitais e cidades onde a comunidade já tem gente de verdade.</p>
      ${regionSections}
    </section>

    <section class="cl-section cl-alt">
      <div class="cl-alt-copy">
        <h2>Como <em>funciona</em></h2>
        <p>A lógica é simples e pensada para quem não quer se expor: você entra, monta o perfil no seu tempo e só revela o que quiser, para quem quiser.</p>
        <div class="cl-list">
          ${listItemsHtml(comoFuncionaItems('Filtros por cidade e estado, em qualquer lugar do Brasil.'))}
        </div>
      </div>
      <figure class="cl-alt-media">
        <img src="/landing/gaze-couple-722.webp" alt="Casal adulto trocando olhares com discrição" width="722" height="481" loading="lazy" />
      </figure>
    </section>

    <section class="cl-dark">
      <div class="cl-section cl-alt">
        <div class="cl-alt-copy">
          <h2>Sigilo de <em>verdade</em></h2>
          <p>
            A preocupação de quem vive o meio liberal é sempre a mesma: ser reconhecido. Por isso o sigilo aqui
            não é promessa de marketing — é como o produto foi construído. As páginas que aparecem no Google,
            como esta, são só informativas: nenhum perfil chega aos resultados de busca.
          </p>
          <div class="cl-list">${listItemsHtml(PRIVACIDADE_ITEMS)}</div>
        </div>
        <figure class="cl-alt-media">
          <img src="/landing/privacy-editorial-722.webp" alt="Retrato em ambiente reservado, simbolizando privacidade" width="722" height="481" loading="lazy" />
        </figure>
      </div>
    </section>

    <section class="cl-section cl-alt">
      <figure class="cl-alt-media">
        <img src="/landing/hero-liberal-party.jpg" alt="Adultos conversando em um encontro social liberal" width="1024" height="768" loading="lazy" />
      </figure>
      <div class="cl-alt-copy">
        <h2>Quem você <em>encontra</em></h2>
        <p>A comunidade reúne três públicos que se procuram — cada perfil indica o que busca, e os filtros fazem o resto.</p>
        <div class="cl-list">${listItemsHtml(audienciaItems('Buscam troca de casais ou uma terceira pessoa, em qualquer estado do Brasil.'))}</div>
      </div>
    </section>

    ${campaignFaqSection(faqHub())}

    <section class="cl-final">
      <div class="cl-final-inner">
        <div>
          <h2>Seu próximo encontro pode começar com um perfil.</h2>
          <p>Crie sua conta gratuitamente e descubra quem está na mesma sintonia perto de você.</p>
        </div>
        <div class="cl-final-actions">
          <a class="cl-cta" href="${cadastroUrl(`swing`)}">Entrar para a comunidade ${icon('arrow')}</a>
          <a class="cl-final-login" href="/login">Já tenho uma conta</a>
        </div>
      </div>
    </section>

    ${campaignFooter(null)}`;

  return campaignDocument({ title, desc, url, geoUf: '', geoPlace: '', jsonld, body });
}

// ---------------------------------------------------------------------------
//  lastmod que nao mente
// ---------------------------------------------------------------------------
// Antes o sitemap carimbava a data de hoje em todas as URLs, em toda execucao.
// Enquanto o gerador so rodava junto com um deploy isso passava; com uma rotina
// periodica viraria mentira diaria — 142 paginas jurando que mudaram sem terem
// mudado. O Google desconta o lastmod de quem faz isso e ainda gasta rastreio
// a toa, entao o efeito seria o oposto do pretendido.
//
// Agora a data vem do conteudo: guardamos o hash de cada pagina em
// seo-lastmod.json e a data em que ele mudou pela ultima vez. Pagina igual
// mantem a data antiga.
//
// Isso combina bem com o arredondamento para baixo da prova social: Fortaleza
// so muda de "Mais de 800" para "Mais de 900" ao cruzar a casa dos 900, entao
// a rotina pode rodar todo dia e quase nunca mexer em nada — que e exatamente
// o sinal honesto a se mandar.
//
// Onde esse estado mora: no Postgres, tabela seo_lastmod. O arquivo
// seo-lastmod.json continua sendo escrito, mas so como espelho — vale quando
// o banco nao responde ou quando o gerador roda fora do servidor.
//
// Versionar o arquivo no git nao daria certo: a rotina do cron o reescreveria
// toda madrugada, sujando a arvore e brigando com o git pull. E deixa-lo so
// no disco perderia a historia num clone novo ou num servidor recriado — e
// perder a historia significa carimbar "mudou hoje" nas 142 paginas de uma vez,
// exatamente a mentira que este mecanismo existe para evitar. O banco resolve
// os dois: nao passa pelo git e sobrevive ao repositorio.
//
// A tabela e criada aqui, e nao em backend/pg-migrations, de proposito: e
// estado de ferramenta de build, nao do aplicativo. Ninguem no backend le
// isso, e assim o gerador nao depende de o backend ter subido e migrado antes.
const LASTMOD_FILE = resolve(__dirname, 'seo-lastmod.json');
const SQL_CRIA_LASTMOD = `
  CREATE TABLE IF NOT EXISTS seo_lastmod (
    path    TEXT PRIMARY KEY,
    hash    TEXT NOT NULL,
    lastmod TEXT NOT NULL
  );
`;

function lastmodDoBanco() {
  if (SEM_BANCO) return null;
  try {
    const out = psql(SQL_CRIA_LASTMOD + `
      SELECT COALESCE(json_object_agg(path, json_build_object('hash', hash, 'lastmod', lastmod)), '{}')::text
      FROM seo_lastmod;
    `);
    return JSON.parse(ultimaLinha(out));
  } catch (e) {
    console.warn(`[seo] seo_lastmod indisponivel (${String(e.message).split(String.fromCharCode(10))[0]}) — usando o espelho local`);
    return null;
  }
}

/** Grava de volta. Os valores sao validados por formato antes de entrar na
 *  query: caminho de slug, hash hexadecimal e data ISO nao tem aspas nem
 *  ponto-e-virgula, entao interpolar aqui e seguro sem um driver de verdade.
 *  O que nao casar com o formato fica de fora em vez de ser escapado — se
 *  apareceu algo estranho, o certo e nao gravar. */
function gravaLastmodNoBanco(mapa) {
  if (SEM_BANCO) return false;
  const ok = (chave, v) => /^\/[a-z0-9\/-]*$/.test(chave)
    && /^([a-f0-9]{16}|externo)$/.test(v.hash)
    && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(v.lastmod);
  const valores = Object.entries(mapa).filter(([k, v]) => ok(k, v))
    .map(([k, v]) => `('${k}','${v.hash}','${v.lastmod}')`);
  if (!valores.length) return false;
  try {
    psql(SQL_CRIA_LASTMOD + `
      INSERT INTO seo_lastmod (path, hash, lastmod) VALUES ${valores.join(',')}
      ON CONFLICT (path) DO UPDATE SET hash = EXCLUDED.hash, lastmod = EXCLUDED.lastmod;
    `);
    return true;
  } catch (e) {
    console.warn(`[seo] nao consegui gravar seo_lastmod (${String(e.message).split(String.fromCharCode(10))[0]})`);
    return false;
  }
}

let LASTMOD = lastmodDoBanco();
let LASTMOD_NO_BANCO = LASTMOD !== null;
if (!LASTMOD_NO_BANCO) {
  try { LASTMOD = JSON.parse(readFileSync(LASTMOD_FILE, 'utf8')); } catch { LASTMOD = {}; }
}

const hashDe = (txt) => createHash('sha1').update(txt).digest('hex').slice(0, 16);

/** Escreve a pagina se ela mudou (ou se o arquivo nao existe, caso do dist
 *  recem-limpo pelo vite) e devolve a data da ultima mudanca real de conteudo.
 *  Reparar na ordem: a data depende so do hash, nunca da existencia do arquivo
 *  — senao todo `vite build`, que apaga o dist, empurraria a data para hoje. */
let mudaram = 0;
function publica(chave, arquivo, html) {
  const h = hashDe(html);
  const anterior = LASTMOD[chave];
  const mudou = !anterior || anterior.hash !== h;
  if (mudou) { LASTMOD[chave] = { hash: h, lastmod: TODAY }; mudaram++; }
  if (mudou || !existsSync(arquivo)) writeFileSync(arquivo, html, 'utf8');
  return LASTMOD[chave].lastmod;
}

/** Paginas que este gerador nao produz (home, cadastro, institucionais). Nao da
 *  para saber daqui se o texto delas mudou, entao a data e fixada na primeira
 *  execucao e mantida. Mudou Termos ou Privacidade de verdade? Apague a linha
 *  correspondente em seo-lastmod.json e a proxima execucao recarimba. */
function dataFixa(chave) {
  if (!LASTMOD[chave]) LASTMOD[chave] = { hash: 'externo', lastmod: TODAY };
  return LASTMOD[chave].lastmod;
}

function sitemap() {
  const base = [
    { loc: `${SITE}/`, freq: 'weekly', pri: '1.0' },
    { loc: `${REGIONAL}/swing/`, freq: 'weekly', pri: '0.9' },
    { loc: `${SITE}/register`, freq: 'monthly', pri: '0.9' },
    { loc: `${SITE}/login`, freq: 'monthly', pri: '0.7' },
    { loc: `${SITE}/subscriptions`, freq: 'monthly', pri: '0.8' },
    { loc: `${SITE}/terms`, freq: 'yearly', pri: '0.4' },
    { loc: `${SITE}/privacy`, freq: 'yearly', pri: '0.4' },
    { loc: `${SITE}/guidelines`, freq: 'yearly', pri: '0.4' },
  ];
  const stateUrls = SELECTED_STATES.map((s) => ({ loc: `${REGIONAL}/swing/${s.slug}/`, freq: 'monthly', pri: '0.8', chave: `/swing/${s.slug}/` }));
  const cityUrls = SELECTED_CITIES.map((c) => ({ loc: `${REGIONAL}/swing/${c.state.slug}/${c.slug}/`, freq: 'monthly', pri: '0.7', chave: `/swing/${c.state.slug}/${c.slug}/` }));
  const urls = [...base, ...stateUrls, ...cityUrls]
    .map((u) => {
      const quando = u.chave ? (LASTMOD[u.chave]?.lastmod || TODAY) : dataFixa(new URL(u.loc).pathname);
      return `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${quando}</lastmod>\n    <changefreq>${u.freq}</changefreq>\n    <priority>${u.pri}</priority>\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

// --- escreve os arquivos ---
const inedito = Object.keys(LASTMOD).length === 0;

let stateCount = 0;
for (const st of SELECTED_STATES) {
  const dir = resolve(DIST, 'swing', st.slug);
  mkdirSync(dir, { recursive: true });
  publica(`/swing/${st.slug}/`, resolve(dir, 'index.html'), statePage(st));
  stateCount++;
}

let cityCount = 0;
for (const city of SELECTED_CITIES) {
  const dir = resolve(DIST, 'swing', city.state.slug, city.slug);
  mkdirSync(dir, { recursive: true });
  publica(`/swing/${city.state.slug}/${city.slug}/`, resolve(dir, 'index.html'), cityPage(city));
  cityCount++;
}

mkdirSync(resolve(DIST, 'swing'), { recursive: true });
publica('/swing/', resolve(DIST, 'swing', 'index.html'), hubPage());

// O sitemap le o LASTMOD ja preenchido pelas chamadas acima, entao vem depois.
writeFileSync(resolve(DIST, 'sitemap.xml'), sitemap(), 'utf8');
const gravou = gravaLastmodNoBanco(LASTMOD);
// O arquivo e escrito de qualquer jeito: espelho para quando o banco faltar.
writeFileSync(LASTMOD_FILE, JSON.stringify(LASTMOD, null, 2) + String.fromCharCode(10), 'utf8');

console.log(`[seo] ${stateCount} estado(s) + ${cityCount} cidade(s) + hub /swing/ + sitemap.xml gerados em ${OUT_DIR_NAME}/`);
console.log(inedito
  ? `[seo] seo-lastmod.json criado com ${Object.keys(LASTMOD).length} pagina(s)`
  : `[seo] ${mudaram} pagina(s) mudaram de conteudo — as outras ${Object.keys(LASTMOD).length - mudaram} mantiveram o lastmod anterior`);
console.log(`[seo] lastmod guardado em ${gravou ? 'seo_lastmod (Postgres)' : 'seo-lastmod.json (banco indisponivel)'}`);

// Gera páginas estáticas de SEO por estado (UF) em dist/swing/{slug}/index.html
// Rodado automaticamente após o `vite build` (ver package.json -> "build").
// São páginas HTML reais, indexáveis por Bing/Google sem depender de JavaScript,
// que funcionam como funil: o conteúdo regional atrai a busca e os CTAs levam ao app.
//
// Também regenera dist/sitemap.xml com a home + páginas institucionais + todos os estados.

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
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

/** Número de perfis da cidade, ou 0 se não atinge o mínimo. Usado na meta
 *  description: no resultado da busca, "Mais de 800 perfis em Fortaleza" é o
 *  único argumento que um concorrente não consegue copiar. As páginas de
 *  cidade estavam aparecendo com impressão e zero clique — snippet genérico
 *  não convence ninguém a clicar. */
/** O Google corta a description por volta de 155 caracteres e substitui o resto
 *  por reticências — uma frase cortada no meio custa clique. Esta função recebe
 *  as variantes em ordem de preferência (da mais informativa à mais enxuta) e
 *  devolve a primeira que couber, em vez de truncar no meio da palavra. */
function melhorDesc(variantes) {
  const CABE = 155;
  return variantes.find((d) => [...d].length <= CABE) || variantes[variantes.length - 1];
}

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
  'ceara': [
    { name: 'Fortaleza', slug: 'fortaleza' },
    { name: 'Maracanaú', slug: 'maracanau' },
    { name: 'Sobral', slug: 'sobral' },
    { name: 'Juazeiro do Norte', slug: 'juazeiro-do-norte' },
    { name: 'Caucaia', slug: 'caucaia' },
    { name: 'Eusébio', slug: 'eusebio' },
    { name: 'Tianguá', slug: 'tiangua' },
    { name: 'Iguatu', slug: 'iguatu' },
  ],
  'rondonia': [
    { name: 'Porto Velho', slug: 'porto-velho' },
    { name: 'Ariquemes', slug: 'ariquemes' },
  ],
  'sao-paulo': [
    { name: 'São Paulo', slug: 'sao-paulo' },
    { name: 'Guarulhos', slug: 'guarulhos' },
    { name: 'Campinas', slug: 'campinas' },
    { name: 'Ribeirão Preto', slug: 'ribeirao-preto' },
  ],
  'pernambuco': [
    { name: 'Recife', slug: 'recife' },
    { name: 'Caruaru', slug: 'caruaru' },
    { name: 'Jaboatão dos Guararapes', slug: 'jaboatao-dos-guararapes' },
    { name: 'Petrolina', slug: 'petrolina' },
    { name: 'Paulista', slug: 'paulista' },
    { name: 'Olinda', slug: 'olinda' },
  ],
  'paraiba': [
    { name: 'Campina Grande', slug: 'campina-grande' },
    { name: 'João Pessoa', slug: 'joao-pessoa' },
  ],
  'rio-grande-do-norte': [
    { name: 'Natal', slug: 'natal' },
    { name: 'Mossoró', slug: 'mossoro' },
  ],
  'amazonas': [{ name: 'Manaus', slug: 'manaus' }],
  'rio-de-janeiro': [{ name: 'Rio de Janeiro', slug: 'rio-de-janeiro' }],
  'minas-gerais': [
    { name: 'Belo Horizonte', slug: 'belo-horizonte' },
    { name: 'Contagem', slug: 'contagem' },
  ],
  'maranhao': [
    { name: 'São Luís', slug: 'sao-luis' },
    { name: 'Imperatriz', slug: 'imperatriz' },
  ],
  'piaui': [{ name: 'Teresina', slug: 'teresina' }],
  'bahia': [{ name: 'Salvador', slug: 'salvador' }],
  'parana': [{ name: 'Curitiba', slug: 'curitiba' }],
  'rio-grande-do-sul': [{ name: 'Porto Alegre', slug: 'porto-alegre' }],
  'para': [{ name: 'Belém', slug: 'belem' }],
  'espirito-santo': [
    { name: 'Vila Velha', slug: 'vila-velha' },
    { name: 'Vitória', slug: 'vitoria' },
    { name: 'Serra', slug: 'serra' },
  ],
  'goias': [{ name: 'Goiânia', slug: 'goiania' }],
  'alagoas': [{ name: 'Maceió', slug: 'maceio' }],
  'distrito-federal': [{ name: 'Brasília', slug: 'brasilia' }],
  'roraima': [{ name: 'Boa Vista', slug: 'boa-vista' }],
  'santa-catarina': [
    { name: 'Joinville', slug: 'joinville' },
    { name: 'Florianópolis', slug: 'florianopolis' },
  ],
  'mato-grosso-do-sul': [{ name: 'Campo Grande', slug: 'campo-grande' }],
  'mato-grosso': [{ name: 'Cuiabá', slug: 'cuiaba' }],
  // Capitais com poucos perfis. Mantidas porque quem busca "swing aracaju"
  // precisa achar alguma coisa — mas a regra de corte faz a pagina exibir o
  // numero nacional, nunca o local.
  'sergipe': [{ name: 'Aracaju', slug: 'aracaju' }],
  'tocantins': [{ name: 'Palmas', slug: 'palmas' }],
  'amapa': [{ name: 'Macapá', slug: 'macapa' }],
  'acre': [{ name: 'Rio Branco', slug: 'rio-branco' }],
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

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const list = (arr) => {
  if (arr.length === 1) return arr[0];
  return arr.slice(0, -1).join(', ') + ' e ' + arr[arr.length - 1];
};

/** Links para os estados publicados (rodapé de cada página → ajuda o crawler a achar todas). */
function statesNav(currentSlug) {
  return SELECTED_STATES.map((s) =>
    s.slug === currentSlug
      ? `<strong style="color:#eb4778;">${esc(s.name)}</strong>`
      : `<a href="${REGIONAL}/swing/${s.slug}/" style="color:#b9b9c0;">${esc(s.name)}</a>`
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

/** FAQ: HTML em <details> (expansível sem JavaScript) + o JSON-LD.
 *
 *  NOTA: desde agosto/2023 o Google restringiu o rich result de FAQ a sites
 *  governamentais e de saúde reconhecidos, então NÃO espere os blocos
 *  expansíveis no resultado. O que isto entrega é conteúdo que responde buscas
 *  de cauda longa, profundidade real na página e material que o Google cita
 *  nas AI Overviews. */
function faqSection(itens) {
  const html = `
      <h2>Perguntas frequentes</h2>
      <div class="faq">
        ${itens.map((q) => `<details>
          <summary>${esc(q.p)}</summary>
          <p>${q.r}</p>
        </details>`).join('')}
      </div>`;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: itens.map((q) => ({
      '@type': 'Question',
      name: q.p,
      acceptedAnswer: { '@type': 'Answer', text: String(q.r).replace(/<[^>]*>/g, '') },
    })),
  };
  return { html, ld };
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

function statePage(st) {
  const cities = list(st.cities);
  const cityPages = citiesOf(st.slug);
  const cityLinksBlock = cityPages.length
    ? `\n      <h2>Cidades em ${esc(st.name)}</h2>\n      <div class="states">${cityPages.map((c) => `<a href="${REGIONAL}/swing/${st.slug}/${c.slug}/" style="color:#eb4778;">Swing em ${esc(c.name)}</a>`).join(' · ')}</div>\n`
    : '';
  const title = `Swing e Troca de Casais em ${st.name} (${st.uf}) | NoSigilo.net`;
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

  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description: desc,
    url,
    inLanguage: 'pt-BR',
    isPartOf: { '@type': 'WebSite', name: 'NoSigilo.net', url: SITE },
    about: { '@type': 'Place', name: `${st.name}, Brasil` },
    areaServed: { '@type': 'AdministrativeArea', name: st.name },
  };

  const faq = faqSection(faqEstado(st));
  const trilha = breadcrumbLd([
    { name: 'Início', path: '/' },
    { name: 'Swing por estado', path: '/swing/' },
    { name: st.name, path: `/swing/${st.slug}/` },
  ]);
  const vizinhos = neighborStates(st);
  const prova = provaSocialEstado(st);

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
  <meta name="geo.region" content="BR-${st.uf}" />
  <meta name="geo.placename" content="${esc(st.name)}" />
  <link rel="canonical" href="${url}" />
  <link rel="icon" type="image/jpeg" href="/icon.jpg" />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="pt_BR" />
  <meta property="og:site_name" content="NoSigilo.net" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${esc(`Swing e Troca de Casais em ${st.name}`)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:image" content="${REGIONAL}/icon.jpg" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(`Swing e Troca de Casais em ${st.name}`)}" />
  <meta name="twitter:description" content="${esc(desc)}" />
  <meta name="twitter:image" content="${REGIONAL}/icon.jpg" />
  <meta name="theme-color" content="#eb4778" />
  <script type="application/ld+json">${JSON.stringify([jsonld, trilha, faq.ld])}</script>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin:0; background:#09090b; color:#e7e7ea; font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; line-height:1.65; }
    a { color:#eb4778; }
    .wrap { max-width:880px; margin:0 auto; padding:28px 20px 56px; }
    header.top { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:28px; }
    .brand { font-weight:800; font-size:20px; color:#fff; text-decoration:none; }
    .cta { display:inline-block; background:#eb4778; color:#fff; font-weight:700; text-decoration:none; padding:10px 18px; border-radius:999px; }
    .cta.outline { background:transparent; border:1px solid #eb477855; color:#eb4778; }
    h1 { font-size:30px; line-height:1.25; font-weight:800; margin:0 0 14px; }
    h1 span { color:#eb4778; }
    h2 { font-size:21px; font-weight:700; margin:30px 0 10px; }
    p { color:#c7c7cf; }
    .lead { font-size:17px; color:#d9d9df; }
    ul { color:#c7c7cf; padding-left:20px; }
    li { margin:6px 0; }
    .chips { display:flex; flex-wrap:wrap; gap:8px; margin:14px 0; }
    .chip { border:1px solid #2a2a30; background:#141418; border-radius:999px; padding:5px 12px; font-size:13px; color:#b9b9c0; }
    .ctas { display:flex; flex-wrap:wrap; gap:12px; margin:26px 0; }
    .box { background:#141418; border:1px solid #26262c; border-radius:16px; padding:20px; margin-top:22px; }
    footer { margin-top:40px; padding-top:24px; border-top:1px solid #26262c; font-size:13px; color:#9a9aa2; }
    .faq details { border:1px solid #26262c; border-radius:12px; padding:14px 16px; margin:10px 0; background:#111114; }
    .faq summary { cursor:pointer; font-weight:600; color:#e7e7ea; }
    .faq details p { margin:10px 0 0; }
    .links { display:flex; flex-wrap:wrap; gap:10px; margin-top:10px; }
    .prova { background:#1a1015; border:1px solid #eb477833; border-left:3px solid #eb4778; border-radius:12px; padding:14px 16px; color:#e7e7ea; }
    .links a { background:#141418; border:1px solid #26262c; border-radius:999px; padding:7px 14px; text-decoration:none; font-size:14px; }
    .states { font-size:13px; line-height:2; margin-top:14px; }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="top">
      <a class="brand" href="/">NoSigilo<span style="color:#eb4778;">.net</span></a>
      <a class="cta" href="/register">Criar conta grátis</a>
    </header>

    <main>
      <h1>Swing e Troca de Casais em <span>${esc(st.name)}</span></h1>
      <p class="lead">
        A rede social adulta e discreta para casais, mulheres e homens solteiros do meio liberal
        em ${esc(st.name)} e região ${esc(st.region)}. Conexões reais com sigilo, privacidade e respeito.
      </p>

      <div class="chips">
        ${st.cities.map((c) => `<span class="chip">Swing ${esc(c)}</span>`).join('\n        ')}
      </div>

${prova ? `
      <p class="prova">${prova}</p>` : ''}

      <p>
        Procurando <strong>swing em ${esc(st.name)}</strong> ou <strong>troca de casais em ${esc(st.capital)}</strong>?
        O <strong>NoSigilo.net</strong> reúne o meio liberal de ${esc(cities)} num só lugar, longe da exposição
        das redes sociais comuns. Aqui casais liberais e singles encontram pessoas com os mesmos interesses
        para swing, ménage e encontros liberais — com total discrição.
      </p>

      <h2>Por que usar o NoSigilo em ${esc(st.name)}</h2>
      <ul>
        <li><strong>Perfis reais do meio liberal</strong> em ${esc(st.capital)} e em todo o estado de ${esc(st.name)}.</li>
        <li><strong>Função "Estou Aqui"</strong> — encontre casais e singles próximos de você em tempo real.</li>
        <li><strong>Fotos públicas e privadas</strong> — você decide quem vê o que é mais íntimo.</li>
        <li><strong>Mensagens com visualização única</strong> — conteúdos que somem depois de vistos.</li>
        <li><strong>Cadastro gratuito</strong> e ambiente selecionado, discreto e respeitoso.</li>
      </ul>

      <div class="ctas">
        <a class="cta" href="/register">Criar conta grátis</a>
        <a class="cta outline" href="/login">Já tenho conta</a>
      </div>

      <div class="box">
        <h2 style="margin-top:0;">Swing e ménage em ${esc(st.name)}</h2>
        <p style="margin-bottom:0;">
          Além da troca de casais, o NoSigilo acolhe quem busca <strong>ménage em ${esc(st.name)}</strong>,
          relacionamentos abertos e encontros esporádicos liberais entre adultos consentidos —
          em ${esc(cities)} e demais cidades do estado.
        </p>
      </div>

      <h2>Como funciona</h2>
      <ol>
        <li><strong>Crie o perfil</strong> — gratuito, indicando se você é casal, mulher solteira ou homem solteiro.</li>
        <li><strong>Separe o público do íntimo</strong> — fotos privadas só abrem para quem você liberar.</li>
        <li><strong>Filtre por cidade</strong> — de ${esc(st.capital)} ao interior de ${esc(st.name)}.</li>
        <li><strong>Converse com calma</strong> — com visualização única para o que é mais sensível.</li>
      </ol>

      <h2>Privacidade em primeiro lugar</h2>
      <p>
        A preocupação de quem vive o meio liberal em ${esc(st.name)} é sempre a mesma: ser reconhecido.
        Por isso os perfis não são indexados por buscadores, as fotos íntimas ficam atrás de liberação
        individual e o conteúdo mais sensível pode ser enviado com visualização única. As páginas que
        aparecem no Google, como esta, são apenas informativas.
      </p>
${faq.html}
${cityLinksBlock}
${vizinhos.length ? `
      <h2>Estados vizinhos no ${esc(st.region)}</h2>
      <div class="links">${vizinhos.map((v) => `<a href="/swing/${v.slug}/">Swing em ${esc(v.name)}</a>`).join('')}</div>
` : ''}
    </main>

    <footer>
      <p>Swing e troca de casais em outros estados:</p>
      <div class="states">${statesNav(st.slug)}</div>
      <p style="margin-top:20px;">
        <a href="/">Início</a> ·
        <a href="/terms">Termos de Uso</a> ·
        <a href="/privacy">Privacidade</a> ·
        <a href="/guidelines">Diretrizes</a>
        <br />© ${new Date().getFullYear()} NoSigilo.net — conteúdo adulto (18+). Todos os direitos reservados.
      </p>
    </footer>
  </div>
</body>
</html>
`;
}

function cityPage(city) {
  const st = city.state;
  const url = `${REGIONAL}/swing/${st.slug}/${city.slug}/`;
  const title = `Swing e Troca de Casais em ${city.name} (${st.uf}) | NoSigilo.net`;
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

  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description: desc,
    url,
    inLanguage: 'pt-BR',
    isPartOf: { '@type': 'WebSite', name: 'NoSigilo.net', url: SITE },
    about: { '@type': 'Place', name: `${city.name}, ${st.name}, Brasil` },
    areaServed: { '@type': 'City', name: city.name },
  };

  const faq = faqSection(faqCidade(city, st));
  const trilha = breadcrumbLd([
    { name: 'Início', path: '/' },
    { name: 'Swing por estado', path: '/swing/' },
    { name: st.name, path: `/swing/${st.slug}/` },
    { name: city.name, path: `/swing/${st.slug}/${city.slug}/` },
  ]);
  const vizinhas = neighborCities(city);
  const prova = provaSocialCidade(city, st);
  const outrasDoEstado = st.cities.filter((c) => c !== city.name);

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
  <meta name="geo.region" content="BR-${st.uf}" />
  <meta name="geo.placename" content="${esc(city.name)}" />
  <link rel="canonical" href="${url}" />
  <link rel="icon" type="image/jpeg" href="/icon.jpg" />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="pt_BR" />
  <meta property="og:site_name" content="NoSigilo.net" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${esc(`Swing e Troca de Casais em ${city.name}`)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:image" content="${REGIONAL}/icon.jpg" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(`Swing e Troca de Casais em ${city.name}`)}" />
  <meta name="twitter:description" content="${esc(desc)}" />
  <meta name="twitter:image" content="${REGIONAL}/icon.jpg" />
  <meta name="theme-color" content="#eb4778" />
  <script type="application/ld+json">${JSON.stringify([jsonld, trilha, faq.ld])}</script>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin:0; background:#09090b; color:#e7e7ea; font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; line-height:1.65; }
    a { color:#eb4778; }
    .wrap { max-width:880px; margin:0 auto; padding:28px 20px 56px; }
    header.top { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:28px; }
    .brand { font-weight:800; font-size:20px; color:#fff; text-decoration:none; }
    .cta { display:inline-block; background:#eb4778; color:#fff; font-weight:700; text-decoration:none; padding:10px 18px; border-radius:999px; }
    .cta.outline { background:transparent; border:1px solid #eb477855; color:#eb4778; }
    .crumb { font-size:13px; color:#9a9aa2; margin-bottom:8px; }
    h1 { font-size:30px; line-height:1.25; font-weight:800; margin:0 0 14px; }
    h1 span { color:#eb4778; }
    h2 { font-size:21px; font-weight:700; margin:30px 0 10px; }
    p { color:#c7c7cf; }
    .lead { font-size:17px; color:#d9d9df; }
    ul { color:#c7c7cf; padding-left:20px; }
    li { margin:6px 0; }
    .ctas { display:flex; flex-wrap:wrap; gap:12px; margin:26px 0; }
    .box { background:#141418; border:1px solid #26262c; border-radius:16px; padding:20px; margin-top:22px; }
    footer { margin-top:40px; padding-top:24px; border-top:1px solid #26262c; font-size:13px; color:#9a9aa2; }
    .faq details { border:1px solid #26262c; border-radius:12px; padding:14px 16px; margin:10px 0; background:#111114; }
    .faq summary { cursor:pointer; font-weight:600; color:#e7e7ea; }
    .faq details p { margin:10px 0 0; }
    .links { display:flex; flex-wrap:wrap; gap:10px; margin-top:10px; }
    .prova { background:#1a1015; border:1px solid #eb477833; border-left:3px solid #eb4778; border-radius:12px; padding:14px 16px; color:#e7e7ea; }
    .links a { background:#141418; border:1px solid #26262c; border-radius:999px; padding:7px 14px; text-decoration:none; font-size:14px; }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="top">
      <a class="brand" href="/">NoSigilo<span style="color:#eb4778;">.net</span></a>
      <a class="cta" href="/register">Criar conta grátis</a>
    </header>

    <main>
      <p class="crumb"><a href="/swing/" style="color:#9a9aa2;">Swing por estado</a> › <a href="/swing/${st.slug}/" style="color:#9a9aa2;">${esc(st.name)}</a> › ${esc(city.name)}</p>
      <h1>Swing e Troca de Casais em <span>${esc(city.name)}</span></h1>
      <p class="lead">
        A rede social adulta e discreta para casais, mulheres e homens solteiros do meio liberal
        em ${esc(city.name)}, ${esc(st.name)}. Conexões reais com sigilo, privacidade e respeito.
      </p>

${prova ? `
      <p class="prova">${prova}</p>` : ''}

      <p>
        Procurando <strong>swing em ${esc(city.name)}</strong> ou <strong>troca de casais em ${esc(city.name)}</strong>?
        O <strong>NoSigilo.net</strong> reúne o meio liberal de ${esc(city.name)} e região num só lugar,
        longe da exposição das redes sociais comuns. Casais liberais e singles encontram pessoas com os
        mesmos interesses para swing, ménage e encontros liberais — com total discrição.
      </p>

      <h2>Como funciona</h2>
      <p>
        A lógica é simples e pensada para quem não quer se expor: você entra, monta o perfil no seu tempo
        e só revela o que quiser, para quem quiser.
      </p>
      <ol>
        <li><strong>Crie o perfil</strong> — gratuito, indicando se você é casal, mulher solteira ou homem solteiro, e o que procura.</li>
        <li><strong>Separe o que é público do que é íntimo</strong> — fotos públicas ficam visíveis; as privadas só abrem para quem você liberar.</li>
        <li><strong>Encontre gente perto</strong> — os filtros restringem por cidade e estado, e a função "Estou Aqui" mostra quem está por perto agora.</li>
        <li><strong>Converse com calma</strong> — mensagens privadas, com opção de visualização única para o que é mais sensível.</li>
      </ol>

      <h2>Por que usar o NoSigilo em ${esc(city.name)}</h2>
      <ul>
        <li><strong>Perfis reais do meio liberal</strong> em ${esc(city.name)} e em toda a região.</li>
        <li><strong>Função "Estou Aqui"</strong> — encontre casais e singles próximos de você em tempo real.</li>
        <li><strong>Fotos públicas e privadas</strong> — você decide quem vê o que é mais íntimo.</li>
        <li><strong>Mensagens com visualização única</strong> — conteúdos que somem depois de vistos.</li>
        <li><strong>Cadastro gratuito</strong> e ambiente selecionado, discreto e respeitoso.</li>
      </ul>

      <div class="ctas">
        <a class="cta" href="/register">Criar conta grátis</a>
        <a class="cta outline" href="/login">Já tenho conta</a>
      </div>

      <h2>Privacidade: o ponto que mais pesa</h2>
      <p>
        Quem vive o meio liberal em ${esc(city.name)} costuma ter a mesma preocupação — ser reconhecido.
        É por isso que o sigilo aqui não é promessa de marketing, e sim como o produto foi construído:
        o perfil não é indexado por buscadores, as fotos íntimas ficam atrás de liberação individual,
        e o conteúdo mais sensível pode ser enviado com visualização única, sumindo depois de visto.
        As páginas que aparecem no Google, como esta, são apenas informativas — nenhum perfil de usuário
        chega aos resultados de busca.
      </p>

      <h2>Quem você encontra</h2>
      <p>
        A comunidade reúne três públicos que se procuram: <strong>casais liberais</strong>, que buscam
        troca de casais ou uma terceira pessoa; <strong>mulheres solteiras</strong>, que definem o próprio
        ritmo e com quem querem falar; e <strong>homens solteiros</strong>, em encontros de ménage e
        relações abertas. Os filtros existem justamente para que cada perfil chegue a quem faz sentido,
        sem ruído.
      </p>

      <h2>Primeiro encontro liberal: como não errar</h2>
      <p>
        Vale a mesma etiqueta que sustenta o meio há décadas — e ela protege os dois lados:
      </p>
      <ul>
        <li><strong>Converse antes.</strong> Alinhe limites, expectativas e o que está fora de cogitação antes de marcar.</li>
        <li><strong>Comece em lugar público.</strong> Um drink em ${esc(city.name)} antes de qualquer coisa reduz o desconforto dos dois lados.</li>
        <li><strong>"Não" encerra o assunto.</strong> Consentimento é contínuo e pode ser retirado a qualquer momento, por qualquer pessoa envolvida.</li>
        <li><strong>Combine com o parceiro.</strong> Nos casais, a regra combinada antes vale mais do que a vontade do momento.</li>
        <li><strong>Discrição é mão dupla.</strong> Não comente, não fotografe, não exponha quem você conheceu.</li>
      </ul>
${faq.html}

      <div class="box">
        <p style="margin:0;">
          Veja também <a href="/swing/${st.slug}/">swing e troca de casais em ${esc(st.name)}</a> —
          perfis do meio liberal em todo o estado${outrasDoEstado.length ? `, incluindo ${esc(list(outrasDoEstado))}` : ''}.
        </p>
      </div>
${vizinhas.length ? `
      <h2>Swing em outras cidades do ${esc(city.state.region)}</h2>
      <div class="links">${vizinhas.map((c) => `<a href="/swing/${c.state.slug}/${c.slug}/">Swing em ${esc(c.name)}</a>`).join('')}</div>
` : ''}
    </main>

    <footer>
      <a href="/">Início</a> ·
      <a href="/swing/">Todos os estados</a> ·
      <a href="/terms">Termos</a> ·
      <a href="/privacy">Privacidade</a>
      <br />© ${new Date().getFullYear()} NoSigilo.net — conteúdo adulto (18+). Todos os direitos reservados.
    </footer>
  </div>
</body>
</html>
`;
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
  const jsonld = {
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
  };
  const trilha = breadcrumbLd([
    { name: 'Início', path: '/' },
    { name: 'Swing por estado', path: '/swing/' },
  ]);
  const faq = faqSection([
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
  ]);

  const sections = order.map((reg) => `
      <h2>${esc(reg)}</h2>
      <div class="states">${byRegion[reg].map((s) => `<a href="${REGIONAL}/swing/${s.slug}/" style="color:#eb4778;">${esc(s.name)}</a>`).join(' · ')}</div>
  `).join('\n');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <meta name="rating" content="adult" />
  <link rel="canonical" href="${url}" />
  <link rel="icon" type="image/jpeg" href="/icon.jpg" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:image" content="${REGIONAL}/icon.jpg" />
  <meta name="theme-color" content="#eb4778" />
  <script type="application/ld+json">${JSON.stringify([jsonld, trilha, faq.ld])}</script>
  <style>
    :root { color-scheme: dark; }
    body { margin:0; background:#09090b; color:#e7e7ea; font-family:system-ui,-apple-system,sans-serif; line-height:1.65; }
    .wrap { max-width:880px; margin:0 auto; padding:28px 20px 56px; }
    .brand { font-weight:800; font-size:20px; color:#fff; text-decoration:none; }
    h1 { font-size:30px; font-weight:800; margin:24px 0 12px; }
    h2 { font-size:20px; font-weight:700; margin:26px 0 8px; color:#fff; }
    p { color:#c7c7cf; }
    .states { font-size:15px; line-height:2.1; }
    .cta { display:inline-block; background:#eb4778; color:#fff; font-weight:700; text-decoration:none; padding:10px 18px; border-radius:999px; margin-top:20px; }
    footer { margin-top:40px; padding-top:24px; border-top:1px solid #26262c; font-size:13px; color:#9a9aa2; }
    a { color:#eb4778; }
    .faq { text-align:left; max-width:760px; margin:0 auto; }
    .faq details { border:1px solid #26262c; border-radius:12px; padding:14px 16px; margin:10px 0; background:#111114; }
    .faq summary { cursor:pointer; font-weight:600; color:#e7e7ea; }
    .faq details p { margin:10px 0 0; color:#c7c7cf; }
  </style>
</head>
<body>
  <div class="wrap">
    <a class="brand" href="/">NoSigilo<span style="color:#eb4778;">.net</span></a>
    <h1>Swing e Troca de Casais por Estado</h1>
    <p>
      O <strong>NoSigilo.net</strong> conecta o meio liberal brasileiro em todo o país. Escolha seu estado
      e encontre casais e singles para swing, troca de casais e ménage com sigilo e privacidade.
    </p>
    ${sections}

    <p style="max-width:760px;margin:32px auto 0;text-align:left;">
      Cada página reúne o que interessa a quem procura <strong>swing</strong>, <strong>troca de casais</strong>
      e <strong>ménage</strong> naquela região: como a plataforma funciona, como a privacidade é tratada
      e o caminho para encontrar casais e singles por perto. A comunidade é nacional, mas a busca é local —
      os filtros restringem por cidade e estado, e a função "Estou Aqui" mostra quem está próximo agora.
    </p>
    <p style="max-width:760px;margin:14px auto 0;text-align:left;">
      O acesso é restrito a maiores de 18 anos. Os perfis passam por aprovação antes de circular e não são
      indexados por buscadores — o que aparece no Google são apenas páginas informativas como esta.
    </p>
${faq.html}
    <a class="cta" href="/register">Criar conta grátis</a>
    <footer>
      <a href="/">Início</a> · <a href="/terms">Termos</a> · <a href="/privacy">Privacidade</a> · <a href="/guidelines">Diretrizes</a>
      <br />© ${new Date().getFullYear()} NoSigilo.net — conteúdo adulto (18+).
    </footer>
  </div>
</body>
</html>
`;
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
  const stateUrls = SELECTED_STATES.map((s) => ({ loc: `${REGIONAL}/swing/${s.slug}/`, freq: 'monthly', pri: '0.8' }));
  const cityUrls = SELECTED_CITIES.map((c) => ({ loc: `${REGIONAL}/swing/${c.state.slug}/${c.slug}/`, freq: 'monthly', pri: '0.7' }));
  const urls = [...base, ...stateUrls, ...cityUrls]
    .map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>${u.freq}</changefreq>\n    <priority>${u.pri}</priority>\n  </url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

// --- escreve os arquivos ---
let stateCount = 0;
for (const st of SELECTED_STATES) {
  const dir = resolve(DIST, 'swing', st.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'index.html'), statePage(st), 'utf8');
  stateCount++;
}

let cityCount = 0;
for (const city of SELECTED_CITIES) {
  const dir = resolve(DIST, 'swing', city.state.slug, city.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'index.html'), cityPage(city), 'utf8');
  cityCount++;
}

mkdirSync(resolve(DIST, 'swing'), { recursive: true });
writeFileSync(resolve(DIST, 'swing', 'index.html'), hubPage(), 'utf8');
writeFileSync(resolve(DIST, 'sitemap.xml'), sitemap(), 'utf8');

console.log(`[seo] ${stateCount} estado(s) + ${cityCount} cidade(s) + hub /swing/ + sitemap.xml gerados em ${OUT_DIR_NAME}/`);

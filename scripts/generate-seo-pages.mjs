// Gera páginas estáticas de SEO por estado (UF) em dist/swing/{slug}/index.html
// Rodado automaticamente após o `vite build` (ver package.json -> "build").
// São páginas HTML reais, indexáveis por Bing/Google sem depender de JavaScript,
// que funcionam como funil: o conteúdo regional atrai a busca e os CTAs levam ao app.
//
// Também regenera dist/sitemap.xml com a home + páginas institucionais + todos os estados.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, '..', 'dist');
const SITE = 'https://nosigilo.net';
// Domínio das páginas regionais (estado + cidade + hub /swing/).
// Apenas estas páginas usam este domínio; o resto do site segue em SITE.
const REGIONAL = 'https://nosigilo.baselider.com.br';
const TODAY = new Date().toISOString().slice(0, 10);

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
  'ceara': [{ name: 'Fortaleza', slug: 'fortaleza' }],
  'rio-grande-do-norte': [{ name: 'Natal', slug: 'natal' }],
  'rondonia': [{ name: 'Porto Velho', slug: 'porto-velho' }],
  'amazonas': [{ name: 'Manaus', slug: 'manaus' }],
  'maranhao': [{ name: 'São Luís', slug: 'sao-luis' }],
  'alagoas': [{ name: 'Maceió', slug: 'maceio' }],
  'bahia': [{ name: 'Salvador', slug: 'salvador' }],
  'paraiba': [{ name: 'João Pessoa', slug: 'joao-pessoa' }],
  'pernambuco': [{ name: 'Recife', slug: 'recife' }],
  'piaui': [{ name: 'Teresina', slug: 'teresina' }],
  'sergipe': [{ name: 'Aracaju', slug: 'aracaju' }],
  'acre': [{ name: 'Rio Branco', slug: 'rio-branco' }],
  'amapa': [{ name: 'Macapá', slug: 'macapa' }],
  'para': [{ name: 'Belém', slug: 'belem' }],
  'roraima': [{ name: 'Boa Vista', slug: 'boa-vista' }],
  'tocantins': [{ name: 'Palmas', slug: 'palmas' }],
  // Centro-Oeste
  'distrito-federal': [{ name: 'Brasília', slug: 'brasilia' }],
  'goias': [{ name: 'Goiânia', slug: 'goiania' }],
  'mato-grosso': [{ name: 'Cuiabá', slug: 'cuiaba' }],
  'mato-grosso-do-sul': [{ name: 'Campo Grande', slug: 'campo-grande' }],
  // Sudeste
  'espirito-santo': [{ name: 'Vitória', slug: 'vitoria' }],
  'minas-gerais': [{ name: 'Belo Horizonte', slug: 'belo-horizonte' }],
  'rio-de-janeiro': [{ name: 'Rio de Janeiro', slug: 'rio-de-janeiro' }],
  'sao-paulo': [{ name: 'São Paulo', slug: 'sao-paulo' }],
  // Sul
  'parana': [{ name: 'Curitiba', slug: 'curitiba' }],
  'rio-grande-do-sul': [{ name: 'Porto Alegre', slug: 'porto-alegre' }],
  'santa-catarina': [{ name: 'Florianópolis', slug: 'florianopolis' }],
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

function statePage(st) {
  const cities = list(st.cities);
  const cityPages = citiesOf(st.slug);
  const cityLinksBlock = cityPages.length
    ? `\n      <h2>Cidades em ${esc(st.name)}</h2>\n      <div class="states">${cityPages.map((c) => `<a href="${REGIONAL}/swing/${st.slug}/${c.slug}/" style="color:#eb4778;">Swing em ${esc(c.name)}</a>`).join(' · ')}</div>\n`
    : '';
  const title = `Swing e Troca de Casais em ${st.name} (${st.uf}) | NoSigilo.net`;
  const desc = `Rede adulta discreta de swing, troca de casais e ménage em ${st.name} — ${cities}. Casais e singles do meio liberal com sigilo e privacidade. Cadastro grátis.`;
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
  <script type="application/ld+json">${JSON.stringify(jsonld)}</script>
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
${cityLinksBlock}
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
  const desc = `Rede adulta discreta de swing, troca de casais e ménage em ${city.name}, ${st.name}. Casais e singles do meio liberal com sigilo e privacidade. Cadastro grátis.`;

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
  <script type="application/ld+json">${JSON.stringify(jsonld)}</script>
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
  </style>
</head>
<body>
  <div class="wrap">
    <header class="top">
      <a class="brand" href="/">NoSigilo<span style="color:#eb4778;">.net</span></a>
      <a class="cta" href="/register">Criar conta grátis</a>
    </header>

    <main>
      <p class="crumb"><a href="/swing/${st.slug}/" style="color:#9a9aa2;">${esc(st.name)}</a> › ${esc(city.name)}</p>
      <h1>Swing e Troca de Casais em <span>${esc(city.name)}</span></h1>
      <p class="lead">
        A rede social adulta e discreta para casais, mulheres e homens solteiros do meio liberal
        em ${esc(city.name)}, ${esc(st.name)}. Conexões reais com sigilo, privacidade e respeito.
      </p>

      <p>
        Procurando <strong>swing em ${esc(city.name)}</strong> ou <strong>troca de casais em ${esc(city.name)}</strong>?
        O <strong>NoSigilo.net</strong> reúne o meio liberal de ${esc(city.name)} e região num só lugar,
        longe da exposição das redes sociais comuns. Casais liberais e singles encontram pessoas com os
        mesmos interesses para swing, ménage e encontros liberais — com total discrição.
      </p>

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

      <div class="box">
        <p style="margin:0;">
          Veja também <a href="/swing/${st.slug}/">swing e troca de casais em ${esc(st.name)}</a> —
          perfis do meio liberal em todo o estado.
        </p>
      </div>
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
  const desc = 'Encontre swing, troca de casais e ménage no seu estado. NoSigilo.net conecta o meio liberal brasileiro em todas as regiões — São Paulo, Rio, Minas, Bahia, Paraná e mais.';
  const url = `${REGIONAL}/swing/`;
  const byRegion = {};
  for (const s of SELECTED_STATES) (byRegion[s.region] ||= []).push(s);
  const order = ['Sudeste', 'Sul', 'Nordeste', 'Centro-Oeste', 'Norte'].filter((r) => byRegion[r]?.length);

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

console.log(`[seo] ${stateCount} estado(s) + ${cityCount} cidade(s) + hub /swing/ + sitemap.xml gerados em dist/`);

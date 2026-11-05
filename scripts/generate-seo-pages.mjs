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
//  Registro de visita
// ---------------------------------------------------------------------------
// Estas paginas sao HTML estatico, fora do app React, entao nao apareciam em
// site_visits — o admin sabia quantos cadastros cada pagina trouxe, mas nao
// quantas visitas, e sem isso nao ha taxa de conversao.
//
// Cuidados, porque isto roda em toda visita organica:
//
//  • Espera o load. Nada aqui pode disputar banda com a renderizacao; o Google
//    mede tempo de carregamento e a pagina existe para ranquear.
//  • sendBeacon quando existe. Ele nao segura a navegacao e sobrevive a quem
//    fecha a aba logo apos abrir, que num site de sigilo nao e caso raro.
//  • try/catch em volta de tudo e keepalive no fetch de reserva. Falha de
//    metrica nao pode quebrar pagina.
//  • Nada de identificador proprio: o endpoint ja deriva o que precisa do
//    cabecalho, e a pagina nao escreve cookie nem storage.
const BEACON = [
  '(function(){try{',
  'var d={path:location.pathname,title:document.title,referrer:document.referrer||undefined,',
  'language:navigator.language,screenWidth:screen.width,screenHeight:screen.height,',
  'deviceType:(innerWidth<768?"mobile":innerWidth<1024?"tablet":"desktop")};',
  'var s=function(){try{',
  'var b=JSON.stringify(d);',
  'if(navigator.sendBeacon){navigator.sendBeacon("/api/analytics/visit",new Blob([b],{type:"application/json"}));}',
  'else{fetch("/api/analytics/visit",{method:"POST",headers:{"Content-Type":"application/json"},body:b,keepalive:true});}',
  '}catch(e){}};',
  'if(document.readyState==="complete"){s();}else{addEventListener("load",s);}',
  '}catch(e){}})();',
].join('');

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

// Corte para uma cidade GANHAR pagina — nao confundir com MIN_CIDADE, que decide
// se a pagina exibe o numero de perfis. Abaixo disto a pagina existiria sem ter
// gente para entregar a quem chegasse por ela.
const MIN_PERFIS_CIDADE = 15;

// Cidade abaixo disto continua com página (os links para ela seguem valendo),
// mas sai do sitemap e vai com noindex: o Google para de gastar rastreamento em
// página que não sustenta conteúdo próprio, e concentra nas que sustentam.
// Medido em 17/09/2026: com 8 perfis eram 128 cidades quase iguais entre si e
// só 31 páginas indexadas de 190; com 15, sobram ~63 com dado real para mostrar.
const MIN_PERFIS_INDEXAVEL = 15;

const UF_PARA_SLUG = {
  AC: 'acre', AL: 'alagoas', AP: 'amapa', AM: 'amazonas', BA: 'bahia', CE: 'ceara',
  DF: 'distrito-federal', ES: 'espirito-santo', GO: 'goias', MA: 'maranhao',
  MT: 'mato-grosso', MS: 'mato-grosso-do-sul', MG: 'minas-gerais', PA: 'para',
  PB: 'paraiba', PR: 'parana', PE: 'pernambuco', PI: 'piaui', RJ: 'rio-de-janeiro',
  RN: 'rio-grande-do-norte', RS: 'rio-grande-do-sul', RO: 'rondonia', RR: 'roraima',
  SC: 'santa-catarina', SP: 'sao-paulo', SE: 'sergipe', TO: 'tocantins',
};

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

/** O titulo carrega os TRES padroes de busca que o Search Console mostrou para
 *  este site, e nao so um: "troca de casais <cidade>" (o mais frequente),
 *  "swing <cidade>" e "menage <cidade>".
 *
 *  A versao anterior abria com "Troca de Casais em X" e empurrava swing para
 *  um sufixo solto. Foi ao ar em 06/09 e as impressoes cairam de 337/dia para
 *  ~80 em tres dias — nao da para provar causa (mudamos titulo, triplicamos
 *  paginas e religamos o hub na mesma semana), mas trocar cobertura de termo
 *  por ordem de palavra foi uma aposta ruim de qualquer forma: cobertura e
 *  medida, ordem e suposicao.
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
    { name: 'Juazeiro', slug: 'juazeiro' },
    { name: 'Salvador', slug: 'salvador' },
  ],
  'ceara': [
    { name: 'Acaraú', slug: 'acarau' },
    { name: 'Aquiraz', slug: 'aquiraz' },
    { name: 'Aracati', slug: 'aracati' },
    { name: 'Caucaia', slug: 'caucaia' },
    { name: 'Crateús', slug: 'crateus' },
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
    { name: 'Pacatuba', slug: 'pacatuba' },
    { name: 'Quixadá', slug: 'quixada' },
    { name: 'Russas', slug: 'russas' },
    { name: 'Sobral', slug: 'sobral' },
    { name: 'São Gonçalo do Amarante', slug: 'sao-goncalo-do-amarante' },
    { name: 'Tianguá', slug: 'tiangua' },
  ],
  'distrito-federal': [{ name: 'Brasília', slug: 'brasilia' }],
  'espirito-santo': [
    { name: 'Aracruz', slug: 'aracruz' },
    { name: 'Cariacica', slug: 'cariacica' },
    { name: 'Colatina', slug: 'colatina' },
    { name: 'Guarapari', slug: 'guarapari' },
    { name: 'Serra', slug: 'serra' },
    { name: 'Vila Velha', slug: 'vila-velha' },
    { name: 'Vitória', slug: 'vitoria' },
  ],
  'goias': [
    { name: 'Aparecida de Goiânia', slug: 'aparecida-de-goiania' },
    { name: 'Goiânia', slug: 'goiania' },
    { name: 'Rio Verde', slug: 'rio-verde' },
    { name: 'Valparaíso de Goiás', slug: 'valparaiso-de-goias' },
  ],
  'maranhao': [
    { name: 'Imperatriz', slug: 'imperatriz' },
    { name: 'Paço do Lumiar', slug: 'paco-do-lumiar' },
    { name: 'São José de Ribamar', slug: 'sao-jose-de-ribamar' },
    { name: 'São Luís', slug: 'sao-luis' },
  ],
  'mato-grosso': [
    { name: 'Cuiabá', slug: 'cuiaba' },
    { name: 'Rondonópolis', slug: 'rondonopolis' },
  ],
  'mato-grosso-do-sul': [
    { name: 'Campo Grande', slug: 'campo-grande' },
    { name: 'Dourados', slug: 'dourados' },
  ],
  'minas-gerais': [
    { name: 'Belo Horizonte', slug: 'belo-horizonte' },
    { name: 'Betim', slug: 'betim' },
    { name: 'Contagem', slug: 'contagem' },
    { name: 'Divinópolis', slug: 'divinopolis' },
    { name: 'Governador Valadares', slug: 'governador-valadares' },
    { name: 'Ipatinga', slug: 'ipatinga' },
    { name: 'Itabira', slug: 'itabira' },
    { name: 'Juiz de Fora', slug: 'juiz-de-fora' },
    { name: 'Manhuaçu', slug: 'manhuacu' },
    { name: 'Montes Claros', slug: 'montes-claros' },
    { name: 'Ribeirão das Neves', slug: 'ribeirao-das-neves' },
    { name: 'Sete Lagoas', slug: 'sete-lagoas' },
    { name: 'Uberaba', slug: 'uberaba' },
    { name: 'Uberlândia', slug: 'uberlandia' },
    { name: 'Vespasiano', slug: 'vespasiano' },
  ],
  'para': [
    { name: 'Ananindeua', slug: 'ananindeua' },
    { name: 'Belém', slug: 'belem' },
    { name: 'Castanhal', slug: 'castanhal' },
    { name: 'Parauapebas', slug: 'parauapebas' },
    { name: 'Redenção', slug: 'redencao' },
  ],
  'paraiba': [
    { name: 'Bayeux', slug: 'bayeux' },
    { name: 'Campina Grande', slug: 'campina-grande' },
    { name: 'João Pessoa', slug: 'joao-pessoa' },
    { name: 'Santa Luzia', slug: 'santa-luzia' },
  ],
  'parana': [
    { name: 'Cascavel', slug: 'cascavel' },
    { name: 'Curitiba', slug: 'curitiba' },
    { name: 'Foz do Iguaçu', slug: 'foz-do-iguacu' },
    { name: 'Londrina', slug: 'londrina' },
    { name: 'Maringá', slug: 'maringa' },
  ],
  'pernambuco': [
    { name: 'Cabo de Santo Agostinho', slug: 'cabo-de-santo-agostinho' },
    { name: 'Camaragibe', slug: 'camaragibe' },
    { name: 'Caruaru', slug: 'caruaru' },
    { name: 'Garanhuns', slug: 'garanhuns' },
    { name: 'Gravatá', slug: 'gravata' },
    { name: 'Igarassu', slug: 'igarassu' },
    { name: 'Ipojuca', slug: 'ipojuca' },
    { name: 'Jaboatão dos Guararapes', slug: 'jaboatao-dos-guararapes' },
    { name: 'Olinda', slug: 'olinda' },
    { name: 'Paulista', slug: 'paulista' },
    { name: 'Petrolina', slug: 'petrolina' },
    { name: 'Recife', slug: 'recife' },
  ],
  'piaui': [{ name: 'Teresina', slug: 'teresina' }],
  'rio-de-janeiro': [
    { name: 'Cabo Frio', slug: 'cabo-frio' },
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
    { name: 'Canoas', slug: 'canoas' },
    { name: 'Caxias do Sul', slug: 'caxias-do-sul' },
    { name: 'Lajeado', slug: 'lajeado' },
    { name: 'Novo Hamburgo', slug: 'novo-hamburgo' },
    { name: 'Passo Fundo', slug: 'passo-fundo' },
    { name: 'Pelotas', slug: 'pelotas' },
    { name: 'Porto Alegre', slug: 'porto-alegre' },
    { name: 'Rio Grande', slug: 'rio-grande' },
    { name: 'São Leopoldo', slug: 'sao-leopoldo' },
  ],
  'rondonia': [
    { name: 'Ariquemes', slug: 'ariquemes' },
    { name: 'Cacoal', slug: 'cacoal' },
    { name: 'Candeias do Jamari', slug: 'candeias-do-jamari' },
    { name: 'Jaru', slug: 'jaru' },
    { name: 'Ji Paraná', slug: 'ji-parana' },
    { name: 'Porto Velho', slug: 'porto-velho' },
    { name: 'Rolim de Moura', slug: 'rolim-de-moura' },
    { name: 'Vilhena', slug: 'vilhena' },
  ],
  'roraima': [{ name: 'Boa Vista', slug: 'boa-vista' }],
  'santa-catarina': [
    { name: 'Balneário Camboriú', slug: 'balneario-camboriu' },
    { name: 'Blumenau', slug: 'blumenau' },
    { name: 'Chapecó', slug: 'chapeco' },
    { name: 'Criciúma', slug: 'criciuma' },
    { name: 'Florianópolis', slug: 'florianopolis' },
    { name: 'Itajaí', slug: 'itajai' },
    { name: 'Itapema', slug: 'itapema' },
    { name: 'Joinville', slug: 'joinville' },
  ],
  'sao-paulo': [
    { name: 'Campinas', slug: 'campinas' },
    { name: 'Caraguatatuba', slug: 'caraguatatuba' },
    { name: 'Diadema', slug: 'diadema' },
    { name: 'Ferraz de Vasconcelos', slug: 'ferraz-de-vasconcelos' },
    { name: 'Franca', slug: 'franca' },
    { name: 'Guarulhos', slug: 'guarulhos' },
    { name: 'Jundiaí', slug: 'jundiai' },
    { name: 'Mauá', slug: 'maua' },
    { name: 'Mogi das Cruzes', slug: 'mogi-das-cruzes' },
    { name: 'Osasco', slug: 'osasco' },
    { name: 'Piracicaba', slug: 'piracicaba' },
    { name: 'Praia Grande', slug: 'praia-grande' },
    { name: 'Presidente Prudente', slug: 'presidente-prudente' },
    { name: 'Ribeirão Preto', slug: 'ribeirao-preto' },
    { name: 'Santo André', slug: 'santo-andre' },
    { name: 'Santos', slug: 'santos' },
    { name: 'Sorocaba', slug: 'sorocaba' },
    { name: 'São Bernardo do Campo', slug: 'sao-bernardo-do-campo' },
    { name: 'São Caetano do Sul', slug: 'sao-caetano-do-sul' },
    { name: 'São José do Rio Preto', slug: 'sao-jose-do-rio-preto' },
    { name: 'São José dos Campos', slug: 'sao-jose-dos-campos' },
    { name: 'São Paulo', slug: 'sao-paulo' },
    { name: 'São Vicente', slug: 'sao-vicente' },
    { name: 'Taboão da Serra', slug: 'taboao-da-serra' },
  ],
  'sergipe': [{ name: 'Aracaju', slug: 'aracaju' }],
  'tocantins': [{ name: 'Palmas', slug: 'palmas' }],

};
// ============================================================

// Cidades novas de 02/11/2026, saídas de `--candidatas` (15+ perfis visíveis e
// ainda sem página). Fica num bloco à parte para a lista acima não ser
// reescrita. "Jardim Paulista" (SP) ficou de fora: é bairro, não município.
const NOVAS_CIDADES_2026_11 = {
  'alagoas': [{ name: 'Arapiraca', slug: 'arapiraca' }],
  'bahia': [{ name: 'Camaçari', slug: 'camacari' }, { name: 'Lauro de Freitas', slug: 'lauro-de-freitas' }, { name: 'Vitória da Conquista', slug: 'vitoria-da-conquista' }],
  'ceara': [{ name: 'Itaitinga', slug: 'itaitinga' }],
  'distrito-federal': [{ name: 'Planaltina', slug: 'planaltina' }],
  'espirito-santo': [{ name: 'Cachoeiro de Itapemirim', slug: 'cachoeiro-de-itapemirim' }],
  'goias': [{ name: 'Anápolis', slug: 'anapolis' }, { name: 'Trindade', slug: 'trindade' }, { name: 'Águas Lindas de Goiás', slug: 'aguas-lindas-de-goias' }],
  'mato-grosso': [{ name: 'Sinop', slug: 'sinop' }, { name: 'Várzea Grande', slug: 'varzea-grande' }],
  'minas-gerais': [{ name: 'Ibirité', slug: 'ibirite' }],
  'para': [{ name: 'Santarém', slug: 'santarem' }],
  'paraiba': [{ name: 'Patos', slug: 'patos' }],
  'parana': [{ name: 'Ponta Grossa', slug: 'ponta-grossa' }, { name: 'São José dos Pinhais', slug: 'sao-jose-dos-pinhais' }],
  'pernambuco': [{ name: 'Santa Cruz do Capibaribe', slug: 'santa-cruz-do-capibaribe' }, { name: 'Vitória de Santo Antão', slug: 'vitoria-de-santo-antao' }],
  'rio-de-janeiro': [{ name: 'Belford Roxo', slug: 'belford-roxo' }, { name: 'Macaé', slug: 'macae' }, { name: 'Nilópolis', slug: 'nilopolis' }, { name: 'Petrópolis', slug: 'petropolis' }, { name: 'Rio das Ostras', slug: 'rio-das-ostras' }, { name: 'São João de Meriti', slug: 'sao-joao-de-meriti' }],
  'rio-grande-do-norte': [{ name: 'Extremoz', slug: 'extremoz' }],
  'rio-grande-do-sul': [{ name: 'Gravataí', slug: 'gravatai' }, { name: 'Santa Cruz do Sul', slug: 'santa-cruz-do-sul' }, { name: 'Santa Maria', slug: 'santa-maria' }],
  'sao-paulo': [{ name: 'Americana', slug: 'americana' }, { name: 'Araraquara', slug: 'araraquara' }, { name: 'Araras', slug: 'araras' }, { name: 'Araçatuba', slug: 'aracatuba' }, { name: 'Barueri', slug: 'barueri' }, { name: 'Bauru', slug: 'bauru' }, { name: 'Carapicuíba', slug: 'carapicuiba' }, { name: 'Cotia', slug: 'cotia' }, { name: 'Embu das Artes', slug: 'embu-das-artes' }, { name: 'Guarujá', slug: 'guaruja' }, { name: 'Hortolândia', slug: 'hortolandia' }, { name: 'Indaiatuba', slug: 'indaiatuba' }, { name: 'Itapecerica da Serra', slug: 'itapecerica-da-serra' }, { name: 'Itaquaquecetuba', slug: 'itaquaquecetuba' }, { name: 'Jacareí', slug: 'jacarei' }, { name: 'Limeira', slug: 'limeira' }, { name: 'Mogi Guaçu', slug: 'mogi-guacu' }, { name: 'Salto', slug: 'salto' }, { name: 'Sumaré', slug: 'sumare' }, { name: 'Suzano', slug: 'suzano' }, { name: 'Taubaté', slug: 'taubate' }],
};
for (const [estado, cidades] of Object.entries(NOVAS_CIDADES_2026_11)) {
  const ja = new Set((ENABLED_CITIES[estado] ||= []).map((c) => c.slug));
  for (const c of cidades) if (!ja.has(c.slug)) ENABLED_CITIES[estado].push(c);
}

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

/** O mesmo slug que vira URL. O diff de --candidatas compara por ele, e nao
 *  pelo nome: "Ji Paraná" e "Ji-Paraná" sao nomes diferentes e a MESMA pagina
 *  (/swing/rondonia/ji-parana/). Comparando por nome, a segunda aparecia como
 *  cidade nova e teria virado duplicata. */
const slugCidade = (t) => semAcentos(t).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const SQL_STATS = `
  WITH detalhado AS (
    SELECT trim(city) AS city, trim(state) AS state, gender, last_seen_at, created_at, lat, lon
    FROM users
    WHERE COALESCE(is_banned, 0) = 0
      AND COALESCE(is_deactivated, 0) = 0
      AND deleted_at IS NULL
  ),
  visiveis AS (
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
                     WHERE char_length(COALESCE(city, '')) >= 3 GROUP BY 1) t),
    -- Detalhe por cidade: é o que faz uma página de cidade dizer algo que a
    -- outra não diz. Agrupado por nome (igual ao porCidade acima) porque parte
    -- dos perfis está sem UF.
    'detalhe',    (SELECT json_agg(json_build_object(
                     'cidade', cidade, 'n', n, 'casais', casais, 'mulheres', mulheres,
                     'ativos30', ativos30, 'novos30', novos30, 'lat', lat, 'lon', lon))
                   FROM (
                     SELECT trim(city) AS cidade,
                            COUNT(*) AS n,
                            COUNT(*) FILTER (WHERE lower(COALESCE(gender, '')) LIKE 'casal%') AS casais,
                            COUNT(*) FILTER (WHERE lower(COALESCE(gender, '')) LIKE 'mulher%') AS mulheres,
                            COUNT(*) FILTER (WHERE last_seen_at >= NOW() - INTERVAL '30 days') AS ativos30,
                            COUNT(*) FILTER (WHERE created_at >= to_char(NOW() - INTERVAL '30 days', 'YYYY-MM-DD')) AS novos30,
                            round(avg(lat)::numeric, 4) AS lat,
                            round(avg(lon)::numeric, 4) AS lon
                       FROM detalhado
                      WHERE char_length(COALESCE(city, '')) >= 3
                      GROUP BY 1) d)
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

  // Mesmo cuidado do bloco acima: cidade de nome repetido fica sem detalhe, em
  // vez de mostrar os números de uma homônima.
  const detalhePorNome = new Map();
  for (const d of dados.detalhe || []) {
    const k = semAcentos(d.cidade);
    const atual = detalhePorNome.get(k) || { n: 0, casais: 0, mulheres: 0, ativos30: 0, novos30: 0, lat: null, lon: null };
    // Variantes do mesmo nome ("Fortaleza"/"FORTALEZA") somam; as coordenadas
    // ficam com a variante de maior peso, que é a que representa a cidade.
    const maior = Number(d.n || 0) > atual.n;
    detalhePorNome.set(k, {
      n: atual.n + Number(d.n || 0),
      casais: atual.casais + Number(d.casais || 0),
      mulheres: atual.mulheres + Number(d.mulheres || 0),
      ativos30: atual.ativos30 + Number(d.ativos30 || 0),
      novos30: atual.novos30 + Number(d.novos30 || 0),
      lat: maior && d.lat != null ? Number(d.lat) : atual.lat,
      lon: maior && d.lon != null ? Number(d.lon) : atual.lon,
    });
  }
  const detalhe = {};
  for (const c of SELECTED_CITIES) {
    const k = semAcentos(c.name);
    if (vezes.get(k) > 1) continue;
    const d = detalhePorNome.get(k);
    if (d) detalhe[`${c.state.slug}/${c.slug}`] = d;
  }
  if (ambiguas) console.warn(`[seo] ${ambiguas} cidade(s) de nome repetido ficaram sem numero proprio`);

  console.log(`[seo] numeros do banco: ${dados.nacional} perfis, ${Object.keys(estados).length} estados, ${Object.keys(cidades).length} cidades (${Object.keys(detalhe).length} com detalhe)`);
  return { nacional: dados.nacional, estados, cidades, detalhe };
}

// ---------------------------------------------------------------------------
//  --candidatas: cidades que ja tem gente e ainda nao tem pagina
// ---------------------------------------------------------------------------
// Roda no servidor, onde o banco esta, e ja compara com o que esta publicado —
// evita o vai e vem de colar SQL e conferir a lista a mao.
//
//   node scripts/generate-seo-pages.mjs --candidatas
//
// Agrupa por nome em minusculas porque a mesma cidade chega escrita de varios
// jeitos ("Fortaleza", "fortaleza"), e sem juntar isso uma cidade grande parece
// varias pequenas. A UF vem da variante mais frequente: parte dos perfis tem o
// campo state vazio, entao ela nao serve para agrupar, so para rotular.
const SQL_CANDIDATAS = `
  WITH visiveis AS (
    SELECT trim(city) AS cidade, upper(trim(COALESCE(state, ''))) AS uf
      FROM users
     WHERE COALESCE(is_banned, 0) = 0
       AND COALESCE(is_deactivated, 0) = 0
       AND deleted_at IS NULL
       AND char_length(trim(COALESCE(city, ''))) >= 3
  ),
  total AS (
    SELECT lower(cidade) AS chave, COUNT(*) AS n FROM visiveis GROUP BY 1
  ),
  nome AS (
    SELECT lower(cidade) AS chave, cidade,
           ROW_NUMBER() OVER (PARTITION BY lower(cidade) ORDER BY COUNT(*) DESC) AS rn
      FROM visiveis GROUP BY lower(cidade), cidade
  ),
  ufs AS (
    SELECT lower(cidade) AS chave, uf,
           ROW_NUMBER() OVER (PARTITION BY lower(cidade) ORDER BY COUNT(*) DESC) AS rn
      FROM visiveis WHERE char_length(uf) = 2 GROUP BY lower(cidade), uf
  )
  SELECT json_agg(json_build_object('cidade', x.cidade, 'uf', x.uf, 'total', x.n) ORDER BY x.n DESC)::text
    FROM (
      SELECT n.cidade, COALESCE(u.uf, '') AS uf, t.n
        FROM total t
        JOIN nome n ON n.chave = t.chave AND n.rn = 1
        LEFT JOIN ufs u ON u.chave = t.chave AND u.rn = 1
       WHERE t.n >= ${MIN_PERFIS_CIDADE}
    ) x;
`;

if (process.argv.includes('--candidatas')) {
  let linhas;
  try {
    linhas = JSON.parse(ultimaLinha(psql(SQL_CANDIDATAS)) || 'null') || [];
  } catch (e) {
    console.error('[seo] nao consegui consultar o banco:', String(e.message).split(String.fromCharCode(10))[0]);
    process.exit(1);
  }
  const publicadas = new Set(SELECTED_CITIES.map((c) => c.slug));
  // "Fortaleza ce", "Serra es", "Fortaleza ceara": e o nome da cidade com o
  // estado colado, digitado a mao. Nao e municipio, e publicar viraria uma
  // pagina duplicada da cidade de verdade.
  //
  // Nao basta olhar o sufixo: "Valparaiso de Goias" e cidade LEGITIMA que
  // termina com o nome do estado. O que separa os dois casos e o resto — se,
  // tirando o sufixo, sobra exatamente uma cidade JA PUBLICADA, entao e
  // duplicata. "Fortaleza ceara" sem "ceara" vira "Fortaleza", que existe;
  // "Valparaiso de Goias" sem "Goias" vira "Valparaiso de", que nao existe.
  const sufixosDeEstado = new Set([
    ...Object.keys(UF_PARA_SLUG).map((uf) => uf.toLowerCase()),
    ...ALL_STATES.map((st) => semAcentos(st.name)),
  ]);
  const ehNomeComEstado = (nome) => {
    const limpo = semAcentos(nome);
    for (const sufixo of sufixosDeEstado) {
      if (!limpo.endsWith(' ' + sufixo)) continue;
      const resto = limpo.slice(0, -(sufixo.length + 1)).trim();
      if (resto && publicadas.has(slugCidade(resto))) return true;
    }
    return false;
  };
  const novas = linhas.filter((l) => !publicadas.has(slugCidade(l.cidade)));
  const suspeitas = novas.filter((l) => ehNomeComEstado(l.cidade));
  const faltando = novas.filter((l) => !suspeitas.includes(l) && l.uf && UF_PARA_SLUG[l.uf]);
  const semUf = novas.filter((l) => !suspeitas.includes(l) && (!l.uf || !UF_PARA_SLUG[l.uf]));

  console.log(`[seo] ${SELECTED_CITIES.length} cidade(s) publicadas, corte de ${MIN_PERFIS_CIDADE} perfis`);
  if (faltando.length === 0) {
    console.log('[seo] nenhuma cidade nova alcancou o corte.');
  } else {
    console.log(`[seo] ${faltando.length} cidade(s) para publicar:
`);
    for (const l of faltando) console.log(`  ("${l.cidade}", "${l.uf}"),   // ${l.total} perfis`);
  }
  if (suspeitas.length) {
    console.log(`
[seo] ${suspeitas.length} entrada(s) parecem o nome da cidade com a UF colada — nao publicar:`);
    for (const l of suspeitas) console.log(`  ${l.cidade} — ${l.total} perfis`);
  }
  if (semUf.length) {
    // Sem UF nao da para montar /swing/<estado>/<cidade>/. Aparecem aqui em vez
    // de sumirem em silencio: quase sempre e cadastro com o estado em branco,
    // nao cidade inexistente.
    console.log(`
[seo] ${semUf.length} cidade(s) alcancaram o corte mas estao sem UF definida:`);
    for (const l of semUf) console.log(`  ${l.cidade} — ${l.total} perfis`);
  }
  process.exit(0);
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

/** O login tambem leva a origem.
 *
 *  Sem isto ha um vazamento silencioso: quem clica em "Ja sou membro" ou "Ja
 *  tenho uma conta" sai da pagina regional para /login sem parametro nenhum, e
 *  como estas paginas sao HTML estatico o app nunca rodou nelas para guardar a
 *  origem antes. Se essa pessoa acabar criando uma conta, o cadastro conta como
 *  direto e a pagina perde o credito por um visitante que ela trouxe.
 *
 *  Basta o parametro existir em /login: o app captura na entrada e a origem
 *  sobrevive dali ate o /register. */
function loginUrl(origem) {
  return `/login?origem=${origem}`;
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

/** Números reais da cidade, vindos do banco no momento do build. */
function dadosCidade(city) {
  return STATS?.detalhe?.[`${city.state.slug}/${city.slug}`] ?? null;
}

/** A cidade tem gente suficiente para sustentar uma página que o Google indexe? */
function cidadeIndexavel(city) {
  const d = dadosCidade(city);
  const n = d ? d.n : (STATS?.cidades?.[`${city.state.slug}/${city.slug}`] ?? 0);
  // Sem banco (--sem-banco) ninguém é cortado: melhor publicar tudo do que
  // esvaziar o sitemap por falta de dado.
  return STATS?.detalhe ? n >= MIN_PERFIS_INDEXAVEL : true;
}

const RAIO_TERRA_KM = 6371;
function distanciaKm(a, b) {
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * RAIO_TERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Cidades publicadas mais próximas, pela média das coordenadas dos perfis de
 *  cada uma. Sai diferente em cada página — é o oposto do bloco de template. */
function cidadesProximas(city, limite = 4) {
  const aqui = dadosCidade(city);
  if (!aqui || aqui.lat == null || aqui.lon == null) return [];
  return SELECTED_CITIES
    .filter((c) => c.slug !== city.slug)
    .map((c) => {
      const d = dadosCidade(c);
      if (!d || d.lat == null || d.lon == null) return null;
      return { city: c, perfis: d.n, km: Math.round(distanciaKm(aqui, d)) };
    })
    .filter((x) => x && x.km <= 400 && x.perfis >= 8)
    .sort((a, b) => a.km - b.km)
    .slice(0, limite);
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
  const d = dadosCidade(city);
  const perguntaNumeros = d && d.n >= MIN_PERFIS_INDEXAVEL
    ? [{
        p: `Quantas pessoas usam o NoSigilo em ${city.name}?`,
        r: `Hoje ${city.name} tem ${fmt(d.n)} perfis ativos e visíveis no NoSigilo${d.casais >= 3 ? `, sendo ${fmt(d.casais)} casais` : ''}${d.ativos30 >= 3 ? `. Nos últimos 30 dias, ${fmt(d.ativos30)} perfis estiveram ativos` : ''}. O número é contado no momento em que esta página foi atualizada e não inclui perfis banidos, desativados ou apagados.`,
      }]
    : [];
  return [
    ...perguntaNumeros,
    {
      p: `O NoSigilo é gratuito em ${city.name}?`,
      r: `Sim, o cadastro é gratuito e permite criar seu perfil, navegar e ser encontrado por outros perfis de ${esc(city.name)}. Recursos avançados, como enviar mensagens sem limite e ver quem visitou seu perfil, fazem parte do plano premium.`,
    },
    {
      // "encontro casual em <cidade>" apareceu no Search Console (set/2026)
      // sem a página ter o termo em lugar nenhum — ficou na posição 87.
      p: `Dá para marcar um encontro casual em ${city.name}?`,
      r: `Sim. Além de swing e troca de casais, muita gente de ${esc(city.name)} usa o NoSigilo para encontro casual entre adultos: você filtra por cidade, conversa no chat privado e combina só quando os dois lados quiserem, sem nada aparecer nas suas redes sociais.`,
    },
    {
      // Search Console (nov/2026): "casa de swing em <cidade>" aparece nas
      // posições 38 a 71 sem a página ter o termo. Resposta honesta: não
      // listamos casas físicas; oferecemos A Casa, que é online.
      p: `Tem casa de swing em ${city.name}?`,
      r: `O NoSigilo não lista casas de swing físicas. Para quem quer conhecer o clima de uma casa de swing sem sair de ${esc(city.name)}, existe <a href="${CASA_PATH}">A Casa</a>, a casa de swing online do NoSigilo: toda sexta e sábado a partir das 22h, com salas ao vivo de casais, mulheres e singles, e mulher entra grátis. E para encontros presenciais, os filtros mostram casais e singles de ${esc(city.name)} e região.`,
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
/* Bloco de números da cidade: mesma família visual das listas da landing. */
.cl-dados-lista { list-style: none; padding: 0; margin: 16px 0; display: grid; gap: 8px; }
.cl-dados-lista li { padding-left: 18px; position: relative; }
.cl-dados-lista li::before { content: ''; position: absolute; left: 0; top: 9px; width: 8px; height: 8px; border-radius: 50%; background: #e11d63; }
.cl-dados-nota { font-size: 13px; opacity: .7; }

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

function campaignHeader(origem) {
  return `<header class="cl-header">
      <a class="cl-brand" href="/">NoSigilo<em>.net</em></a>
      <a class="cl-login" href="${loginUrl(origem)}">Já sou membro</a>
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
    { ic: 'users', title: 'Comunidade LGBT+', desc: 'Casais lésbicos e gays, pessoas trans, travestis, crossdressers e bissexuais também se encontram aqui, com filtro por orientação.' },
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
function campaignDocument({ title, desc, url, geoUf, geoPlace, jsonld, body, noindex, lang = 'pt-BR', ogLocale = 'pt_BR', geoRegion = null, extraCss = '' }) {
  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  <meta name="robots" content="${noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large'}" />
  <meta name="rating" content="adult" />
  <meta name="rating" content="RTA-5042-1996-1400-1577-RTA" />
  ${geoRegion ? `<meta name="geo.region" content="${geoRegion}" />` : geoUf ? `<meta name="geo.region" content="BR-${geoUf}" />` : ''}
  ${geoPlace ? `<meta name="geo.placename" content="${esc(geoPlace)}" />` : ''}
  <link rel="canonical" href="${url}" />
  <link rel="icon" type="image/jpeg" href="/icon.jpg" />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="${ogLocale}" />
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
  <style>${CAMPAIGN_CSS}${extraCss}</style>
</head>
<body>
  <main class="cl">
    ${body}
  </main>
  <script>${BEACON}</script>
</body>
</html>
`;
}

function statePage(st) {
  const cities = list(st.cities);
  const cityPages = citiesOf(st.slug);
  // A ordem de descarte e por VALOR DE BUSCA, do menos para o mais util:
  // primeiro cai a marca, depois a UF, e os tres termos so no fim. Para um
  // site que ninguem ainda procura pelo nome, "NoSigilo" no titulo vale
  // menos que "menage" — a marca ja esta na URL, na descricao e no H1.
  const title = melhorTitle([
    `Troca de Casais em ${st.name} (${st.uf}) · Swing e Ménage | NoSigilo`,
    `Troca de Casais em ${st.name} (${st.uf}) · Swing e Ménage`,
    `Troca de Casais em ${st.name} · Swing e Ménage`,
    `Troca de Casais e Swing em ${st.name} (${st.uf})`,
    `Troca de Casais e Swing em ${st.name}`,
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

  const body = `${campaignHeader(`swing/${st.slug}`)}

    <section class="cl-hero">
      <div class="cl-hero-copy">
        <p class="cl-crumb"><a href="/swing/">Swing por estado</a> › ${esc(st.name)}</p>
        <h1>Swing e Troca de Casais em <em>${esc(st.name)}</em></h1>
        <p class="cl-intro">
          Procurando <strong>swing em ${esc(st.name)}</strong> ou <strong>troca de casais em ${esc(st.capital)}</strong>?
          O NoSigilo.net reúne o meio liberal de ${esc(cities)} num só lugar, longe da exposição das redes sociais
          comuns — casais liberais e singles com os mesmos interesses para swing, ménage e encontros liberais,
          com total discrição — e também para quem procura <strong>encontro casual em ${esc(st.name)}</strong>.
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
        <p>A comunidade reúne públicos que se procuram — cada perfil indica o que busca, e os filtros fazem o resto.</p>
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
          <a class="cl-final-login" href="${loginUrl(`swing/${st.slug}`)}">Já tenho uma conta</a>
        </div>
      </div>
    </section>

    ${campaignFooter(st.slug)}`;

  return campaignDocument({ title, desc, url, geoUf: st.uf, geoPlace: st.name, jsonld, body: camadaBrasil(body, `swing/${st.slug}`, st.name), extraCss: BR_CSS });
}

/** O que esta cidade tem que as outras não têm: números do banco e vizinhança
 *  real. É o bloco que tira a página do lugar de "mesmo texto com outro nome".
 *
 *  Não publicamos a contagem de homens de propósito: ela existe no banco, mas
 *  numa rede liberal o número que interessa a quem procura é quantos casais e
 *  mulheres há na cidade. Nada aqui é estimado — se o dado não existe, a frase
 *  não aparece. */
function blocoDadosCidade(city) {
  const d = dadosCidade(city);
  const proximas = cidadesProximas(city);
  if (!d || d.n < MIN_PERFIS_INDEXAVEL) return '';

  const linhas = [];
  linhas.push(`<li><strong>${fmt(d.n)} perfis</strong> com cadastro ativo em ${esc(city.name)}</li>`);
  if (d.casais >= 3) linhas.push(`<li><strong>${fmt(d.casais)} casais</strong> do meio liberal na cidade</li>`);
  if (d.mulheres >= 3) linhas.push(`<li><strong>${fmt(d.mulheres)} mulheres</strong> cadastradas em ${esc(city.name)}</li>`);
  if (d.ativos30 >= 3) linhas.push(`<li><strong>${fmt(d.ativos30)} perfis ativos</strong> nos últimos 30 dias</li>`);
  if (d.novos30 >= 3) linhas.push(`<li><strong>${fmt(d.novos30)} cadastros novos</strong> nos últimos 30 dias</li>`);

  const vizinhas = proximas.length
    ? `<div class="cl-alt-copy">
        <h3>Quem está por perto de ${esc(city.name)}</h3>
        <p>O raio de busca não para no limite do município. Estas cidades têm gente cadastrada e ficam a uma distância que dá para combinar um encontro:</p>
        <ul class="cl-dados-lista">
          ${proximas.map((v) => `<li><a href="/swing/${v.city.state.slug}/${v.city.slug}/">${esc(v.city.name)}</a> — ${fmt(v.perfis)} perfis, a cerca de ${v.km} km</li>`).join('\n          ')}
        </ul>
      </div>`
    : '';

  return `<section class="cl-section" id="numeros">
      <div class="cl-alt-copy">
        <h2>O meio liberal de <em>${esc(city.name)}</em> em números</h2>
        <p>Dados dos perfis visíveis de ${esc(city.name)} no NoSigilo, atualizados em ${TODAY.split('-').reverse().join('/')}:</p>
        <ul class="cl-dados-lista">
          ${linhas.join('\n          ')}
        </ul>
        <p class="cl-dados-nota">Contamos apenas perfis ativos e visíveis: quem foi banido, desativou a conta ou apagou o cadastro fica de fora.</p>
      </div>
      ${vizinhas}
    </section>`;
}

function cityPage(city) {
  const st = city.state;
  const url = `${REGIONAL}/swing/${st.slug}/${city.slug}/`;
  // A ordem de descarte e por VALOR DE BUSCA, do menos para o mais util:
  // primeiro cai a marca, depois a UF, e os tres termos so no fim. Para um
  // site que ninguem ainda procura pelo nome, "NoSigilo" no titulo vale
  // menos que "menage" — a marca ja esta na URL, na descricao e no H1.
  // Search Console (out/2026): "troca de casais em <cidade>" tem bem mais busca
  // que "swing em <cidade>". O termo mais procurado vai na frente.
  const title = melhorTitle([
    `Troca de Casais em ${city.name} (${st.uf}) · Swing e Ménage | NoSigilo`,
    `Troca de Casais em ${city.name} (${st.uf}) · Swing e Ménage`,
    `Troca de Casais em ${city.name} · Swing e Ménage`,
    `Troca de Casais e Swing em ${city.name} (${st.uf})`,
    `Troca de Casais e Swing em ${city.name}`,
  ]);
  const nCidade = numeroCidade(city, st);
  const desc = melhorDesc(nCidade
    ? [
        `Troca de casais em ${city.name}: mais de ${fmt(nCidade)} perfis de casais liberais e singles. Swing, ménage e encontros casuais com sigilo. Cadastro grátis.`,
        `Mais de ${fmt(nCidade)} perfis em ${city.name}. Rede adulta discreta de swing, troca de casais e ménage — casais e singles do meio liberal, com sigilo. Cadastro grátis.`,
        `Mais de ${fmt(nCidade)} perfis em ${city.name}. Swing, troca de casais e ménage numa rede adulta discreta, com sigilo de verdade. Cadastro grátis.`,
        `Mais de ${fmt(nCidade)} perfis em ${city.name}. Swing e troca de casais com sigilo. Cadastro grátis.`,
      ]
    : [
        `Troca de casais em ${city.name}: casais liberais e singles para swing, ménage e encontros casuais, com sigilo. Cadastro grátis.`,
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
  const indexavel = cidadeIndexavel(city);
  const outrasDoEstado = st.cities.filter((c) => c !== city.name);

  const body = `${campaignHeader(`swing/${st.slug}/${city.slug}`)}

    <section class="cl-hero">
      <div class="cl-hero-copy">
        <p class="cl-crumb"><a href="/swing/">Swing por estado</a> › <a href="/swing/${st.slug}/">${esc(st.name)}</a> › ${esc(city.name)}</p>
        <h1>Troca de Casais e Swing em <em>${esc(city.name)}</em></h1>
        <p class="cl-intro">
          Procurando <strong>swing em ${esc(city.name)}</strong> ou <strong>troca de casais em ${esc(city.name)}</strong>?
          O NoSigilo.net reúne o meio liberal de ${esc(city.name)} e região num só lugar, longe da exposição das
          redes sociais comuns — casais liberais, mulheres solteiras e homens solteiros com os mesmos interesses
          para swing, ménage e encontros liberais, com total discrição. Também é o lugar para quem busca
          <strong>encontro casual em ${esc(city.name)}</strong> entre adultos, sem expor nada nas redes.
          Aqui você encontra <strong>casais liberais em ${esc(city.name)}</strong> e <strong>encontros casuais em ${esc(city.name)}</strong>
          com quem pensa igual, conversando primeiro e decidindo juntos.
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


    ${blocoDadosCidade(city)}
    ${blocoCasaCidade(city)}
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
        <p>A comunidade reúne públicos que se procuram — cada perfil indica o que busca, e os filtros fazem o resto.</p>
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
        <a href="/swing/${st.slug}/">Troca de casais em ${esc(st.name)}</a>
        ${SELECTED_CITIES.filter((c) => c.state.slug === st.slug && c.slug !== city.slug).map((c) => `<a href="/swing/${c.state.slug}/${c.slug}/">Troca de casais em ${esc(c.name)}</a>`).join('')}
        ${vizinhas.map((c) => `<a href="/swing/${c.state.slug}/${c.slug}/">Swing em ${esc(c.name)}</a>`).join('')}
        <a href="${CASA_PATH}">Casa de swing online</a>
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
          <a class="cl-final-login" href="${loginUrl(`swing/${st.slug}/${city.slug}`)}">Já tenho uma conta</a>
        </div>
      </div>
    </section>

    ${campaignFooter(st.slug)}`;

  return campaignDocument({
    noindex: !indexavel,
    title, desc, url, geoUf: st.uf, geoPlace: city.name, jsonld,
    body: camadaBrasil(body, `swing/${st.slug}/${city.slug}`, city.name), extraCss: BR_CSS + CASA_CSS });
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

  // Diretorio de cidades. Sem ele as cidades so eram alcancaveis pela pagina do
  // estado, ou seja, a tres cliques da home — fundo demais para um site novo.
  //
  // O relatorio de indexacao de 09/09/2026 mostrou 20 paginas indexadas contra
  // 63 "detectadas, mas nao indexadas": o Google achou as URLs pelo sitemap e
  // nao chegou a rastrear. Encurtar o caminho e o que esta ao nosso alcance —
  // sitemap anuncia, link interno leva.
  const cidadesPorEstado = order.map((reg) => {
    const estados = byRegion[reg].filter((st) => citiesOf(st.slug).length > 0);
    if (estados.length === 0) return '';
    return estados.map((st) => `
      <div class="cl-chips" style="margin-bottom:1rem;">
        <span style="width:100%;font-weight:700;font-size:.95rem;color:#700c20;margin-bottom:.35rem;display:block;">
          <a href="/swing/${st.slug}/" style="color:inherit;">${esc(st.name)}</a>
        </span>
        ${citiesOf(st.slug).map((c) => `<a href="/swing/${st.slug}/${c.slug}/">${esc(c.name)}</a>`).join('')}
      </div>`).join('');
  }).join('');

  const body = `${campaignHeader(`swing`)}

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

    <section class="cl-section cl-region" style="border-top:1px solid #ead7d3;">
      <h2>Cidades com gente por perto</h2>
      <p>${SELECTED_CITIES.length} cidades onde já há perfis de verdade — não é lista de município, é onde a comunidade existe.</p>
      ${cidadesPorEstado}
    </section>

    <section class="cl-section cl-region" style="border-top:1px solid #ead7d3;">
      <h2>Não tem casa de swing perto?</h2>
      <p>A Casa é a casa de swing online do NoSigilo: sexta e sábado a partir das 22h, de qualquer cidade.</p>
      <div class="cl-chips"><a href="${CASA_PATH}">Casa de swing online: conheça A Casa</a></div>
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
        <p>A comunidade reúne públicos que se procuram — cada perfil indica o que busca, e os filtros fazem o resto.</p>
        <div class="cl-list">${listItemsHtml(audienciaItems('Buscam troca de casais ou uma terceira pessoa, em qualquer estado do Brasil.'))}</div>
      </div>
    </section>

    <section class="cl-section cl-region">
      <h2>Também em <em>Portugal</em></h2>
      <p>Lisboa, Porto, Braga, Faro e outras cidades portuguesas.</p>
      <div class="cl-chips"><a href="/swing/portugal/">Swing em Portugal</a></div>
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
          <a class="cl-final-login" href="${loginUrl(`swing`)}">Já tenho uma conta</a>
        </div>
      </div>
    </section>

    ${campaignFooter(null)}`;

  return campaignDocument({ title, desc, url, geoUf: '', geoPlace: '', jsonld, body: camadaBrasil(body, 'swing', null), extraCss: BR_CSS });
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
  // Só entram páginas com HTML próprio. /register, /login, /subscriptions,
  // /terms, /privacy e /guidelines estavam aqui e são rotas do app: servem o
  // mesmo index.html da home, com o mesmo título e canonical apontando para "/".
  // Pedir indexação delas era pedir para indexar seis cópias da home — e as seis
  // entravam na conta de "não indexadas" do Search Console (17/09/2026).
  const base = [
    { loc: `${SITE}/`, freq: 'weekly', pri: '1.0' },
    { loc: `${REGIONAL}/swing/`, freq: 'weekly', pri: '0.9' },
    // A Casa: título/descrição/canonical próprios aplicados pelo app (seoDaRota.ts).
    { loc: `${SITE}/acasa`, freq: 'weekly', pri: '0.8' },
    { loc: `${REGIONAL}${CASA_PATH}`, freq: 'monthly', pri: '0.8', chave: CASA_PATH },
    { loc: `${REGIONAL}${CASA_PT_PATH}`, freq: 'monthly', pri: '0.7', chave: CASA_PT_PATH },
  ];
  const stateUrls = SELECTED_STATES.map((s) => ({ loc: `${REGIONAL}/swing/${s.slug}/`, freq: 'monthly', pri: '0.8', chave: `/swing/${s.slug}/` }));
  const cityUrls = SELECTED_CITIES
    .filter(cidadeIndexavel)
    .map((c) => ({ loc: `${REGIONAL}/swing/${c.state.slug}/${c.slug}/`, freq: 'monthly', pri: '0.7', chave: `/swing/${c.state.slug}/${c.slug}/` }));
  const portugalUrls = [
    { loc: `${REGIONAL}/swing/portugal/`, freq: 'monthly', pri: '0.8', chave: '/swing/portugal/' },
    ...PORTUGAL_CIDADES.map((c) => ({ loc: `${REGIONAL}/swing/portugal/${c.slug}/`, freq: 'monthly', pri: '0.7', chave: `/swing/portugal/${c.slug}/` })),
  ];
  const urls = [...base, ...stateUrls, ...cityUrls, ...portugalUrls]
    .map((u) => {
      const quando = u.chave ? (LASTMOD[u.chave]?.lastmod || TODAY) : dataFixa(new URL(u.loc).pathname);
      return `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${quando}</lastmod>\n    <changefreq>${u.freq}</changefreq>\n    <priority>${u.pri}</priority>\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}


// ---------------------------------------------------------------------------
//  Portugal (11/2026)
// ---------------------------------------------------------------------------
// Seção própria, sem tocar nos modelos do Brasil: as páginas brasileiras já
// indexadas continuam byte a byte iguais. Público inicial: brasileiros que
// moram em Portugal e casais portugueses. Sem números de perfis — ainda são
// poucos, e número pequeno na página afasta mais do que atrai.
const PORTUGAL_CIDADES = [
  { name: 'Lisboa', slug: 'lisboa', regiao: 'Grande Lisboa',
    vizinhas: ['Amadora', 'Odivelas', 'Loures', 'Oeiras', 'Cascais', 'Sintra', 'Almada'],
    frase: 'A capital concentra a maior parte do público liberal do país — de Alfama ao Parque das Nações, passando pela linha de Cascais e por Sintra.' },
  { name: 'Porto', slug: 'porto', em: 'no Porto', de: 'do Porto', ao: 'No Porto', regiao: 'Área Metropolitana do Porto',
    vizinhas: ['Vila Nova de Gaia', 'Matosinhos', 'Maia', 'Gondomar', 'Vila do Conde', 'Póvoa de Varzim'],
    frase: 'No Norte, o Porto e a outra margem, em Gaia, reúnem casais e singles de toda a área metropolitana.' },
  { name: 'Braga', slug: 'braga', regiao: 'Minho', naRegiao: 'no Minho', todaRegiao: 'todo o Minho',
    vizinhas: ['Guimarães', 'Barcelos', 'Vila Nova de Famalicão', 'Viana do Castelo'],
    frase: 'No Minho, Braga é o ponto de encontro de quem vive entre Guimarães, Barcelos e Famalicão.' },
  { name: 'Coimbra', slug: 'coimbra', regiao: 'Região de Coimbra',
    vizinhas: ['Figueira da Foz', 'Cantanhede', 'Condeixa-a-Nova', 'Lousã'],
    frase: 'No Centro, Coimbra junta um público jovem e universitário com casais de toda a região, até a Figueira da Foz.' },
  { name: 'Faro', slug: 'faro', regiao: 'Algarve', naRegiao: 'no Algarve', todaRegiao: 'todo o Algarve',
    vizinhas: ['Loulé', 'Albufeira', 'Portimão', 'Olhão', 'Lagos', 'Tavira'],
    frase: 'No Algarve, de Faro a Lagos, o público muda com a estação: residentes o ano inteiro e muita gente de fora no verão.' },
  { name: 'Setúbal', slug: 'setubal', regiao: 'Península de Setúbal',
    vizinhas: ['Almada', 'Seixal', 'Barreiro', 'Palmela', 'Sesimbra'],
    frase: 'Na outra margem do Tejo, Setúbal, Almada e o Seixal ficam a poucos minutos de Lisboa.' },
  { name: 'Aveiro', slug: 'aveiro', regiao: 'Região de Aveiro',
    vizinhas: ['Ílhavo', 'Ovar', 'Águeda', 'Espinho'],
    frase: 'Entre o Porto e Coimbra, Aveiro reúne casais da ria e do litoral, de Ílhavo a Espinho.' },
  { name: 'Leiria', slug: 'leiria', regiao: 'Região de Leiria',
    vizinhas: ['Marinha Grande', 'Pombal', 'Batalha', 'Caldas da Rainha'],
    frase: 'No meio do caminho entre Lisboa e Coimbra, Leiria junta quem vive da Marinha Grande às Caldas da Rainha.' },
];

// "no Porto", não "em Porto".
const emCidade = (c) => c.em || `em ${c.name}`;
const deCidade = (c) => c.de || `de ${c.name}`;
const naRegiao = (c) => c.naRegiao || `na ${c.regiao}`;
const todaRegiao = (c) => c.todaRegiao || `toda a ${c.regiao}`;

const ORIGEM_PT = (slug) => (slug ? `swing/portugal/${slug}` : 'swing/portugal');

function faqPortugal(cidade) {
  const onde = cidade ? emCidade(cidade) : 'em Portugal';
  return [
    { p: `Funciona para quem está ${onde}?`, r: `Sim. O NoSigilo.net é uma rede online: você cria o perfil, indica a cidade${cidade ? ` (${esc(cidade.name)} ou arredores, como ${esc(list(cidade.vizinhas.slice(0, 3)))})` : ''} e vê quem está perto, com a distância em km quando a localização está ligada.` },
    { p: 'Quanto custa estando em Portugal?', r: 'Criar a conta é grátis. A assinatura, para quem está em Portugal, fica em cerca de 5 euros por mês e é paga no cartão de crédito ou débito internacional — o valor é cobrado em reais e o seu banco converte.' },
    { p: 'O meu perfil aparece no Google?', r: 'Não. Nenhum perfil é indexado por buscadores; só páginas informativas como esta. As fotos íntimas ficam no álbum privado e só abrem para quem você liberar.' },
    { p: 'Há brasileiros na comunidade em Portugal?', r: 'Sim — boa parte de quem usa o NoSigilo em Portugal é brasileira. A comunidade é a mesma do Brasil, então você também conversa com quem está do outro lado do Atlântico.' },
    { p: 'É só para casais?', r: 'Não. Há casais liberais, mulheres e homens solteiros e a comunidade LGBT+, cada um indicando o que procura: troca de casais, ménage, swing ou encontros casuais.' },
  ];
}

function rodapePortugal() {
  return `<footer class="cl-footer">
      <div style="display:flex;align-items:center;gap:1.5rem;flex-wrap:wrap;">
        <span class="cl-footer-brand">NoSigilo.net</span>
        <div class="cl-footer-age">${icon('badge')}<span>Comunidade exclusiva para maiores de 18 anos.</span></div>
      </div>
      <div class="cl-footer-links">
        <a href="/terms">Termos</a><a href="/privacy">Privacidade</a><a href="/guidelines">Diretrizes</a><a href="/swing/portugal/">Portugal</a><a href="/swing/">Brasil</a>
      </div>
      <div class="cl-footer-states">${PORTUGAL_CIDADES.map((c) => `<a href="/swing/portugal/${c.slug}/">${esc(c.name)}</a>`).join('')}</div>
    </footer>`;
}

// Visual das páginas de Portugal (piloto do redesenho das regionais): escuro,
// sensual e com várias chamadas para o cadastro. Gatilhos só verdadeiros —
// curiosidade, exclusividade, sigilo, gratuidade e o número REAL da comunidade.
// Nada de contador falso, "últimas vagas" ou depoimento inventado.
const PT_CSS = `
body{background:#0d0609;color:#f6ece9;}
.pt a{color:inherit;}
.pt h2 em{font-style:italic;color:#ff7aa0;}
.pt-top{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.9rem clamp(1rem,4vw,3rem);background:rgba(13,6,9,.78);backdrop-filter:blur(10px);border-bottom:1px solid rgba(242,215,163,.12);}
.pt-top .cl-brand{color:#fff;}
.pt-top-acoes{display:flex;align-items:center;gap:1rem;}
.pt-top-login{font-size:.85rem;color:#e9d3cf;text-decoration:none;}
.pt-top-cta{padding:.55rem 1rem;border-radius:999px;background:linear-gradient(135deg,#ff4f7b,#c2185b);color:#fff;font-weight:800;font-size:.85rem;text-decoration:none;box-shadow:0 6px 20px rgba(255,79,123,.35);}
.pt-hero{position:relative;min-height:min(88vh,760px);display:flex;align-items:flex-end;overflow:hidden;}
.pt-hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(1.05) contrast(1.05);}
.pt-hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(13,6,9,.15) 0%,rgba(13,6,9,.55) 45%,#0d0609 96%),radial-gradient(ellipse at 20% 80%,rgba(194,24,91,.35),transparent 60%);}
.pt-hero-copy{position:relative;z-index:1;width:min(100% - 2.5rem,1100px);margin-inline:auto;padding-block:3rem clamp(2.5rem,6vw,4.5rem);}
.pt-crumb{font-size:.78rem;color:#cdb6b2;margin-bottom:.8rem;}
.pt-crumb a{color:#cdb6b2;}
.pt-gancho{display:inline-block;margin-bottom:1rem;padding:.35rem .8rem;border:1px solid rgba(242,215,163,.45);border-radius:999px;color:#f2d7a3;font-size:.8rem;letter-spacing:.04em;}
.pt h1{font-family:Georgia,"Times New Roman",serif;font-weight:400;font-size:clamp(2.3rem,6vw,4.2rem);line-height:1.02;letter-spacing:-.04em;max-width:15ch;text-wrap:balance;color:#fff;}
.pt h1 em{font-style:italic;color:#ff7aa0;}
.pt-intro{margin-top:1.1rem;max-width:36rem;color:#e9d3cf;font-size:1.05rem;line-height:1.65;}
.pt-intro strong{color:#fff;}
.pt-cta{display:inline-flex;align-items:center;gap:.8rem;margin-top:1.6rem;padding:1.05rem 1.6rem;border-radius:999px;background:linear-gradient(135deg,#ff4f7b,#c2185b);color:#fff;font-weight:800;font-size:1.08rem;text-decoration:none;box-shadow:0 0 0 0 rgba(255,79,123,.6),0 18px 40px rgba(194,24,91,.45);animation:ptPulso 2.4s infinite;}
.pt-cta svg{width:1.2rem;height:1.2rem;}
.pt-cta:hover{transform:translateY(-1px);filter:brightness(1.08);}
@keyframes ptPulso{0%{box-shadow:0 0 0 0 rgba(255,79,123,.55),0 18px 40px rgba(194,24,91,.45);}70%{box-shadow:0 0 0 16px rgba(255,79,123,0),0 18px 40px rgba(194,24,91,.45);}100%{box-shadow:0 0 0 0 rgba(255,79,123,0),0 18px 40px rgba(194,24,91,.45);}}
@media (prefers-reduced-motion:reduce){.pt-cta{animation:none;}}
.pt-micro{margin-top:.8rem;font-size:.82rem;color:#cdb6b2;}
.pt-prova{display:flex;align-items:center;gap:.6rem;margin-top:1.4rem;font-size:.9rem;color:#e9d3cf;}
.pt-prova strong{color:#f2d7a3;}
.pt-prova span{display:inline-block;width:.6rem;height:.6rem;border-radius:50%;background:#3ddc84;box-shadow:0 0 10px #3ddc84;}
.pt-sec{width:min(100% - 2.5rem,1100px);margin-inline:auto;padding-block:clamp(3rem,7vw,5.5rem);}
.pt-sec h2{font-family:Georgia,serif;font-weight:400;font-size:clamp(1.9rem,4vw,2.8rem);line-height:1.1;letter-spacing:-.03em;color:#fff;}
.pt-sec h2 em{font-style:italic;color:#ff7aa0;}
.pt-sub{margin-top:.7rem;color:#cdb6b2;max-width:38rem;}
.pt-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1rem;margin-top:2rem;}
.pt-card{position:relative;border-radius:1.1rem;overflow:hidden;aspect-ratio:3/4;background:#1d0d13;}
.pt-card img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .6s ease;}
.pt-card:hover img{transform:scale(1.05);}
.pt-card::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 35%,rgba(13,6,9,.92));}
.pt-card div{position:absolute;left:0;right:0;bottom:0;z-index:1;padding:1.1rem;}
.pt-card h3{font-size:1.05rem;color:#fff;}
.pt-card p{margin-top:.35rem;font-size:.85rem;color:#e0c9c5;line-height:1.45;}
.pt-meio{text-align:center;margin-top:2.2rem;}
.pt-faixa{position:relative;overflow:hidden;padding-block:clamp(3.5rem,8vw,6rem);text-align:center;background:radial-gradient(ellipse at 50% 0%,rgba(255,79,123,.28),transparent 60%),linear-gradient(180deg,#1a0a10,#2a0b17 50%,#1a0a10);}
.pt-faixa blockquote{margin:0 auto;max-width:22ch;font-family:Georgia,serif;font-size:clamp(2rem,5vw,3.2rem);line-height:1.1;color:#fff;font-style:italic;}
.pt-faixa p{margin:1rem auto 0;max-width:34rem;color:#e0c9c5;}
.pt-passos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;margin-top:2rem;counter-reset:passo;}
.pt-passo{padding:1.4rem;border:1px solid rgba(242,215,163,.18);border-radius:1rem;background:rgba(255,255,255,.03);}
.pt-passo::before{counter-increment:passo;content:counter(passo);display:inline-flex;align-items:center;justify-content:center;width:2.2rem;height:2.2rem;border-radius:50%;background:linear-gradient(135deg,#ff4f7b,#c2185b);font-weight:800;color:#fff;margin-bottom:.8rem;}
.pt-passo h3{color:#fff;font-size:1rem;}
.pt-passo p{margin-top:.3rem;color:#cdb6b2;font-size:.9rem;}
.pt-sigilo{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(2rem,5vw,4rem);align-items:center;}
.pt-sigilo figure{margin:0;border-radius:1.2rem;overflow:hidden;aspect-ratio:4/5;}
.pt-sigilo figure img{width:100%;height:100%;object-fit:cover;filter:grayscale(.2);}
.pt-sigilo ul{list-style:none;padding:0;margin:1.4rem 0 0;display:grid;gap:.9rem;}
.pt-sigilo li{display:flex;gap:.8rem;align-items:flex-start;color:#e0c9c5;}
.pt-sigilo li svg{width:1.3rem;height:1.3rem;color:#f2d7a3;flex:0 0 auto;margin-top:.15rem;}
.pt-sigilo li strong{color:#fff;display:block;}
.pt .cl-chips a{background:rgba(255,255,255,.05);border-color:rgba(242,215,163,.25);color:#f2d7a3;}
.pt .cl-chips a:hover{background:rgba(255,79,123,.18);}
.pt .cl-faq h2{color:#fff;}
.pt .cl-faq-list,.pt .cl-faq-item{border-color:rgba(242,215,163,.18);}
.pt .cl-faq-item summary{color:#fff;}
.pt .cl-faq-item summary svg{background:rgba(255,79,123,.12);border-color:rgba(255,79,123,.35);color:#ff7aa0;}
.pt .cl-faq-item p{color:#cdb6b2;}
.pt-final{text-align:center;padding-block:clamp(4rem,9vw,6.5rem);background:radial-gradient(circle at 50% 100%,rgba(255,79,123,.35),transparent 55%),#14070c;}
.pt-final h2{font-family:Georgia,serif;font-weight:400;font-size:clamp(2rem,5vw,3.2rem);color:#fff;max-width:20ch;margin:0 auto;line-height:1.1;}
.pt-final p{margin:1rem auto 0;color:#e0c9c5;max-width:32rem;}
.pt-final .pt-login{display:block;margin-top:1rem;color:#f2d7a3;font-size:.9rem;}
.pt-fixo{display:none;}
@media (max-width:860px){
  .pt-cards{grid-template-columns:repeat(2,minmax(0,1fr));}
  .pt-passos,.pt-sigilo{grid-template-columns:minmax(0,1fr);}
  .pt-sigilo figure{aspect-ratio:16/10;}
  .pt-top-login{display:none;}
  .pt-fixo{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:30;padding:.7rem 1rem calc(.7rem + env(safe-area-inset-bottom));background:rgba(13,6,9,.92);backdrop-filter:blur(10px);border-top:1px solid rgba(242,215,163,.15);}
  .pt-fixo a{flex:1;text-align:center;padding:.95rem;border-radius:999px;background:linear-gradient(135deg,#ff4f7b,#c2185b);color:#fff;font-weight:800;text-decoration:none;}
  .pt{padding-bottom:5rem;}
}
`;

function documentoPortugal(opcoes) {
  return campaignDocument({ ...opcoes, lang: 'pt-PT', ogLocale: 'pt_PT', geoRegion: 'PT', extraCss: PT_CSS });
}

/** Número real da comunidade (Brasil + Portugal), arredondado para baixo. */
function provaComunidade() {
  // Sem número (pedido do dono): "muita gente" é verdade na comunidade toda,
  // mas não em Portugal sozinho — por isso a frase fala de Brasil E Portugal.
  return '<strong>Muita gente</strong> já está lá dentro — casais e singles do Brasil e de Portugal';
}

/** Corpo comum das páginas de Portugal; `c` = cidade ou null (página do país). */
function corpoPortugal(c) {
  const origem = ORIGEM_PT(c?.slug);
  const cad = cadastroUrl(origem);
  const lugar = c ? esc(c.name) : 'Portugal';
  const emLugar = c ? esc(emCidade(c)) : 'em Portugal';
  const cta = (texto) => `<a class="pt-cta" href="${cad}">${texto} ${icon('arrow')}</a>`;
  const prova = provaComunidade();
  const cidadesLinks = c ? PORTUGAL_CIDADES.filter((x) => x.slug !== c.slug) : PORTUGAL_CIDADES;

  const intro = c
    ? `Procurando <strong>swing ${emLugar}</strong> ou <strong>troca de casais ${esc(naRegiao(c))}</strong>? ${esc(c.frase)} Aqui casais liberais e singles se encontram longe dos olhares — para swing, ménage e encontros casuais.`
    : 'Procurando <strong>swing em Lisboa</strong>, <strong>troca de casais no Porto</strong> ou um encontro liberal no Algarve? Aqui casais liberais e singles de Portugal se encontram longe dos olhares — para swing, ménage e encontros casuais.';

  return `<div class="pt">
    <header class="pt-top">
      <a class="cl-brand" href="/">NoSigilo<em>.net</em></a>
      <div class="pt-top-acoes">
        <a class="pt-top-login" href="${loginUrl(origem)}">Já sou membro</a>
        <a class="pt-top-cta" href="${cad}">Criar conta grátis</a>
      </div>
    </header>

    <section class="pt-hero">
      <img src="/landing/hero-masquerade-722.webp" alt="Casais mascarados num encontro liberal discreto" width="722" height="361" loading="eager" />
      <div class="pt-hero-copy">
        <p class="pt-crumb">${c ? `<a href="/swing/portugal/">Portugal</a> › ${lugar}` : '<a href="/swing/">Brasil</a> · Portugal'}</p>
        <span class="pt-gancho">O lado liberal ${c ? (c.de ? esc(c.de) : `de ${lugar}`) : 'de Portugal'} que não aparece no Instagram</span>
        <h1>Swing e Troca de Casais ${c?.em ? 'no' : 'em'} <em>${lugar}</em></h1>
        <p class="pt-intro">${intro}</p>
        ${cta('Quero entrar — é grátis')}
        <p class="pt-micro">Conta gratuita · Perfil fora do Google · Só para maiores de 18</p>
        ${prova ? `<p class="pt-prova"><span></span>${prova}</p>` : ''}
      </div>
    </section>

    <section class="pt-sec">
      <h2>O que te espera <em>lá dentro</em></h2>
      <p class="pt-sub">Tudo pensado para quem quer viver o meio liberal sem se expor.</p>
      <div class="pt-cards">
        <div class="pt-card"><img src="/landing/real-gaze-trio-722.webp" alt="Três adultos trocando olhares num ambiente reservado" loading="lazy" /><div><h3><a href="${CASA_PT_PATH}">A Casa 🔥</a></h3><p>A casa de swing online de sexta e sábado: salas ao vivo, brincadeiras quentes e cabine a dois. <a href="${CASA_PT_PATH}">Como funciona</a></p></div></div>
        <div class="pt-card"><img src="/landing/real-bw-kiss-722.webp" alt="Casal a beijar-se em preto e branco" loading="lazy" /><div><h3>Álbum privado</h3><p>As fotos mais íntimas só abrem para quem você liberar — e dá para tirar o acesso.</p></div></div>
        <div class="pt-card"><img src="/landing/real-sofa-trio-722.webp" alt="Três adultos num sofá, em clima descontraído" loading="lazy" /><div><h3>Quem está perto</h3><p>Distância em km ${emLugar === 'em Portugal' ? 'de cada perfil' : `de quem está ${emLugar}`}, e o Match para curtir em segredo.</p></div></div>
        <div class="pt-card"><img src="/landing/real-curls-722.webp" alt="Retrato sensual de mulher de cabelo cacheado" loading="lazy" /><div><h3>Conversa discreta</h3><p>Mensagens privadas e fotos de visualização única, que somem depois de vistas.</p></div></div>
      </div>
      <div class="pt-meio">${cta('Ver quem está ' + (c ? emLugar : 'em Portugal'))}</div>
    </section>

    <section class="pt-faixa">
      <blockquote>Toda fantasia começa com uma conversa.</blockquote>
      <p>Casais, mulheres e homens solteiros dizem logo o que procuram. Sem rodeios, sem julgamento, sem ninguém de fora saber.</p>
      <div class="pt-meio">${cta('Começar a minha')}</div>
    </section>

    <section class="pt-sec">
      <h2>Entrar é <em>simples</em></h2>
      <div class="pt-passos">
        <div class="pt-passo"><h3>Crie a conta grátis</h3><p>Diga se é casal, mulher ou homem solteiro, e o que procura.</p></div>
        <div class="pt-passo"><h3>Mostre só o que quiser</h3><p>Fotos públicas para atrair; as íntimas ficam no álbum privado.</p></div>
        <div class="pt-passo"><h3>Converse e combine</h3><p>Curta, converse e marque quando sentir que é a pessoa certa.</p></div>
      </div>
      <div class="pt-meio">${cta('Criar a minha conta')}</div>
    </section>

    <section class="pt-sec pt-sigilo">
      <figure><img src="/landing/real-blur-duo-722.webp" alt="Casal desfocado, simbolizando discrição" loading="lazy" /></figure>
      <div>
        <h2>Ninguém <em>fica a saber</em></h2>
        <p class="pt-sub">Num país pequeno, ser reconhecido é o maior receio de quem vive o meio liberal. Por isso o sigilo aqui não é promessa — é como tudo foi construído.</p>
        <ul>
          <li>${icon('eye')}<div><strong>Perfil fora do Google</strong>Só páginas informativas como esta aparecem nas pesquisas.</div></li>
          <li>${icon('lock')}<div><strong>Fotos sob o seu controle</strong>Você decide quem vê as mais íntimas.</div></li>
          <li>${icon('shield')}<div><strong>Visualização única</strong>O que é sensível pode sumir depois de visto.</div></li>
        </ul>
        ${cta('Entrar com discrição')}
      </div>
    </section>

    <section class="pt-sec">
      <h2>${c ? `Perto ${esc(deCidade(c))}` : 'Cidades em <em>Portugal</em>'}</h2>
      ${c ? `<p class="pt-sub">Com a localização ligada, você vê a distância em km de cada perfil — ${esc(deCidade(c))} a ${esc(list(c.vizinhas))}.</p>` : '<p class="pt-sub">Página própria para quem procura perto de casa.</p>'}
      <div class="cl-chips" style="margin-top:1.2rem">${cidadesLinks.map((x) => `<a href="/swing/portugal/${x.slug}/">Swing ${esc(emCidade(x))}</a>`).join('')}</div>
    </section>

    ${campaignFaqSection(faqPortugal(c))}

    <section class="pt-final">
      <h2>A sua próxima história pode começar hoje.</h2>
      <p>Crie a conta grátis e descubra quem está ${emLugar} na mesma sintonia.</p>
      <div class="pt-meio">${cta('Quero entrar — é grátis')}</div>
      <a class="pt-login" href="${loginUrl(origem)}">Já tenho uma conta</a>
    </section>

    ${rodapePortugal()}

    <div class="pt-fixo"><a href="${cad}">Criar conta grátis</a></div>
  </div>`;
}

function paginaPortugal() {
  const title = melhorTitle([
    'Swing e Troca de Casais em Portugal · Lisboa, Porto | NoSigilo',
    'Swing e Troca de Casais em Portugal · Lisboa e Porto',
    'Swing e Troca de Casais em Portugal | NoSigilo',
  ]);
  const desc = melhorDesc([
    'Swing, troca de casais e ménage em Lisboa, Porto, Braga, Faro e todo Portugal. Rede adulta discreta, com sigilo. Criar conta é grátis.',
    'Swing, troca de casais e ménage em Portugal. Rede adulta discreta, com sigilo. Criar conta é grátis.',
  ]);
  const url = `${REGIONAL}/swing/portugal/`;
  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'WebPage', name: title, description: desc, url, inLanguage: 'pt-PT',
      isPartOf: { '@type': 'WebSite', name: 'NoSigilo.net', url: SITE },
      about: { '@type': 'Place', name: 'Portugal' }, areaServed: { '@type': 'Country', name: 'Portugal' } },
    breadcrumbLd([{ name: 'Início', path: '/' }, { name: 'Portugal', path: '/swing/portugal/' }]),
    faqJsonLd(faqPortugal(null)),
  ];
  return documentoPortugal({ title, desc, url, geoPlace: 'Portugal', jsonld, body: corpoPortugal(null) });
}

function paginaCidadePortugal(c) {
  const title = melhorTitle([
    `Troca de Casais ${emCidade(c)} · Swing e Ménage | NoSigilo`,
    `Troca de Casais ${emCidade(c)} · Swing e Ménage`,
    `Troca de Casais e Swing ${emCidade(c)}, Portugal`,
    `Troca de Casais e Swing ${emCidade(c)}`,
  ]);
  const desc = melhorDesc([
    `Swing, troca de casais e ménage ${emCidade(c)} e ${list(c.vizinhas.slice(0, 3))}. Rede adulta discreta, com sigilo. Criar conta é grátis.`,
    `Swing, troca de casais e ménage ${emCidade(c)} e região. Rede adulta discreta, com sigilo. Criar conta é grátis.`,
  ]);
  const url = `${REGIONAL}/swing/portugal/${c.slug}/`;
  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'WebPage', name: title, description: desc, url, inLanguage: 'pt-PT',
      isPartOf: { '@type': 'WebSite', name: 'NoSigilo.net', url: SITE },
      about: { '@type': 'Place', name: `${c.name}, Portugal` }, areaServed: { '@type': 'City', name: c.name } },
    breadcrumbLd([
      { name: 'Início', path: '/' },
      { name: 'Portugal', path: '/swing/portugal/' },
      { name: c.name, path: `/swing/portugal/${c.slug}/` },
    ]),
    faqJsonLd(faqPortugal(c)),
  ];
  return documentoPortugal({ title, desc, url, geoPlace: `${c.name}, Portugal`, jsonld, body: corpoPortugal(c) });
}


// ---------------------------------------------------------------------------
//  Camada "sensual" das páginas do Brasil (11/2026)
// ---------------------------------------------------------------------------
// O mesmo visual das páginas de Portugal, aplicado POR CIMA do conteúdo que o
// Google já indexou: texto, números, links e FAQ das páginas do Brasil ficam
// como estão. Entram o tema escuro, o topo em tela cheia, o gancho de
// curiosidade, os cartões do que tem lá dentro, a faixa de desejo, mais
// chamadas para o cadastro e a barra fixa no celular — em português do Brasil.
const BR_CSS = PT_CSS + `
.cl{color:#f6ece9;}
.cl h1,.cl h2{color:#fff;}
.cl h1 em,.cl h2 em{color:#ff7aa0;font-style:italic;}
.cl-hero{position:relative;display:flex;align-items:flex-end;width:100%;max-width:none;min-height:min(88vh,760px);margin:0;padding:0;overflow:hidden;}
.cl-hero-media{position:absolute;inset:0;aspect-ratio:auto;border-radius:0;box-shadow:none;}
.cl-hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(13,6,9,.25) 0%,rgba(13,6,9,.65) 45%,#0d0609 96%),radial-gradient(ellipse at 20% 80%,rgba(194,24,91,.35),transparent 60%);}
.cl-hero-copy{position:relative;z-index:1;width:min(100% - 2.5rem,1100px);margin-inline:auto;padding-block:6rem clamp(2.5rem,6vw,4.5rem);}
.cl-hero h1{font-size:clamp(2.3rem,6vw,4.2rem);line-height:1.02;max-width:16ch;}
.cl-crumb,.cl-crumb a{color:#cdb6b2;}
.cl-intro{color:#e9d3cf;max-width:38rem;}
.cl-intro strong{color:#fff;}
.cl-prova{display:inline-block;background:rgba(255,255,255,.05);border-color:rgba(242,215,163,.25);border-left-color:#ff4f7b;color:#e9d3cf;}
.cl-prova strong{color:#f2d7a3;}
.cl-cta{width:auto;justify-content:center;border-radius:999px;padding:1.05rem 1.6rem;background:linear-gradient(135deg,#ff4f7b,#c2185b);font-size:1.05rem;box-shadow:0 18px 40px rgba(194,24,91,.45);animation:ptPulso 2.4s infinite;}
.cl-cta:hover{background:linear-gradient(135deg,#ff4f7b,#c2185b);filter:brightness(1.08);}
@media (prefers-reduced-motion:reduce){.cl-cta{animation:none;}}
.cl-trust{border-color:rgba(242,215,163,.18);}
.cl-trust-item{color:#e0c9c5;}
.cl-trust-item svg{color:#f2d7a3;}
.cl-alt-copy>p,.cl-list-item p,.cl-region p,.cl-etiquette,.cl-faq-item p{color:#cdb6b2;}
.cl-list,.cl-list-item,.cl-faq-list,.cl-faq-item{border-color:rgba(242,215,163,.18);}
.cl-list-item h3,.cl-faq-item summary{color:#fff;}
.cl-list-item svg{color:#ff7aa0;}
.cl-alt-media{border-radius:1.2rem;}
.cl-dark{background:radial-gradient(ellipse at 80% 0%,rgba(255,79,123,.18),transparent 55%),#1a0a10;}
.cl-region{border-color:rgba(242,215,163,.15) !important;}
.cl-region h2{color:#fff;}
.cl-region span{color:#f2d7a3 !important;}
.cl-chips a{background:rgba(255,255,255,.05);border-color:rgba(242,215,163,.25);color:#f2d7a3;}
.cl-chips a:hover{background:rgba(255,79,123,.18);}
.cl-etiquette strong{color:#fff;}
.cl-faq-item summary svg{background:rgba(255,79,123,.12);border-color:rgba(255,79,123,.35);color:#ff7aa0;}
.cl-final{background:radial-gradient(circle at 50% 100%,rgba(255,79,123,.35),transparent 55%),#14070c;}
.cl-dados-lista li::before{background:#ff4f7b;}
@media (max-width:860px){
  .cl-hero-media{order:0;aspect-ratio:auto;}
  .cl{padding-bottom:5rem;}
}
`;

/** Aplica a camada sensual no corpo de uma página do Brasil.
 *  `lugar` = "Fortaleza", "Ceará" ou null (página /swing/). */
function camadaBrasil(body, origem, lugar) {
  const cad = cadastroUrl(origem);
  const cta = (texto) => `<a class="pt-cta" href="${cad}">${texto} ${icon('arrow')}</a>`;
  const emLugar = lugar ? `em ${esc(lugar)}` : 'perto de você';
  const topo = `<header class="pt-top">
      <a class="cl-brand" href="/">NoSigilo<em>.net</em></a>
      <div class="pt-top-acoes">
        <a class="pt-top-login" href="${loginUrl(origem)}">Já sou membro</a>
        <a class="pt-top-cta" href="${cad}">Criar conta grátis</a>
      </div>
    </header>`;
  const gancho = `<span class="pt-gancho">O lado liberal ${lugar ? `de ${esc(lugar)}` : 'do Brasil'} que não aparece no Instagram</span>`;
  const dentro = `
    <section class="pt-sec">
      <h2>O que te espera <em>lá dentro</em></h2>
      <p class="pt-sub">Tudo pensado para quem quer viver o meio liberal sem se expor.</p>
      <div class="pt-cards">
        <div class="pt-card"><img src="/landing/real-gaze-trio-722.webp" alt="Três adultos trocando olhares num ambiente reservado" loading="lazy" /><div><h3>A Casa 🔥</h3><p>A boate virtual de sexta e sábado: salas ao vivo, brincadeiras quentes e cabine a dois.</p></div></div>
        <div class="pt-card"><img src="/landing/real-bw-kiss-722.webp" alt="Casal se beijando em preto e branco" loading="lazy" /><div><h3>Álbum privado</h3><p>As fotos mais íntimas só abrem para quem você liberar — e dá para tirar o acesso.</p></div></div>
        <div class="pt-card"><img src="/landing/real-sofa-trio-722.webp" alt="Três adultos num sofá, em clima descontraído" loading="lazy" /><div><h3>Quem está perto</h3><p>Distância em km de quem está ${emLugar}, e o Match para curtir em segredo.</p></div></div>
        <div class="pt-card"><img src="/landing/real-curls-722.webp" alt="Retrato sensual de mulher de cabelo cacheado" loading="lazy" /><div><h3>Conversa discreta</h3><p>Mensagens privadas e fotos de visualização única, que somem depois de vistas.</p></div></div>
      </div>
      <div class="pt-meio">${cta(lugar ? `Ver quem está ${emLugar}` : 'Ver quem está perto')}</div>
    </section>`;
  const faixa = `
    <section class="pt-faixa">
      <blockquote>Toda fantasia começa com uma conversa.</blockquote>
      <p>Casais, mulheres e homens solteiros dizem logo o que procuram. Sem rodeio, sem julgamento, sem ninguém de fora ficar sabendo.</p>
      <div class="pt-meio">${cta('Começar a minha')}</div>
    </section>
`;
  const depoisDoSigilo = `
    <div class="pt-meio" style="padding-block:2.5rem 1rem">${cta('Entrar com discrição')}</div>`;
  const fixo = `
    <div class="pt-fixo"><a href="${cad}">Criar conta grátis</a></div>`;

  let b = body;
  const iniTopo = b.indexOf('<header class="cl-header">');
  const fimTopo = b.indexOf('</header>', iniTopo) + '</header>'.length;
  if (iniTopo >= 0) b = b.slice(0, iniTopo) + topo + b.slice(fimTopo);
  b = b.replace('<h1>', `${gancho}\n        <h1>`);
  const fimHero = b.indexOf('</section>', b.indexOf('<section class="cl-hero">')) + '</section>'.length;
  b = b.slice(0, fimHero) + dentro + b.slice(fimHero);
  const iniEscuro = b.indexOf('<section class="cl-dark">');
  if (iniEscuro >= 0) {
    b = b.slice(0, iniEscuro) + faixa + b.slice(iniEscuro);
    const iniEscuro2 = b.indexOf('<section class="cl-dark">');
    // a seção escura tem um <section> só, então o primeiro </section> depois dela a fecha
    const fimEscuro = b.indexOf('</section>', iniEscuro2) + '</section>'.length;
    b = b.slice(0, fimEscuro) + depoisDoSigilo + b.slice(fimEscuro);
  }
  return b + fixo;
}

// ---------------------------------------------------------------------------
//  A Casa: bloco nas páginas de cidade + página "casa de swing online" (11/2026)
// ---------------------------------------------------------------------------
// Quem procura "casa de swing em <cidade do interior>" muitas vezes não tem
// casa perto, ou tem e não quer ser reconhecido na porta. As páginas de cidade
// já recebem essa busca; o bloco oferece A Casa ali mesmo. A página própria
// existe porque /acasa é tela do app (React), que o Google lê mal.
//
// A página mora em /swing/casa-de-swing-online/ de propósito: assim a origem
// "swing/casa-de-swing-online" passa no mesmo formato que o app e o backend já
// validam, e os cadastros dela aparecem no card de desempenho do admin sem
// nenhuma mudança fora deste script.
//
// Os fatos (horário, salas, regras, preço) vêm de backend/src/casa.ts e do
// manual do suporte (supportAiConhecimento.ts). Mudou lá, mude aqui.
const CASA_SLUG = 'casa-de-swing-online';
const CASA_PATH = `/swing/${CASA_SLUG}/`;
const CASA_ORIGEM = `swing/${CASA_SLUG}`;
const casaUrl = (origem) => `/acasa?origem=${origem}`;
// Portugal: mesma Casa (horário de Brasília). Em Portugal continental são +3h
// no inverno (WET) e +4h no verão (WEST) — por isso as duas horas no texto.
const CASA_PT_PATH = `/swing/portugal/${CASA_SLUG}/`;
const CASA_PT_ORIGEM = `swing/portugal/${CASA_SLUG}`;

const CASA_CSS = `
.casa-bloco{width:min(100% - 2.5rem,1100px);margin:clamp(2rem,5vw,3.5rem) auto;padding:clamp(1.4rem,4vw,2.2rem);border-radius:1.2rem;background:radial-gradient(ellipse at 90% 0%,rgba(217,70,239,.28),transparent 60%),linear-gradient(135deg,#2a0a1c,#14070c);border:1px solid rgba(255,122,160,.35);box-shadow:0 20px 50px rgba(194,24,91,.25);}
.casa-bloco .casa-etiqueta{display:inline-block;font-size:.7rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#f0abfc;}
.casa-bloco h2{margin-top:.4rem;font-size:clamp(1.6rem,3.4vw,2.3rem);line-height:1.1;}
.casa-bloco p{margin-top:.8rem;color:#e9d3cf;max-width:44rem;}
.casa-bloco ul{margin:1rem 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:.5rem;}
.casa-bloco li{padding:.35rem .8rem;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(242,215,163,.22);font-size:.82rem;color:#f2d7a3;}
.casa-acoes{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem 1.4rem;}
.casa-acoes .cl-cta{margin-top:1.3rem;}
.casa-mais{margin-top:1.3rem;color:#f2d7a3;font-weight:700;font-size:.92rem;}
.casa-salas{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:.9rem;margin-top:1.4rem;}
.casa-sala{padding:1.1rem 1.2rem;border-radius:1rem;background:rgba(255,255,255,.04);border:1px solid rgba(242,215,163,.18);}
.casa-sala h3{font-size:1rem;color:#fff;}
.casa-sala p{margin-top:.35rem;color:#cdb6b2;font-size:.88rem;line-height:1.5;}
.casa-pulseiras{margin-top:1.2rem;display:grid;gap:.6rem;}
.casa-pulseiras div{display:flex;gap:.8rem;align-items:baseline;color:#cdb6b2;font-size:.92rem;}
.casa-pulseiras b{color:#fff;min-width:6.5rem;}
`;

/** Bloco d'A Casa na página da cidade. */
function blocoCasaCidade(city) {
  const st = city.state;
  return `<section class="casa-bloco" id="a-casa">
      <span class="casa-etiqueta">Casa de swing online · só para maiores de 18</span>
      <h2>Não tem casa de swing perto de <em>${esc(city.name)}</em>?</h2>
      <p>
        Conheça <strong>A Casa</strong>, a casa de swing online do NoSigilo. Você entra de ${esc(city.name)} mesmo,
        sem fila na porta e sem ninguém te reconhecer: salas ao vivo com casais, mulheres e singles,
        brincadeiras puxadas pela anfitriã e cabine reservada a dois.
      </p>
      <ul>
        <li>Sexta e sábado a partir das 22h</li>
        <li>Mulher entra grátis</li>
        <li>Discrição total</li>
      </ul>
      <div class="casa-acoes">
        <a class="cl-cta" href="${casaUrl(`swing/${st.slug}/${city.slug}`)}">Reservar meu lugar ${icon('arrow')}</a>
        <a class="casa-mais" href="${CASA_PATH}">Como funciona A Casa →</a>
      </div>
    </section>`;
}

const CASA_SALAS = [
  { nome: '🍸 Salão Principal', desc: 'A pista de todo mundo: conhecer, provocar e chamar alguém para a cabine.' },
  { nome: '💑 Sala dos Casais', desc: 'Só casais e mulheres, com as brincadeiras mais quentes da noite.' },
  { nome: '😈 Quarto Cuckold', desc: 'Para casais que gostam de exibir a esposa. Quem escolhe é ela; solteiros entram sem fila.' },
  { nome: '🫦 Suruba', desc: 'A sala mais liberada da noite. Casais e mulheres entram direto; o solteiro entra se animou a noite ou se for chamado.' },
];

const CASA_PULSEIRAS = [
  ['🟢 Verde', 'aberto a tudo.'],
  ['🟡 Amarela', 'só soft: beijos e carícias, sem sexo com outros.'],
  ['🟣 Roxa', 'single bem-vindo.'],
  ['🔴 Vermelha', 'só olhando. Nunca é sorteado nas brincadeiras.'],
];

function faqCasa(pt = false) {
  if (pt) return [
    { p: 'O que é uma casa de swing online?',
      r: 'É uma casa de swing que acontece pela internet. A Casa do NoSigilo tem salas ao vivo com casais, mulheres e homens solteiros, uma anfitriã que puxa as brincadeiras, um bar para pagar drinks e cabines reservadas para conversar a dois ou em grupo. Tudo pelo telemóvel ou computador, sem sair de casa.' },
    { p: 'Quando A Casa abre, na hora de Portugal?',
      r: 'A Casa segue o horário de Brasília: sexta das 22h à 1h e sábado das 22h às 2h. Em Portugal continental isso dá, no inverno, das 1h às 4h da madrugada de sábado e das 1h às 5h de domingo; no horário de verão, uma hora a mais (das 2h às 5h e das 2h às 6h). Quem reserva o lugar recebe um aviso no telemóvel quando abre.' },
    { p: 'Moro em Portugal. Posso entrar?',
      r: 'Pode. A Casa é online e a comunidade é a mesma do Brasil, então você conversa com casais e singles de Portugal e do outro lado do Atlântico. É uma boa opção para quem não quer ser visto a entrar numa casa de swing, num país onde todo mundo se conhece.' },
    { p: 'Quanto custa?',
      r: 'Mulheres entram grátis, com tudo liberado. Sem assinar, qualquer pessoa entra a espreitar: lê a conversa, mas não fala. Para conversar, brincar, mandar foto e ir para a cabine é preciso ser Premium, que para quem está em Portugal fica em cerca de 5 euros por mês, pago no cartão internacional (o valor é cobrado em reais e o seu banco converte). Casais têm 15 dias grátis no cadastro.' },
    { p: 'Alguém vai saber que eu entrei?',
      r: 'O seu e-mail e a sua localização exata nunca aparecem, e os perfis do NoSigilo não aparecem no Google. Print e gravação de ecrã são proibidos na Casa: o ecrã leva uma marca d’água com a identificação de quem está a ver, e quem vazar conteúdo é banido. Fotos e vídeos enviados lá dentro são de visualização única.' },
    { p: 'Homem solteiro pode entrar?',
      r: 'Pode. Para a noite ficar boa para todos, homens ocupam no máximo metade de cada sala; quando lota, dá para entrar na fila ou ser chamado por um casal ou uma mulher, e aí entra sem fila. No Quarto Cuckold os solteiros entram à vontade.' },
  ];
  return [
    { p: 'O que é uma casa de swing online?',
      r: 'É uma casa de swing que acontece pela internet. A Casa do NoSigilo tem salas ao vivo com casais, mulheres e homens solteiros, uma anfitriã que puxa as brincadeiras, um bar para pagar drinks e cabines reservadas para conversar a dois ou em grupo. Tudo pelo celular ou computador, sem sair de casa.' },
    { p: 'Quando A Casa abre?',
      r: 'Toda sexta, das 22h à 1h, e todo sábado, das 22h às 2h (horário de Brasília). Quem reserva o lugar recebe um aviso no celular quando abre.' },
    { p: 'Moro no interior e não tem casa de swing na minha cidade. Posso entrar?',
      r: 'Pode. A Casa é online: dá para entrar de qualquer cidade do Brasil. É justamente para quem tem vontade de conhecer o meio liberal e não tem uma casa por perto, ou não quer ser visto entrando numa.' },
    { p: 'Quanto custa?',
      r: 'Mulheres entram grátis, com tudo liberado. Sem assinar, qualquer pessoa entra espiando: lê a conversa, mas não fala. Para conversar, brincar, mandar foto e ir para a cabine é preciso ser Premium (R$ 9,90 por mês) ou estar no período grátis do cadastro (casais têm 15 dias).' },
    { p: 'Alguém vai saber que eu entrei?',
      r: 'Seu e-mail e sua localização exata nunca aparecem, e os perfis do NoSigilo não aparecem no Google. Print e gravação de tela são proibidos na Casa: a tela leva uma marca d’água com a identificação de quem está vendo, e quem vazar conteúdo é banido. Fotos e vídeos enviados lá dentro são de visualização única.' },
    { p: 'Homem solteiro pode entrar?',
      r: 'Pode. Para a noite ficar boa para todos, homens ocupam no máximo metade de cada sala; quando lota, dá para entrar na fila ou ser chamado por um casal ou uma mulher, e aí entra sem fila. No Quarto Cuckold os solteiros entram à vontade.' },
    { p: 'Somos um casal iniciante. Como começamos?',
      r: 'Escolham a pulseira vermelha (só olhando) ou a amarela (só soft) e fiquem à vontade para observar. Nas brincadeiras, só é sorteado quem marca "Quero brincar", e "Passo" sempre vale. A cabine só abre se todos de dentro quiserem.' },
  ];
}

function casaPage(pt = false) {
  const path = pt ? CASA_PT_PATH : CASA_PATH;
  const origem = pt ? CASA_PT_ORIGEM : CASA_ORIGEM;
  const url = `${REGIONAL}${path}`;
  const title = pt
    ? 'Casa de Swing Online em Portugal: A Casa, a boate liberal virtual | NoSigilo'
    : 'Casa de Swing Online: A Casa, a boate liberal virtual | NoSigilo';
  const desc = pt
    ? 'Casa de swing online para quem está em Portugal: salas ao vivo com casais, mulheres e singles de Portugal e do Brasil, sexta e sábado. Mulher entra grátis. Com discrição total.'
    : 'Casa de swing online e virtual: salas ao vivo com casais, mulheres e singles, toda sexta e sábado a partir das 22h. Mulher entra grátis. Entre de qualquer cidade, com discrição.';
  const faq = faqCasa(pt);
  const jsonld = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      description: desc,
      url,
      inLanguage: 'pt-BR',
      isPartOf: { '@type': 'WebSite', name: 'NoSigilo.net', url: SITE },
      ...(pt ? { inLanguage: 'pt-PT', areaServed: { '@type': 'Country', name: 'Portugal' } } : {}),
    },
    breadcrumbLd(pt
      ? [{ name: 'Início', path: '/' }, { name: 'Portugal', path: '/swing/portugal/' }, { name: 'Casa de swing online', path }]
      : [{ name: 'Início', path: '/' }, { name: 'Swing por estado', path: '/swing/' }, { name: 'Casa de swing online', path }]),
    faqJsonLd(faq),
  ];
  const reservar = (texto) => `<a class="cl-cta" href="${casaUrl(origem)}">${texto} ${icon('arrow')}</a>`;
  const crumb = pt ? '<a href="/swing/portugal/">Portugal</a> › Casa de swing online' : '<a href="/swing/">Swing por estado</a> › Casa de swing online';
  const intro = pt
    ? `Tem vontade de conhecer uma <strong>casa de swing</strong>, mas não quer ser visto a entrar numa, num país onde
          todo mundo se conhece? <strong>A Casa</strong> é a <strong>casa de swing virtual</strong> do NoSigilo: toda sexta e
          sábado à noite, casais, mulheres e singles de Portugal e do Brasil se encontram em salas ao vivo, com brincadeiras,
          bar e cabine reservada. Você entra de casa, pelo telemóvel, e só mostra o que quiser.`
    : `Tem vontade de conhecer uma <strong>casa de swing</strong>, mas não tem nenhuma perto, ou tem receio de ser
          reconhecido na porta? <strong>A Casa</strong> é a <strong>casa de swing virtual</strong> do NoSigilo: toda sexta e
          sábado, a partir das 22h, casais, mulheres e singles se encontram em salas ao vivo, com brincadeiras,
          bar e cabine reservada. Você entra de qualquer cidade, pelo celular, e só mostra o que quiser.`;
  const horario = pt
    ? '<strong>Sexta e sábado à noite</strong>&nbsp;· em Portugal, a partir da 1h da madrugada (2h no horário de verão) · mulher entra grátis'
    : '<strong>Sexta 22h–1h · Sábado 22h–2h</strong>&nbsp;(horário de Brasília) · mulher entra grátis';
  const pertoChips = pt
    ? `<a href="/swing/portugal/">Swing em Portugal</a>${PORTUGAL_CIDADES.map((c) => `<a href="/swing/portugal/${c.slug}/">Swing ${esc(emCidade(c))}</a>`).join('')}`
    : `<a href="/swing/">Swing por estado</a>
        ${SELECTED_STATES.map((s) => `<a href="/swing/${s.slug}/">Swing em ${esc(s.name)}</a>`).join('')}`;

  const body = `${campaignHeader(origem)}

    <section class="cl-hero">
      <div class="cl-hero-copy">
        <p class="cl-crumb">${crumb}</p>
        <h1>Casa de swing <em>online</em>${pt ? ' em Portugal' : ''}: conheça A Casa</h1>
        <p class="cl-intro">
          ${intro}
        </p>
        <p class="cl-prova">${horario}</p>
        ${reservar('Reservar meu lugar')}
        <div class="cl-trust">
          <span class="cl-trust-item">${icon('users')}Casais, mulheres e singles</span>
          <span class="cl-trust-item">${icon('lock')}Discrição total</span>
          <span class="cl-trust-item">${icon('badge')}Só maiores de 18</span>
        </div>
      </div>
      <figure class="cl-hero-media">
        <img src="/landing/hero-masquerade-722.webp" alt="Casal adulto mascarado numa festa liberal" width="722" height="361" loading="eager" />
      </figure>
    </section>

    <section class="cl-section cl-region">
      <h2>As salas da Casa</h2>
      <p>Cada sala tem seu clima. Você circula entre elas durante a noite.</p>
      <div class="casa-salas">
        ${CASA_SALAS.map((s) => `<div class="casa-sala"><h3>${esc(s.nome)}</h3><p>${esc(s.desc)}</p></div>`).join('\n        ')}
      </div>
    </section>

    <section class="cl-section cl-alt">
      <div class="cl-alt-copy">
        <h2>Como <em>funciona</em> a noite</h2>
        <p>A Casa foi pensada para quem nunca foi a uma casa de swing e também para quem já é do meio.</p>
        <div class="cl-list">
          ${listItemsHtml([
            { ic: 'badge', title: 'Escolha sua pulseira', desc: 'Ela diz para todo mundo até onde você quer ir naquela noite. Dá para trocar quando quiser.' },
            { ic: 'users', title: 'Brincadeiras com a anfitriã', desc: 'A Lola, anfitriã da Casa, puxa eu nunca, verdade ou desafio, quiz, match às cegas e o Show da Meia-Noite. Só é sorteado quem marca "Quero brincar".' },
            { ic: 'gift', title: 'Bar e olhares', desc: 'Pague um drink para alguém, mande um olhar discreto e, quando os olhares se cruzam, a Casa sugere a cabine.' },
            { ic: 'lock', title: 'Cabine reservada', desc: 'A dois ou em grupo. A porta só abre se todos de dentro quiserem, e qualquer um para a brincadeira na hora.' },
          ])}
        </div>
      </div>
      <figure class="cl-alt-media">
        <img src="/landing/gaze-couple-722.webp" alt="Casal adulto trocando olhares com discrição" width="722" height="481" loading="lazy" />
      </figure>
    </section>

    <section class="cl-section cl-region">
      <h2>As pulseiras</h2>
      <p>Como numa casa de swing de verdade, a pulseira avisa seus limites sem você precisar explicar.</p>
      <div class="casa-pulseiras">
        ${CASA_PULSEIRAS.map(([cor, txt]) => `<div><b>${cor}</b><span>${esc(txt)}</span></div>`).join('\n        ')}
      </div>
    </section>

    <section class="cl-dark">
      <div class="cl-section cl-alt">
        <div class="cl-alt-copy">
          <h2>Regras da <em>Casa</em></h2>
          <p>São elas que deixam a noite boa para todo mundo. A anfitriã modera e pode tirar alguém da noite, e qualquer pessoa pode ser denunciada tocando na foto dela na sala.</p>
          <div class="cl-list">${listItemsHtml([
            { ic: 'badge', title: 'Só maiores de 18 anos', desc: 'Sem exceção.' },
            { ic: 'shield', title: 'Consentimento sempre', desc: '"Não", silêncio ou "Passo" encerram o assunto.' },
            { ic: 'eye', title: 'Nada de print', desc: 'Print e gravação de tela são proibidos; a tela tem marca d’água com a identificação de quem vê.' },
            { ic: 'lock', title: 'Sem dinheiro e sem contato de fora', desc: 'Nada de Pix, cobrança ou telefone na sala, e nada de foto de outras pessoas.' },
          ])}</div>
        </div>
        <figure class="cl-alt-media">
          <img src="/landing/privacy-editorial-722.webp" alt="Retrato em ambiente reservado, simbolizando privacidade" width="722" height="481" loading="lazy" />
        </figure>
      </div>
    </section>

    ${campaignFaqSection(faq)}

    <section class="cl-section cl-region">
      <h2>Swing perto de você</h2>
      <p>Além da Casa, o NoSigilo reúne o meio liberal ${pt ? 'de Portugal e do Brasil' : 'de todo o Brasil'} para conversar e marcar encontros na sua região.</p>
      <div class="cl-chips">
        ${pertoChips}
      </div>
    </section>

    <section class="cl-final">
      <div class="cl-final-inner">
        <div>
          <h2>${pt ? 'Toda sexta e sábado à noite.' : 'Toda sexta e sábado, às 22h.'}</h2>
          <p>Reserve seu lugar e receba o aviso no ${pt ? 'telemóvel' : 'celular'} quando a Casa abrir.</p>
        </div>
        <div class="cl-final-actions">
          ${reservar('Reservar meu lugar')}
          <a class="cl-final-login" href="${loginUrl(origem)}">Já tenho uma conta</a>
        </div>
      </div>
    </section>

    ${pt ? rodapePortugal() : campaignFooter(null)}`;

  return campaignDocument(pt
    ? { title, desc, url, geoPlace: 'Portugal', jsonld, body, lang: 'pt-PT', ogLocale: 'pt_PT', geoRegion: 'PT', extraCss: BR_CSS + CASA_CSS }
    : { title, desc, url, geoUf: '', geoPlace: '', jsonld, body, extraCss: BR_CSS + CASA_CSS });
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

mkdirSync(resolve(DIST, 'swing', 'portugal'), { recursive: true });
publica('/swing/portugal/', resolve(DIST, 'swing', 'portugal', 'index.html'), paginaPortugal());
for (const c of PORTUGAL_CIDADES) {
  const dir = resolve(DIST, 'swing', 'portugal', c.slug);
  mkdirSync(dir, { recursive: true });
  publica(`/swing/portugal/${c.slug}/`, resolve(dir, 'index.html'), paginaCidadePortugal(c));
}

mkdirSync(resolve(DIST, 'swing'), { recursive: true });
publica('/swing/', resolve(DIST, 'swing', 'index.html'), hubPage());

mkdirSync(resolve(DIST, 'swing', CASA_SLUG), { recursive: true });
publica(CASA_PATH, resolve(DIST, 'swing', CASA_SLUG, 'index.html'), casaPage());
mkdirSync(resolve(DIST, 'swing', 'portugal', CASA_SLUG), { recursive: true });
publica(CASA_PT_PATH, resolve(DIST, 'swing', 'portugal', CASA_SLUG, 'index.html'), casaPage(true));

// Telas do app que nao sao para a busca. O app ja poe noindex pelo JavaScript
// (seoDaRota.ts), mas o Google indexava o HTML cru antes de renderizar:
// /login?origem=swing/ceara/eusebio chegou a 1.027 impressoes no lugar da
// pagina de Eusebio (Search Console, nov/2026). Uma copia do index.html com
// noindex em dist/<rota>/index.html vale sem JavaScript: o try_files do nginx
// ($uri/) a serve para /login e /login?origem=..., e o React assume a rota
// normalmente. Sem vite build antes (dist sem index.html), nao faz nada.
const APP_INDEX = resolve(DIST, 'index.html');
if (existsSync(APP_INDEX)) {
  const html = readFileSync(APP_INDEX, 'utf8');
  const ROBOTS = /<meta name="robots" content="[^"]*" \/>/;
  if (ROBOTS.test(html)) {
    const semIndice = html.replace(ROBOTS, '<meta name="robots" content="noindex, follow" />');
    for (const rota of ['login', 'register', 'subscriptions', 'terms', 'privacy']) {
      mkdirSync(resolve(DIST, rota), { recursive: true });
      writeFileSync(resolve(DIST, rota, 'index.html'), semIndice, 'utf8');
    }
  } else {
    console.warn('[seo] index.html sem <meta name="robots"> no formato esperado: telas do app ficaram sem noindex no HTML');
  }
}

// O sitemap le o LASTMOD ja preenchido pelas chamadas acima, entao vem depois.
writeFileSync(resolve(DIST, 'sitemap.xml'), sitemap(), 'utf8');
const gravou = gravaLastmodNoBanco(LASTMOD);
// O arquivo e escrito de qualquer jeito: espelho para quando o banco faltar.
writeFileSync(LASTMOD_FILE, JSON.stringify(LASTMOD, null, 2) + String.fromCharCode(10), 'utf8');

const fracas = SELECTED_CITIES.filter((c) => !cidadeIndexavel(c)).length;
console.log(`[seo] ${stateCount} estado(s) + ${cityCount} cidade(s) + hub /swing/ + sitemap.xml gerados em ${OUT_DIR_NAME}/`);
console.log(`[seo] ${cityCount - fracas} cidade(s) no sitemap; ${fracas} com menos de ${MIN_PERFIS_INDEXAVEL} perfis ficaram noindex`);
console.log(inedito
  ? `[seo] seo-lastmod.json criado com ${Object.keys(LASTMOD).length} pagina(s)`
  : `[seo] ${mudaram} pagina(s) mudaram de conteudo — as outras ${Object.keys(LASTMOD).length - mudaram} mantiveram o lastmod anterior`);
console.log(`[seo] lastmod guardado em ${gravou ? 'seo_lastmod (Postgres)' : 'seo-lastmod.json (banco indisponivel)'}`);

// ─── Contos eróticos: categorias e trava de conteúdo proibido ───────────────
//
// Categorias escolhidas pelo dono em 19/09/2026 a partir de um site de
// referência, com três mudanças de propósito:
//   - sem "Zoofilia": sexo com animal é crime de maus-tratos no Brasil;
//   - sem "Incesto": proibido pelas regras dos processadores de pagamento
//     (Stripe inclusive), e perto demais de conteúdo com menores;
//   - "Virgens" virou "Primeira vez", deixando claro que é entre adultos.
// "Swing e troca de casais" entrou por ser o assunto central da rede.

export const CATEGORIAS_CONTOS = {
  swing: 'Swing e troca de casais',
  heterossexual: 'Heterossexual',
  traicao: 'Traição / Corno',
  cuckold: 'Cuckold',
  grupal: 'Grupal e orgias',
  exibicionismo: 'Exibicionismo',
  fantasias: 'Fantasias',
  fetiches: 'Fetiches',
  coroas: 'Coroas',
  lesbicas: 'Lésbicas',
  gays: 'Gays',
  bissexual: 'Bissexual',
  travesti: 'Travesti',
  interraciais: 'Interraciais',
  sadomasoquismo: 'Sadomasoquismo / BDSM',
  masturbacao: 'Masturbação',
  primeira_vez: 'Primeira vez (maiores de 18)',
  confissao: 'Confissão',
  poesias: 'Poesias / Poemas',
} as const;

export type CategoriaConto = keyof typeof CATEGORIAS_CONTOS;
export const SLUGS_CATEGORIAS = Object.keys(CATEGORIAS_CONTOS) as [CategoriaConto, ...CategoriaConto[]];

const semAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Sinais de conteúdo que não pode existir na plataforma. Não apaga nada: o
// conto encontrado vai para a revisão do admin, que decide. Falso positivo
// ("casados há 10 anos") custa uma revisão; falso negativo custa muito mais.
const SINAIS: Array<{ motivo: string; padrao: RegExp }> = [
  { motivo: 'idade abaixo de 18 anos', padrao: /\b(tinha|tem|tenho|tinhamos|tinham|com|aos|completou|completei|completar|(?<!\b(mais|menos|ha|a|por|cerca|quase|uns|umas) )de)\s+(1[0-7]|[1-9])\s*(anos|aninhos)\b/ },
  { motivo: 'idade abaixo de 18 anos', padrao: /\b(onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete)\s+(anos|aninhos)\b/ },
  { motivo: 'menção a menor de idade', padrao: /\b(menor de idade|menores de idade|colegial|ensino fundamental|ensino medio|pre[- ]?adolescente|puberdade|(?<!\b(como|feito|parecia|igual|que nem) (uma )?)crianca|criancinha|infantil|pedofil\w*|lolita|ninfeta|garotinh[ao]|menininh[ao]|novinh[ao] de \d|bebezinh[ao])\b/ },
  { motivo: 'menção a sexo com animal', padrao: /\b(zoofilia|bestialidade|sexo com (um |o |a )?(animal|cachorro|cao|cavalo|egua|bode|cabra))\b/ },
  { motivo: 'menção a incesto', padrao: /\b(incesto|incestuos\w*|com (o )?meu pai|com (a )?minha mae|com (o )?meu filho|com (a )?minha filha|meu pai me (comeu|fodeu|comia)|minha mae me|comi (a )?minha (mae|irma|filha|sobrinha))\b/ },
];

/** Motivos encontrados no título + texto; lista vazia = pode publicar direto. */
export function sinaisDeConteudoProibido(titulo: string, texto: string): string[] {
  const alvo = semAcentos(`${titulo}\n${texto}`);
  const motivos = new Set<string>();
  for (const s of SINAIS) if (s.padrao.test(alvo)) motivos.add(s.motivo);
  return Array.from(motivos);
}

/**
 * Motivos de exclusão de conta.
 *
 * O `code` é o que fica gravado no banco (estável, usado para agregar no painel
 * admin); o `label` é só apresentação e pode ser reescrito sem invalidar o
 * histórico. A lista de códigos espelha ACCOUNT_DELETION_REASON_CODES no
 * backend (backend/src/app.ts) — manter as duas em sincronia ao adicionar um
 * motivo novo, senão o backend rejeita o código e grava a saída sem motivo.
 */
export const ACCOUNT_DELETION_REASONS = [
  { code: 'no_one_in_region', label: 'Não encontrei pessoas na minha região' },
  { code: 'few_active_users', label: 'Poucos perfis ativos / pouca interação' },
  { code: 'found_someone', label: 'Já encontrei o que procurava' },
  { code: 'too_expensive', label: 'Achei caro / questão financeira' },
  { code: 'privacy_concern', label: 'Preocupação com privacidade e discrição' },
  { code: 'fake_profiles', label: 'Muitos perfis falsos' },
  { code: 'bad_experience', label: 'Tive uma experiência ruim' },
  { code: 'technical_issues', label: 'Problemas técnicos no site/app' },
  { code: 'temporary_break', label: 'Só quero dar uma pausa' },
  { code: 'other', label: 'Outro motivo' },
] as const;

export type AccountDeletionReasonCode = (typeof ACCOUNT_DELETION_REASONS)[number]['code'];

/**
 * Pergunta específica para cada motivo. Campo em branco quase ninguém
 * preenche (10 textos em 218 saídas); pergunta concreta dá resposta útil.
 */
export const PERGUNTA_POR_MOTIVO: Record<string, string> = {
  no_one_in_region: 'De qual cidade você é? Assim sabemos onde precisamos crescer.',
  few_active_users: 'Você chegou a mandar mensagem para alguém? O que aconteceu?',
  found_someone: 'Que bom! Foi aqui na plataforma que você encontrou?',
  too_expensive: 'Qual preço faria valer a pena para você?',
  privacy_concern: 'O que te deixou inseguro? Queremos corrigir.',
  fake_profiles: 'Lembra de algum perfil falso? Pode dizer o nome que verificamos.',
  bad_experience: 'O que aconteceu? Se foi com alguém da plataforma, conte aqui.',
  technical_issues: 'O que deu errado e em qual aparelho?',
  temporary_break: 'O que faria você voltar?',
  other: 'Conte com suas palavras o que te fez sair.',
};

/** Só em "Outro motivo" o texto é obrigatório: sem ele a resposta não diz nada. */
export const MOTIVO_EXIGE_TEXTO = 'other';

/** Rótulo legível de um código; cobre também exclusões antigas, sem motivo. */
export function deletionReasonLabel(code: string | null | undefined): string {
  if (!code || code === 'not_informed') return 'Não informado';
  return ACCOUNT_DELETION_REASONS.find((r) => r.code === code)?.label ?? code;
}

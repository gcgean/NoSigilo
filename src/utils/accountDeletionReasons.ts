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

/** Rótulo legível de um código; cobre também exclusões antigas, sem motivo. */
export function deletionReasonLabel(code: string | null | undefined): string {
  if (!code || code === 'not_informed') return 'Não informado';
  return ACCOUNT_DELETION_REASONS.find((r) => r.code === code)?.label ?? code;
}

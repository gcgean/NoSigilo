import axios from 'axios';
import { API_URL } from '@/utils/apiClient';

export type ApiErrorInfo = {
  title: string;
  description?: string;
};

function mapBackendErrorCode(code: string): ApiErrorInfo | null {
  switch (code) {
    case 'account_banned':
      return { title: 'Conta suspensa', description: 'Esta conta foi suspensa por violar as diretrizes da comunidade.' };
    case 'account_deactivated_by_admin':
      return { title: 'Conta desativada', description: 'Sua conta foi desativada pela administração da plataforma.' };
    case 'invalid_credentials':
      return { title: 'Erro ao entrar', description: 'E-mail ou senha incorretos.' };
    case 'use_google_login':
      return { title: 'Use o login com Google', description: 'Esta conta foi criada via Google. Clique em "Entrar com Google" para acessar.' };
    case 'email_in_use':
      return { title: 'E-mail já em uso', description: 'Use outro e-mail ou faça login.' };
    case 'name_in_use':
      return { title: 'Nome de usuário já em uso', description: 'Escolha outro nome para continuar.' };
    case 'name_blacklisted':
      return { title: 'Nome indisponível', description: 'Este nome não está disponível para uso na plataforma. Escolha outro.' };
    case 'profile_type_required':
      return { title: 'Escolha o tipo de perfil', description: 'Você precisa informar se é Homem, Mulher, Casal ou outro perfil para criar a conta.' };
    case 'invalid_input':
      return { title: 'Dados inválidos', description: 'Verifique os campos e tente novamente.' };
    case 'invalid_invite':
      return { title: 'Convite inválido', description: 'Esse link de convite não é válido ou já expirou.' };
    case 'invite_unavailable':
      return { title: 'Convite indisponível', description: 'Esse convite não está mais disponível para novo cadastro.' };
    case 'pending_invite_approval':
      return { title: 'Aguardando aprovação', description: 'Seu padrinho ainda não aprovou sua entrada na rede.' };
    case 'invite_access_denied':
      return { title: 'Acesso não aprovado', description: 'Seu padrinho não aprovou esse cadastro.' };
    case 'unauthorized':
      return { title: 'Não autorizado', description: 'Faça login novamente.' };
    case 'invalid_reset_code':
      return { title: 'Codigo invalido', description: 'Confira o codigo enviado por e-mail e tente de novo.' };
    case 'reset_code_expired':
      return { title: 'Codigo expirado', description: 'Peça um novo codigo para continuar.' };
    case 'email_send_failed':
      return { title: 'Nao foi possivel enviar o e-mail', description: 'Tente novamente em instantes.' };
    default:
      return null;
  }
}

export function getApiErrorInfo(error: unknown, fallback: ApiErrorInfo): ApiErrorInfo {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return {
        title: 'Servidor indisponível',
        description: `Não foi possível conectar ao backend (${API_URL}).`,
      };
    }

    const status = error.response.status;
    const data: any = error.response.data;
    const code = typeof data?.error === 'string' ? data.error : null;
    if (code) {
      return mapBackendErrorCode(code) ?? { title: 'Erro', description: code };
    }

    if (status >= 500) {
      return { title: 'Erro no servidor', description: 'Tente novamente em instantes.' };
    }

    if (status === 404) {
      return { title: 'Não encontrado', description: 'Recurso não encontrado.' };
    }

    if (status === 413) {
      return { title: 'Upload bloqueado', description: 'A mídia excedeu o limite atual do servidor ou da borda de rede.' };
    }

    return fallback;
  }

  if (error instanceof Error) {
    return { title: fallback.title, description: error.message || fallback.description };
  }

  return fallback;
}

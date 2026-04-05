import axios from 'axios';
import { API_URL } from '@/utils/apiClient';

export type ApiErrorInfo = {
  title: string;
  description?: string;
};

function mapBackendErrorCode(code: string): ApiErrorInfo | null {
  switch (code) {
    case 'invalid_credentials':
      return { title: 'Erro ao entrar', description: 'E-mail ou senha incorretos.' };
    case 'email_in_use':
      return { title: 'E-mail já em uso', description: 'Use outro e-mail ou faça login.' };
    case 'name_in_use':
      return { title: 'Nome de usuário já em uso', description: 'Escolha outro nome para continuar.' };
    case 'invalid_input':
      return { title: 'Dados inválidos', description: 'Verifique os campos e tente novamente.' };
    case 'unauthorized':
      return { title: 'Não autorizado', description: 'Faça login novamente.' };
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
      return { title: 'Arquivo muito grande', description: 'A mídia ultrapassou o limite aceito pelo servidor.' };
    }

    return fallback;
  }

  if (error instanceof Error) {
    return { title: fallback.title, description: error.message || fallback.description };
  }

  return fallback;
}

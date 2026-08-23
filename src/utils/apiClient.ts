import axios from 'axios';
import { toast } from '@/hooks/use-toast';
import { API_URL as RESOLVED_API_URL } from '@/utils/serverUrl';

export const API_URL = RESOLVED_API_URL;
const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';
const NETWORK_TOAST_COOLDOWN_MS = 8000;
// Espera entre as tentativas de reconexão. Escalonado: uma oscilação curta se
// resolve na primeira, e uma queda mais longa (deploy, rede caindo) ainda tem
// ~7s de margem antes de o erro chegar à tela.
const NETWORK_RETRY_DELAYS_MS = [800, 2000, 4000];
let lastPremiumToastAt = 0;
let isHandlingUnauthorized = false;
const SERVER_RETRY_DELAY_MS = 2000;

// Metadados que anexamos à config da request para controlar as retentativas.
type RequestMeta = { __netRetries?: number; method?: string };

function isSafeRetryMethod(method?: string) {
  const normalized = String(method || 'get').toLowerCase();
  return normalized === 'get' || normalized === 'head' || normalized === 'options';
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - inject auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle 401
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Falha de rede (sem resposta): reconecta em silêncio, sem avisar o usuário.
    // Só métodos seguros são repetidos — repetir POST/PUT duplicaria ações
    // (foi assim que nasceram eventos duplicados no passado).
    // Esgotadas as tentativas, o erro segue para quem chamou, que decide se
    // mostra algo específico ("Erro ao carregar feed" etc.). O aviso genérico
    // de "sem conexão" não ajudava: ou a reconexão resolvia sozinha, ou a tela
    // já mostrava o próprio erro.
    if (!error.response) {
      const config = (error.config || {}) as typeof error.config & RequestMeta;
      const attempt = config.__netRetries || 0;
      const delay = NETWORK_RETRY_DELAYS_MS[attempt];
      const canRetry =
        delay !== undefined &&
        isSafeRetryMethod(config.method) &&
        (typeof navigator === 'undefined' || navigator.onLine !== false);

      if (canRetry) {
        config.__netRetries = attempt + 1;
        await wait(delay);
        return apiClient.request(config);
      }
    }
    // Auto-retry once on 503/502 for safe methods (cold-start / transient overload)
    const status = error.response?.status as number | undefined;

    // Log detalhado de 400 para localizar a chamada culpada (ex.: erro elusivo em /settings).
    if (status === 400) {
      const cfg = (error.config || {}) as { method?: string; url?: string; params?: unknown };
      console.warn('[api] 400 Bad Request', {
        method: String(cfg.method || '').toUpperCase(),
        url: cfg.url,
        params: cfg.params,
        response: error.response?.data,
      });
    }
    if (status === 503 || status === 502) {
      const config = (error.config || {}) as typeof error.config & { __serverRetry?: boolean };
      if (!config.__serverRetry && isSafeRetryMethod(config.method)) {
        config.__serverRetry = true;
        await wait(SERVER_RETRY_DELAY_MS);
        return apiClient.request(config);
      }
    }

    if (error.response?.status === 401) {
      localStorage.removeItem('nosigilo_user');
      localStorage.removeItem('token');
      if (!isHandlingUnauthorized) {
        isHandlingUnauthorized = true;
        const isAuthScreen =
          window.location.pathname.startsWith('/login') ||
          window.location.pathname.startsWith('/forgot-password') ||
          window.location.pathname.startsWith('/register');
        if (!isAuthScreen) {
          window.location.replace('/login');
        }
        window.setTimeout(() => {
          isHandlingUnauthorized = false;
        }, 1000);
      }
    }
    const apiErrorCode = String(error.response?.data?.error || '');
    if (error.response?.status === 403 && apiErrorCode === 'premium_required') {
      // Não redireciona automaticamente — cada página trata o paywall por conta própria
      // (Match, Search, Stories, etc. já verificam premiumAccess client-side)
      const now = Date.now();
      if (now - lastPremiumToastAt > NETWORK_TOAST_COOLDOWN_MS) {
        lastPremiumToastAt = now;
        toast({
          title: 'Recurso Premium',
          description: 'Assine para desbloquear este recurso.',
          variant: 'destructive',
        });
      }
    }
    return Promise.reject(error);
  }
);

export const useMocks = USE_MOCKS;
export default apiClient;

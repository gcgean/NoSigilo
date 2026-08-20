import axios from 'axios';
import { toast } from '@/hooks/use-toast';
import { API_URL as RESOLVED_API_URL } from '@/utils/serverUrl';

export const API_URL = RESOLVED_API_URL;
const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';
const NETWORK_TOAST_COOLDOWN_MS = 8000;
const RESUME_NETWORK_GRACE_MS = 20000; // janela pós-retomada em que erros de rede são silenciosos
const RESUME_RETRY_DELAY_MS = 1200;
const MAX_RESUME_RETRIES = 2;
let lastNetworkToastAt = 0;
let lastPremiumToastAt = 0;
let isHandlingUnauthorized = false;
const SERVER_RETRY_DELAY_MS = 2000;
let lastVisibilityResumeAt = typeof Date !== 'undefined' ? Date.now() : 0;

// Qualquer sinal de "voltei" (desbloqueou o celular, reconectou a rede, focou a
// aba) reinicia a janela de silêncio — a 1ª request depois disso costuma falhar
// enquanto a rede volta, e não deve assustar o usuário com "servidor indisponível".
function markResume() { lastVisibilityResumeAt = Date.now(); }

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') markResume();
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('pageshow', markResume);
  window.addEventListener('focus', markResume);
  window.addEventListener('online', markResume);
}

// Metadados que anexamos à config da request para julgar falhas de rede.
type RequestMeta = { __startedAt?: number; __resumeRetries?: number; method?: string };

function isSafeRetryMethod(method?: string) {
  const normalized = String(method || 'get').toLowerCase();
  return normalized === 'get' || normalized === 'head' || normalized === 'options';
}

// Uma falha é "da retomada" (e não do servidor) quando a request estava em voo
// no momento em que o app voltou, saiu logo depois da volta, ou já passou pelo
// retry de retomada. Isso é avaliado pelo INÍCIO da request — não pela hora em
// que ela falhou: com timeout de 10s + retry, a falha final pode cair fora da
// janela de silêncio e disparar o toast mesmo sendo só a rede voltando.
function isResumeRelatedFailure(config?: RequestMeta) {
  if ((config?.__resumeRetries || 0) > 0) return true;
  const startedAt = typeof config?.__startedAt === 'number' ? config.__startedAt : null;
  if (startedAt === null) return false;
  // Retomada aconteceu depois que a request saiu → ela atravessou a volta do app.
  if (lastVisibilityResumeAt >= startedAt) return true;
  // Request saiu dentro da janela de silêncio pós-retomada.
  return startedAt - lastVisibilityResumeAt < RESUME_NETWORK_GRACE_MS;
}

function shouldSuppressNetworkToast(config?: RequestMeta) {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return true;
  }
  // Offline (sem rede) não é "servidor indisponível" — não alarma.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }
  if (Date.now() - lastVisibilityResumeAt < RESUME_NETWORK_GRACE_MS) return true;
  return isResumeRelatedFailure(config);
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
    // Carimba quando a request saiu — usado para saber se uma falha de rede foi
    // só o app voltando do segundo plano (ver isResumeRelatedFailure).
    (config as typeof config & RequestMeta).__startedAt = Date.now();
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle 401
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (!error.response) {
      const config = (error.config || {}) as typeof error.config & RequestMeta;
      const resumeRetries = config.__resumeRetries || 0;
      const canRetryAfterResume =
        resumeRetries < MAX_RESUME_RETRIES &&
        shouldSuppressNetworkToast(config) &&
        isSafeRetryMethod(config.method) &&
        (typeof navigator === 'undefined' || navigator.onLine !== false);

      if (canRetryAfterResume) {
        config.__resumeRetries = resumeRetries + 1;
        await wait(RESUME_RETRY_DELAY_MS);
        return apiClient.request(config);
      }

      const now = Date.now();
      if (!shouldSuppressNetworkToast(config) && now - lastNetworkToastAt > NETWORK_TOAST_COOLDOWN_MS) {
        lastNetworkToastAt = now;
        toast({
          title: 'Sem conexão com o servidor',
          description: 'Verifique sua internet. Vamos tentar reconectar automaticamente.',
          variant: 'destructive',
        });
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

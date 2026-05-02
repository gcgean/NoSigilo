import axios from 'axios';
import { toast } from '@/hooks/use-toast';
import { API_URL as RESOLVED_API_URL } from '@/utils/serverUrl';

export const API_URL = RESOLVED_API_URL;
const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';
const NETWORK_TOAST_COOLDOWN_MS = 8000;
const RESUME_NETWORK_GRACE_MS = 12000;
const RESUME_RETRY_DELAY_MS = 1200;
let lastNetworkToastAt = 0;
let lastPremiumToastAt = 0;
let isHandlingUnauthorized = false;
let lastVisibilityResumeAt = typeof Date !== 'undefined' ? Date.now() : 0;

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      lastVisibilityResumeAt = Date.now();
    }
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('pageshow', () => {
    lastVisibilityResumeAt = Date.now();
  });
}

function isSafeRetryMethod(method?: string) {
  const normalized = String(method || 'get').toLowerCase();
  return normalized === 'get' || normalized === 'head' || normalized === 'options';
}

function shouldSuppressNetworkToast() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return true;
  }
  return Date.now() - lastVisibilityResumeAt < RESUME_NETWORK_GRACE_MS;
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
    if (!error.response) {
      const config = (error.config || {}) as typeof error.config & { __resumeRetry?: boolean };
      const canRetryAfterResume =
        !config.__resumeRetry &&
        shouldSuppressNetworkToast() &&
        isSafeRetryMethod(config.method) &&
        (typeof navigator === 'undefined' || navigator.onLine !== false);

      if (canRetryAfterResume) {
        config.__resumeRetry = true;
        await wait(RESUME_RETRY_DELAY_MS);
        return apiClient.request(config);
      }

      const now = Date.now();
      if (!shouldSuppressNetworkToast() && now - lastNetworkToastAt > NETWORK_TOAST_COOLDOWN_MS) {
        lastNetworkToastAt = now;
        toast({
          title: 'Servidor indisponível',
          description: `Não foi possível conectar ao backend (${API_URL}).`,
          variant: 'destructive',
        });
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
      const now = Date.now();
      if (now - lastPremiumToastAt > NETWORK_TOAST_COOLDOWN_MS) {
        lastPremiumToastAt = now;
        toast({
          title: 'Plano necessário',
          description: 'Renove seu plano para continuar usando este recurso.',
          variant: 'destructive',
        });
      }
      if (!window.location.pathname.startsWith('/subscriptions')) {
        window.location.href = '/subscriptions';
      }
    }
    return Promise.reject(error);
  }
);

export const useMocks = USE_MOCKS;
export default apiClient;

import axios from 'axios';
import { toast } from '@/hooks/use-toast';
import { API_URL as RESOLVED_API_URL } from '@/utils/serverUrl';

export const API_URL = RESOLVED_API_URL;
const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';
const NETWORK_TOAST_COOLDOWN_MS = 8000;
let lastNetworkToastAt = 0;
let lastPremiumToastAt = 0;
let isHandlingUnauthorized = false;

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
  (error) => {
    if (!error.response) {
      const now = Date.now();
      if (now - lastNetworkToastAt > NETWORK_TOAST_COOLDOWN_MS) {
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

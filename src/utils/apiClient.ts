import axios from 'axios';
import { toast } from '@/hooks/use-toast';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4001/api';
const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';
const NETWORK_TOAST_COOLDOWN_MS = 8000;
let lastNetworkToastAt = 0;

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
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const useMocks = USE_MOCKS;
export default apiClient;

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import type { Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { SOCKET_URL } from '@/utils/serverUrl';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  emit: (event: string, data?: any) => void;
  on: (event: string, callback: (data: any) => void) => void;
  off: (event: string, callback?: (data: any) => void) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';

export function SocketProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Only depend on isAuthenticated (a boolean), NOT on the user object.
    // The user object reference changes on every updateUser() call which would
    // cause a full socket reconnect on every profile update.
    if (USE_MOCKS || !isAuthenticated) {
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      return;
    }

    // O socket.io-client só é baixado quando alguém está de fato logado —
    // visitante da landing não carrega essa biblioteca.
    let cancelado = false;
    let socketAtivo: Socket | null = null;

    import('socket.io-client').then(({ io }) => {
      if (cancelado) return;

      // Antes: 5 tentativas em ~15 s e depois desistia para sempre. No iPhone,
      // o site em segundo plano (ou aberto durante um deploy) perdia o tempo
      // real e o chat, as notificações e o feed paravam de atualizar até
      // recarregar a página (suporte: Wyl, 14/10/2026). Agora tenta sempre,
      // com espera crescente até 15 s.
      const newSocket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 15000,
      });

      newSocket.on('connect', () => {
        setIsConnected(true);
      });

      newSocket.on('disconnect', () => {
        setIsConnected(false);
      });

      newSocket.on('connect_error', () => {
        setIsConnected(false);
      });

      socketAtivo = newSocket;
      setSocket(newSocket);
    }).catch(() => {
      // Falha ao carregar o módulo: o app segue sem tempo real.
    });

    // Voltou para o site (trocou de app, desbloqueou a tela) ou a internet
    // voltou: reconecta na hora, sem esperar a próxima tentativa agendada.
    const reconectarSeCaiu = () => {
      if (document.visibilityState === 'visible' && socketAtivo && !socketAtivo.connected) {
        socketAtivo.connect();
      }
    };
    document.addEventListener('visibilitychange', reconectarSeCaiu);
    window.addEventListener('online', reconectarSeCaiu);
    window.addEventListener('pageshow', reconectarSeCaiu);

    return () => {
      cancelado = true;
      document.removeEventListener('visibilitychange', reconectarSeCaiu);
      window.removeEventListener('online', reconectarSeCaiu);
      window.removeEventListener('pageshow', reconectarSeCaiu);
      socketAtivo?.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
  }, [isAuthenticated]);

  // Memoize emit/on/off so components that list them as useEffect deps don't
  // re-fire handlers on every parent re-render (only re-fire on socket change).
  const emit = useCallback((event: string, data?: any) => {
    if (socket && isConnected) {
      socket.emit(event, data);
    }
  }, [socket, isConnected]);

  const on = useCallback((event: string, callback: (data: any) => void) => {
    if (socket) {
      socket.on(event, callback);
    }
  }, [socket]);

  const off = useCallback((event: string, callback?: (data: any) => void) => {
    if (socket) {
      socket.off(event, callback);
    }
  }, [socket]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, emit, on, off }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}

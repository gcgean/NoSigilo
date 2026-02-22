import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authService, profileService } from '@/services/api';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  bio?: string;
  status?: string;
  city?: string;
  state?: string;
  birthDate?: string;
  gender?: string;
  maritalStatus?: string;
  sexualOrientation?: string;
  ethnicity?: string;
  hair?: string;
  eyes?: string;
  height?: string;
  bodyType?: string;
  smokes?: string;
  drinks?: string;
  profession?: string;
  zodiacSign?: string;
  lookingFor?: string[];
  isVerified?: boolean;
  isPremium?: boolean;
  isAdmin?: boolean;
  trialStartedAt?: string | null;
  trialEndsAt?: string | null;
  allowMessages?: 'everyone' | 'matches' | 'friends' | 'nobody';
  lastSeenAt?: string | null;
  isOnline?: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  updateUser: (data: Partial<User>) => void;
}

interface RegisterData {
  email: string;
  password: string;
  name: string;
  birthDate?: string;
  gender: string;
  city?: string;
  state?: string;
  lookingFor?: string[];
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';

// Demo users for testing
const DEMO_USERS: Record<string, { password: string; user: User }> = {
  'demo@nosigilo.com': {
    password: 'demo123',
    user: {
      id: 'user-1',
      email: 'demo@nosigilo.com',
      name: 'Marina Santos',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200',
      bio: 'Apaixonada por viagens e novas experiências ✨',
      status: 'Vamos conversar?',
      city: 'São Paulo',
      state: 'SP',
      birthDate: '1996-05-20',
      gender: 'Mulher',
      maritalStatus: 'Solteiro(a)',
      sexualOrientation: 'Heterossexual',
      ethnicity: 'Branco',
      hair: 'Castanhos',
      eyes: 'Castanhos',
      height: '1.68 m',
      bodyType: 'Atlético(a)',
      smokes: 'Não',
      drinks: 'Socialmente',
      profession: 'Designer',
      zodiacSign: 'Gêmeos',
      isVerified: true,
      isPremium: false,
      isAdmin: false,
    },
  },
  'admin@nosigilo.com': {
    password: 'admin123',
    user: {
      id: 'admin-1',
      email: 'admin@nosigilo.com',
      name: 'Admin NoSigilo',
      avatar: undefined,
      city: 'São Paulo',
      state: 'SP',
      isVerified: true,
      isPremium: true,
      isAdmin: true,
    },
  },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('nosigilo_user');
    const token = localStorage.getItem('token');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('nosigilo_user');
      }
    }
    if (!USE_MOCKS && token && !savedUser) {
      authService
        .getMe()
        .then((me) => {
          localStorage.setItem('nosigilo_user', JSON.stringify(me));
          setUser(me);
        })
        .catch(() => {
          localStorage.removeItem('token');
        })
        .finally(() => setIsLoading(false));
      return;
    }
    setIsLoading(false);
  }, [USE_MOCKS]);

  const login = async (email: string, password: string) => {
    if (USE_MOCKS) {
      const demoAccount = DEMO_USERS[email.toLowerCase()];
      if (demoAccount && demoAccount.password === password) {
        setUser(demoAccount.user);
        localStorage.setItem('nosigilo_user', JSON.stringify(demoAccount.user));
        localStorage.setItem('token', 'mock-token');
        return;
      }
      throw new Error('Credenciais inválidas');
    }

    const result = await authService.login(email, password);
    localStorage.setItem('token', result.token);
    localStorage.setItem('nosigilo_user', JSON.stringify(result.user));
    setUser(result.user);
  };

  const register = async (data: RegisterData) => {
    if (USE_MOCKS) {
      const newUser: User = {
        id: `user-${Date.now()}`,
        email: data.email,
        name: data.name,
        city: data.city,
        state: data.state,
        birthDate: data.birthDate,
        gender: data.gender,
        isVerified: false,
        isPremium: false,
        isAdmin: false,
      };
      setUser(newUser);
      localStorage.setItem('nosigilo_user', JSON.stringify(newUser));
      localStorage.setItem('token', 'mock-token');
      return;
    }

    const result = await authService.register(data);
    localStorage.setItem('token', result.token);
    localStorage.setItem('nosigilo_user', JSON.stringify(result.user));
    setUser(result.user);
  };

  const logout = () => {
    localStorage.removeItem('nosigilo_user');
    localStorage.removeItem('token');
    setUser(null);
    window.location.href = '/login';
  };

  const updateUser = (data: Partial<User>) => {
    setUser(prev => {
      if (!prev) return null;
      const updated = { ...prev, ...data };
      localStorage.setItem('nosigilo_user', JSON.stringify(updated));
      if (!USE_MOCKS && localStorage.getItem('token')) {
        const allowedKeys: Array<keyof User> = [
          'name',
          'avatar',
          'bio',
          'status',
          'city',
          'state',
          'birthDate',
          'gender',
          'maritalStatus',
          'sexualOrientation',
          'ethnicity',
          'hair',
          'eyes',
          'height',
          'bodyType',
          'smokes',
          'drinks',
          'profession',
          'zodiacSign',
          'lookingFor',
          'allowMessages',
        ];
        const patch: Partial<User> = {};
        for (const key of allowedKeys) {
          if (key in data) (patch as any)[key] = (data as any)[key];
        }
        if (Object.keys(patch).length > 0) {
          void profileService.updateProfile(patch);
        }
      }
      return updated;
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  bio?: string;
  city?: string;
  state?: string;
  birthDate?: string;
  gender?: string;
  lookingFor?: string[];
  isVerified?: boolean;
  isPremium?: boolean;
  isAdmin?: boolean;
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
  birthDate: string;
  gender: string;
  city: string;
  state: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Demo users for testing
const DEMO_USERS: Record<string, { password: string; user: User }> = {
  'demo@qcq.com': {
    password: 'demo123',
    user: {
      id: 'user-1',
      email: 'demo@qcq.com',
      name: 'Marina Santos',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200',
      bio: 'Apaixonada por viagens e novas experiências ✨',
      city: 'São Paulo',
      state: 'SP',
      gender: 'female',
      isVerified: true,
      isPremium: false,
      isAdmin: false,
    },
  },
  'admin@qcq.com': {
    password: 'admin123',
    user: {
      id: 'admin-1',
      email: 'admin@qcq.com',
      name: 'Admin QCQ',
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
    // Check for saved session
    const savedUser = localStorage.getItem('qcq_user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('qcq_user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    // Demo mode - check against mock users
    const demoAccount = DEMO_USERS[email.toLowerCase()];
    
    if (demoAccount && demoAccount.password === password) {
      setUser(demoAccount.user);
      localStorage.setItem('qcq_user', JSON.stringify(demoAccount.user));
      return;
    }
    
    throw new Error('Credenciais inválidas');
  };

  const register = async (data: RegisterData) => {
    // Demo mode - create a new user locally
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
    localStorage.setItem('qcq_user', JSON.stringify(newUser));
  };

  const logout = () => {
    localStorage.removeItem('qcq_user');
    setUser(null);
    window.location.href = '/login';
  };

  const updateUser = (data: Partial<User>) => {
    setUser(prev => {
      if (!prev) return null;
      const updated = { ...prev, ...data };
      localStorage.setItem('qcq_user', JSON.stringify(updated));
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

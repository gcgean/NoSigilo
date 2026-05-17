import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { appService, authService, locationService, profileService } from '@/services/api';

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
  partnerBirthDate?: string;
  partnerName?: string;
  partnerSexualOrientation?: string;
  partnerEthnicity?: string;
  partnerHair?: string;
  partnerEyes?: string;
  partnerHeight?: string;
  partnerBodyType?: string;
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
  fetiches?: string[];
  intentions?: string[];
  availabilityStatus?: 'now' | 'week' | 'month' | 'online_only' | 'not_looking' | null;
  meetingTagline?: string | null;
  isVerified?: boolean;
  isPremium?: boolean;
  isAdmin?: boolean;
  trialStartedAt?: string | null;
  trialEndsAt?: string | null;
  allowMessages?: 'everyone' | 'matches' | 'friends' | 'nobody';
  blockOutsidePrefs?: boolean;
  lastSeenAt?: string | null;
  isOnline?: boolean;
  invitationStatus?: string | null;
  invitedBy?: { id: string; name: string; avatar?: string | null } | null;
  hubCustomerId?: string | null;
  hubAccessStatus?: string | null;
  hubAccessReason?: string | null;
  hubLicenseEndAt?: string | null;
  hubBanner?: string | null;
  notificationVisits?: boolean;
  billingDocument?: string | null;
  billingLegalName?: string | null;
  billingPersonType?: 'PF' | 'PJ' | null;
  billingPhone?: string | null;
  billingAddressZip?: string | null;
  billingAddressStreet?: string | null;
  billingAddressNumber?: string | null;
  billingAddressDistrict?: string | null;
  billingAddressComplement?: string | null;
  billingAddressCity?: string | null;
  billingAddressState?: string | null;
  subscriptionsEnabled?: boolean;
  ambassadorBadges?: string[] | null;
  telegramChatId?: string | null;
  lat?: number | null;
  lon?: number | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: RegisterData) => Promise<any>;
  logout: () => void;
  updateUser: (data: Partial<User>) => void;
}

interface RegisterData {
  email: string;
  password: string;
  name: string;
  birthDate?: string;
  partnerBirthDate?: string;
  gender: string;
  inviteToken?: string;
  city?: string;
  state?: string;
  lookingFor?: string[];
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';

const LOCATION_LAST_SENT_KEY = 'nosigilo:location-last-sent';

function shouldSendLocation(): boolean {
  try {
    const last = localStorage.getItem(LOCATION_LAST_SENT_KEY);
    if (!last) return true;
    return new Date(last).toDateString() !== new Date().toDateString();
  } catch {
    return true;
  }
}

function silentlyUpdateLocation() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      void locationService.updateLocation(pos.coords.latitude, pos.coords.longitude)
        .then(() => {
          try { localStorage.setItem(LOCATION_LAST_SENT_KEY, new Date().toISOString()); } catch {}
        })
        .catch(() => {});
    },
    () => {}, // silently ignore: denied, unavailable, timeout
    { timeout: 8000, maximumAge: 300_000 }
  );
}

// Billing PII fields — kept in memory but NOT persisted to localStorage
const BILLING_PII_FIELDS: Array<keyof User> = [
  'billingDocument',
  'billingLegalName',
  'billingPersonType',
  'billingPhone',
  'billingAddressZip',
  'billingAddressStreet',
  'billingAddressNumber',
  'billingAddressDistrict',
  'billingAddressComplement',
  'billingAddressCity',
  'billingAddressState',
];

function stripPIIForStorage(user: User): Omit<User, typeof BILLING_PII_FIELDS[number]> {
  const copy = { ...user } as any;
  for (const key of BILLING_PII_FIELDS) delete copy[key];
  return copy;
}

function saveUserToStorage(user: User) {
  localStorage.setItem('nosigilo_user', JSON.stringify(stripPIIForStorage(user)));
}

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
      partnerBirthDate: undefined,
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
  const getStoredUser = (): User | null => {
    if (!USE_MOCKS && !localStorage.getItem('token')) {
      localStorage.removeItem('nosigilo_user');
      return null;
    }
    const savedUser = localStorage.getItem('nosigilo_user');
    if (!savedUser) return null;
    try {
      return JSON.parse(savedUser) as User;
    } catch {
      localStorage.removeItem('nosigilo_user');
      return null;
    }
  };

  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [isLoading, setIsLoading] = useState(() => {
    if (USE_MOCKS) return false;
    const token = localStorage.getItem('token');
    const storedUser = getStoredUser();
    return Boolean(token && !storedUser);
  });

  useEffect(() => {
    const applySettings = async (currentUser: User | null) => {
      const settings = await appService.getSettings().catch(() => ({ subscriptionsEnabled: true }));
      if (!currentUser) return null;
      const mergedUser = { ...currentUser, subscriptionsEnabled: settings?.subscriptionsEnabled !== false };
      saveUserToStorage(mergedUser);
      return mergedUser;
    };

    const savedUser = localStorage.getItem('nosigilo_user');
    const token = localStorage.getItem('token');
    if (!USE_MOCKS && savedUser && !token) {
      localStorage.removeItem('nosigilo_user');
      setUser(null);
      setIsLoading(false);
      return;
    }
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        void applySettings(parsedUser).then((nextUser) => {
          if (nextUser) setUser(nextUser);
        });
        if (shouldSendLocation()) silentlyUpdateLocation();
      } catch {
        localStorage.removeItem('nosigilo_user');
      }
    }
    if (!USE_MOCKS && token && !savedUser) {
      Promise.all([authService.getMe(), appService.getSettings().catch(() => ({ subscriptionsEnabled: true }))])
        .then(([me, settings]) => {
          const mergedUser = { ...me, subscriptionsEnabled: settings?.subscriptionsEnabled !== false };
          saveUserToStorage(mergedUser);
          setUser(mergedUser);
          if (shouldSendLocation()) silentlyUpdateLocation();
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
        saveUserToStorage(demoAccount.user);
        localStorage.setItem('token', 'mock-token');
        return demoAccount.user;
      }
      throw new Error('Credenciais inválidas');
    }

    const [result, settings] = await Promise.all([
      authService.login(email, password),
      appService.getSettings().catch(() => ({ subscriptionsEnabled: true })),
    ]);
    const mergedUser = { ...result.user, subscriptionsEnabled: settings?.subscriptionsEnabled !== false };
    localStorage.setItem('token', result.token);
    saveUserToStorage(mergedUser);
    setUser(mergedUser);
    silentlyUpdateLocation(); // always capture on explicit login
    return mergedUser;
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
          partnerBirthDate: data.partnerBirthDate,
          gender: data.gender,
          isVerified: false,
          isPremium: false,
          isAdmin: false,
      };
      setUser(newUser);
      saveUserToStorage(newUser);
      localStorage.setItem('token', 'mock-token');
      return { token: 'mock-token', user: newUser, httpStatus: 200 };
    }

    const result = await authService.register(data);
    if (result?.token && result?.user) {
      const settings = await appService.getSettings().catch(() => ({ subscriptionsEnabled: true }));
      const mergedUser = { ...result.user, subscriptionsEnabled: settings?.subscriptionsEnabled !== false };
      localStorage.setItem('token', result.token);
      saveUserToStorage(mergedUser);
      setUser(mergedUser);
      silentlyUpdateLocation(); // capture location on first registration too
      return { ...result, user: mergedUser };
    }
    return result;
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
      saveUserToStorage(updated);
      if (!USE_MOCKS && localStorage.getItem('token')) {
        const allowedKeys: Array<keyof User> = [
          'name',
          'avatar',
          'bio',
          'status',
          'city',
          'state',
          'birthDate',
          'partnerBirthDate',
          'partnerName',
          'partnerSexualOrientation',
          'partnerEthnicity',
          'partnerHair',
          'partnerEyes',
          'partnerHeight',
          'partnerBodyType',
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
          'fetiches',
          'intentions',
          'availabilityStatus',
          'meetingTagline',
          'allowMessages',
          'blockOutsidePrefs',
          'notificationVisits',
          'billingDocument',
          'billingLegalName',
          'billingPersonType',
          'billingPhone',
          'billingAddressZip',
          'billingAddressStreet',
          'billingAddressNumber',
          'billingAddressDistrict',
          'billingAddressComplement',
          'billingAddressCity',
          'billingAddressState',
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
        isAuthenticated: USE_MOCKS ? !!user : !!user && !!localStorage.getItem('token'),
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

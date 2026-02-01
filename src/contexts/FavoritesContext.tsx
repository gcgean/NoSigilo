import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface FavoriteUser {
  id: string;
  name: string;
  avatar?: string;
  addedAt: string;
}

interface FavoritesContextType {
  favorites: FavoriteUser[];
  isFavorite: (userId: string) => boolean;
  addFavorite: (user: FavoriteUser) => void;
  removeFavorite: (userId: string) => void;
  toggleFavorite: (user: FavoriteUser) => void;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

const STORAGE_KEY = 'qcq_favorites';

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<FavoriteUser[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setFavorites(JSON.parse(stored));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  // Save to localStorage when favorites change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  }, [favorites]);

  const isFavorite = (userId: string) => {
    return favorites.some(f => f.id === userId);
  };

  const addFavorite = (user: FavoriteUser) => {
    if (!isFavorite(user.id)) {
      setFavorites(prev => [...prev, { ...user, addedAt: new Date().toISOString() }]);
    }
  };

  const removeFavorite = (userId: string) => {
    setFavorites(prev => prev.filter(f => f.id !== userId));
  };

  const toggleFavorite = (user: FavoriteUser) => {
    if (isFavorite(user.id)) {
      removeFavorite(user.id);
    } else {
      addFavorite(user);
    }
  };

  return (
    <FavoritesContext.Provider
      value={{
        favorites,
        isFavorite,
        addFavorite,
        removeFavorite,
        toggleFavorite,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (context === undefined) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
}

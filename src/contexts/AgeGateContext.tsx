import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AgeGateContextType {
  hasConfirmedAge: boolean;
  confirmAge: () => void;
  resetAgeConfirmation: () => void;
}

const AgeGateContext = createContext<AgeGateContextType | undefined>(undefined);

const AGE_GATE_KEY = 'qcq_age_confirmed';

export function AgeGateProvider({ children }: { children: ReactNode }) {
  const [hasConfirmedAge, setHasConfirmedAge] = useState(false);

  useEffect(() => {
    const confirmed = localStorage.getItem(AGE_GATE_KEY) === 'true';
    setHasConfirmedAge(confirmed);
  }, []);

  const confirmAge = () => {
    localStorage.setItem(AGE_GATE_KEY, 'true');
    setHasConfirmedAge(true);
  };

  const resetAgeConfirmation = () => {
    localStorage.removeItem(AGE_GATE_KEY);
    setHasConfirmedAge(false);
  };

  return (
    <AgeGateContext.Provider value={{ hasConfirmedAge, confirmAge, resetAgeConfirmation }}>
      {children}
    </AgeGateContext.Provider>
  );
}

export function useAgeGate() {
  const context = useContext(AgeGateContext);
  if (context === undefined) {
    throw new Error('useAgeGate must be used within an AgeGateProvider');
  }
  return context;
}

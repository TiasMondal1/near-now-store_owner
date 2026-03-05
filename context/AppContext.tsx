/**
 * Global App Context
 * Provides shared state across the application
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getSession } from '../session';
import { createLogger } from '../utils/logger';

const logger = createLogger('AppContext');

export interface Session {
  token: string;
  user: {
    id: string;
    email?: string;
    phone?: string;
    [key: string]: any;
  };
}

interface AppContextType {
  session: Session | null;
  loading: boolean;
  setSession: (session: Session | null) => void;
  refreshSession: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = async () => {
    try {
      logger.debug('Refreshing session');
      const currentSession = await getSession();
      setSession(currentSession);
      logger.info('Session refreshed', { hasSession: !!currentSession });
    } catch (error) {
      logger.error('Error refreshing session', error);
      setSession(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshSession();
  }, []);

  const value: AppContextType = {
    session,
    loading,
    setSession,
    refreshSession,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}

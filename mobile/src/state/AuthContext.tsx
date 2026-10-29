import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { api, clearSession, persistSession, restoreSession } from '../services/api';
import type { User } from '../types';
interface AuthState {
  user: User | null;
  loading: boolean;
  error: string;
  accept: (user: User) => Promise<void>;
  update: (user: User) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}
const Context = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function refresh() {
    try {
      const result = await api.me();
      setUser(result.authenticated && !result.isBlocked ? result.user : null);
      setError(
        result.isBlocked
          ? result.blockReason || 'Your account is unavailable. Please contact support.'
          : '',
      );
      if (!result.authenticated || result.isBlocked) await clearSession();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await restoreSession();
        await refresh();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => sub.remove();
  }, []);
  return (
    <Context.Provider
      value={{
        user,
        loading,
        error,
        refresh,
        update: setUser,
        accept: async (next) => {
          await persistSession();
          setUser(next);
          setError('');
        },
        logout: async () => {
          let failure: unknown;
          try {
            await api.logout();
          } catch (e) {
            failure = e;
          } finally {
            await clearSession();
            setUser(null);
          }
          if (failure)
            throw new Error(
              'Signed out on this device. The server could not be reached to end the remote session; it will expire automatically.',
            );
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const context = useContext(Context);
  if (!context) throw new Error('Auth provider is required');
  return context;
}

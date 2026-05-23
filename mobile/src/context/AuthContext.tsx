import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { tokenStorage } from '../lib/storage';
import type { User } from '../types';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  hasPermission: (permission: string | string[]) => boolean;
  refreshUser: () => Promise<User | null>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      try {
        const token = await tokenStorage.get();
        if (!token) return;

        const response = await api.me();
        if (mounted) setUser(response.data as User);
      } catch {
        await tokenStorage.clear();
      } finally {
        if (mounted) setLoading(false);
      }
    }

    bootstrap();

    return () => {
      mounted = false;
    };
  }, []);

  async function login(email: string, password: string) {
    const response = await api.login(email, password);
    await tokenStorage.set(response.data.token);
    const meResponse = await api.me();
    setUser(meResponse.data as User);
  }

  async function refreshUser() {
    try {
      const response = await api.me();
      const nextUser = response.data as User;
      setUser(nextUser);
      return nextUser;
    } catch {
      await tokenStorage.clear();
      setUser(null);
      return null;
    }
  }

  async function logout() {
    try {
      await api.logout();
    } catch {
      // Clear locally even if the API is offline.
    }
    await tokenStorage.clear();
    setUser(null);
  }

  function hasPermission(permission: string | string[]) {
    if (!user?.permissions) return false;

    const permissions = Array.isArray(permission) ? permission : [permission];
    return permissions.some((item) => user.permissions?.includes(item));
  }

  const value = useMemo(
    () => ({ user, loading, hasPermission, refreshUser, login, logout }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}

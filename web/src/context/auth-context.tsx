'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { tokenStorage } from '@/lib/storage';
import type { Branch, User } from '@/lib/types';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  hasPermission: (permission: string | string[]) => boolean;
  refreshUser: () => Promise<User | null>;
  login: (email: string, password: string, billerId?: number) => Promise<Branch[] | null>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      try {
        const token = tokenStorage.get();
        if (!token) return;

        const response = await api.me();
        if (mounted) setUser(response.data as User);
      } catch {
        tokenStorage.clear();
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  async function login(email: string, password: string, billerId?: number) {
    const response = await api.login(email, password, billerId);
    if (response.data.requires_branch) {
      return (response.data.branches ?? []) as Branch[];
    }

    if (!response.data.token) {
      throw new Error('Login did not return an access token.');
    }

    tokenStorage.set(response.data.token);
    const meResponse = await api.me();
    setUser(meResponse.data as User);
    return null;
  }

  async function refreshUser() {
    try {
      const response = await api.me();
      const nextUser = response.data as User;
      setUser(nextUser);
      return nextUser;
    } catch {
      tokenStorage.clear();
      setUser(null);
      return null;
    }
  }

  async function logout() {
    try {
      await api.logout();
    } catch {
      // Local logout still succeeds if the API request fails.
    }
    tokenStorage.clear();
    setUser(null);
    router.replace('/login');
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

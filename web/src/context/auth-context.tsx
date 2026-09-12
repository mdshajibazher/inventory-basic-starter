'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { sessionKey, sessionStorage } from '@/lib/storage';
import { createSessionController, type Impersonation, type SessionSnapshot } from '@/lib/session-controller';
import type { Branch, User } from '@/lib/types';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  impersonation: Impersonation | null;
  sessionBusy: boolean;
  hasPermission: (permission: string | string[]) => boolean;
  refreshUser: () => Promise<User | null>;
  login: (email: string, password: string, billerId?: number) => Promise<Branch[] | null>;
  logout: () => Promise<void>;
  startImpersonation: (id: number, billerId?: number) => Promise<Branch[] | null>;
  stopImpersonation: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionSnapshot<User>>({ user: null, impersonation: null, loading: true, sessionBusy: false, revision: 0 });
  const [controller] = useState(() => createSessionController<User, Branch>({
    storage: sessionStorage,
    api: { me: api.me, login: api.login, start: api.startImpersonation, stop: api.stopImpersonation, logout: api.logout },
    onChange: setState,
    // A full navigation discards cached pages and in-flight work from the previous identity.
    navigate: route => window.location.replace(route === 'users' ? '/users' : route === 'dashboard' ? '/dashboard' : '/login'),
  }));

  useEffect(() => {
    void controller.bootstrap();
    function sync(event: StorageEvent) {
      if (event.key === sessionKey || event.key === 'inventory_web_token' || event.key === null) window.location.reload();
    }
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [controller]);

  const value = useMemo<AuthContextValue>(() => ({
    ...state,
    login: controller.login,
    refreshUser: controller.refreshUser,
    startImpersonation: controller.startImpersonation,
    stopImpersonation: controller.stopImpersonation,
    logout: async () => {
      try { await controller.logout(); }
      catch (error) { toast.error('Logout failed', { description: error instanceof Error ? error.message : 'Try again.' }); }
    },
    hasPermission: permission => (Array.isArray(permission) ? permission : [permission]).some(item => state.user?.permissions?.includes(item)),
  }), [state, controller]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}

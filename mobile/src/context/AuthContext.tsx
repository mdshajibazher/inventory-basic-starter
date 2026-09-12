import { createContext, Fragment, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { api } from '../lib/api';
import { sessionStorage } from '../lib/storage';
import { createSessionController, type Impersonation, type SessionSnapshot } from '../lib/session-controller';
import type { Branch, User } from '../types';

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

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<SessionSnapshot<User>>({ user: null, impersonation: null, loading: true, sessionBusy: false, revision: 0 });
  const [controller] = useState(() => createSessionController<User, Branch>({
    storage: sessionStorage,
    api: { me: api.me, login: api.login, start: api.startImpersonation, stop: api.stopImpersonation, logout: api.logout },
    onChange: setState,
    navigate: route => {
      router.dismissAll();
      router.replace(route === 'users' ? '/(drawer)/users' : route === 'dashboard' ? '/(drawer)/dashboard' : '/login');
    },
  }));
  useEffect(() => { void controller.bootstrap(); }, [controller]);
  const value = useMemo<AuthContextValue>(() => ({
    ...state,
    login: controller.login,
    refreshUser: controller.refreshUser,
    startImpersonation: controller.startImpersonation,
    stopImpersonation: controller.stopImpersonation,
    logout: async () => {
      try { await controller.logout(); }
      catch (error) { Alert.alert('Logout failed', error instanceof Error ? error.message : 'Try again.'); }
    },
    hasPermission: permission => (Array.isArray(permission) ? permission : [permission]).some(item => state.user?.permissions?.includes(item)),
  }), [state, controller]);
  return <AuthContext.Provider value={value}><Fragment key={state.revision}>{children}</Fragment></AuthContext.Provider>;
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}

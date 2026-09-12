// Keep the web and mobile session controllers in sync; platform storage lives separately.
export type Identity = { id: number; name: string; email: string };
export type Impersonation = { id: number; actor: Identity; target: Identity };
export type SavedSession = { token: string; originalToken?: string; impersonation?: Impersonation };
export type SessionSnapshot<U> = { user: U | null; impersonation: Impersonation | null; loading: boolean; sessionBusy: boolean; revision: number };
type AuthData<U, B> = { token?: string; user?: U; requires_branch?: boolean; branches?: B[]; impersonation?: Impersonation };
type SessionOptions<U, B> = {
  storage: { read: () => SavedSession | null | Promise<SavedSession | null>; write: (session: SavedSession | null) => void | Promise<void> };
  api: {
    me: (token: string) => Promise<{ data: U }>;
    login: (email: string, password: string, branch?: number) => Promise<{ data: AuthData<U, B> }>;
    start: (id: number, branch: number | undefined, token: string) => Promise<{ data: AuthData<U, B> }>;
    stop: (id: number, token: string) => Promise<unknown>;
    logout: (token: string) => Promise<unknown>;
  };
  onChange: (state: SessionSnapshot<U>) => void;
  navigate: (route: 'login' | 'dashboard' | 'users') => void;
};
export function isUnauthorized(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 401;
}

export function createSessionController<U, B>({ storage, api, onChange, navigate }: SessionOptions<U, B>) {
  let state: SessionSnapshot<U> = { user: null, impersonation: null, loading: true, sessionBusy: false, revision: 0 };
  let generation = 0;
  let busy = false;
  function publish(patch: Partial<SessionSnapshot<U>>) {
    state = { ...state, ...patch };
    onChange(state);
  }
  async function clear() {
    await storage.write(null);
    publish({ user: null, impersonation: null, loading: false, revision: state.revision + 1 });
    navigate('login');
  }
  async function exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (busy) throw new Error('A session change is already in progress.');
    busy = true;
    generation++;
    publish({ sessionBusy: true });
    try { return await operation(); }
    finally { generation++; busy = false; publish({ sessionBusy: false, loading: false }); }
  }
  async function restore(session: SavedSession) {
    if (!session.originalToken || !session.impersonation) return;
    try {
      await api.stop(session.impersonation.id, session.originalToken);
      const { data: user } = await api.me(session.originalToken);
      await storage.write({ token: session.originalToken });
      publish({ user, impersonation: null, revision: state.revision + 1 });
      navigate('users');
    } catch (error) {
      if (isUnauthorized(error)) { await clear(); return; }
      throw error;
    }
  }
  async function bootstrap() {
    if (busy) return;
    const version = ++generation;
    publish({ loading: true });
    try {
      const session = await storage.read();
      if (version !== generation) return;
      publish({ impersonation: session?.impersonation ?? null });
      if (!session) { publish({ user: null }); return; }
      try {
        const { data: user } = await api.me(session.token);
        if (version === generation) publish({ user });
      } catch (error) {
        if (version !== generation) return;
        if (isUnauthorized(error)) {
          if (session.originalToken && session.impersonation) await exclusive(() => restore(session));
          else await clear();
        }
        // Connectivity failures preserve credentials and the return action.
      }
    } catch {
      // A failed recovery can be retried with the persistent return action.
    } finally {
      if (version === generation) publish({ loading: false });
    }
  }
  async function refreshUser(): Promise<U | null> {
    const version = generation;
    const session = await storage.read();
    if (!session) return null;
    try {
      const { data: user } = await api.me(session.token);
      if (version !== generation) return state.user;
      publish({ user });
      return user;
    } catch (error) {
      if (version !== generation) return state.user;
      if (isUnauthorized(error)) {
        await exclusive(async () => {
          if (session.originalToken && session.impersonation) await restore(session);
          else await clear();
        });
        return state.user;
      }
      throw error;
    }
  }
  return {
    bootstrap, refreshUser,
    login: (email: string, password: string, branch?: number) => exclusive(async (): Promise<B[] | null> => {
      if ((await storage.read())?.impersonation) throw new Error('Stop impersonating before signing in.');
      const { data } = await api.login(email, password, branch);
      if (data.requires_branch) return data.branches ?? [];
      if (!data.token) throw new Error('Login did not return an access token.');
      const user = data.user ?? (await api.me(data.token)).data;
      await storage.write({ token: data.token });
      publish({ user, impersonation: null, revision: state.revision + 1 });
      return null;
    }),
    startImpersonation: (id: number, branch?: number) => exclusive(async (): Promise<B[] | null> => {
      const session = await storage.read();
      if (!session) throw new Error('Please sign in again.');
      if (session.impersonation) throw new Error('You are already impersonating a user.');
      const { data } = await api.start(id, branch, session.token);
      if (data.requires_branch) return data.branches ?? [];
      if (!data.token || !data.user || !data.impersonation) throw new Error('Impersonation did not return a complete session.');
      try {
        await storage.write({ token: data.token, originalToken: session.token, impersonation: data.impersonation });
      } catch (error) {
        await api.stop(data.impersonation.id, session.token).catch(() => undefined);
        throw error;
      }
      publish({ user: data.user, impersonation: data.impersonation, revision: state.revision + 1 });
      navigate('dashboard');
      return null;
    }),
    stopImpersonation: () => exclusive(async () => {
      const session = await storage.read();
      publish({ impersonation: session?.impersonation ?? null });
      if (session) await restore(session);
    }),
    logout: () => exclusive(async () => {
      const session = await storage.read();
      if (session?.originalToken && session.impersonation) {
        try {
          await api.stop(session.impersonation.id, session.originalToken);
          await api.logout(session.originalToken);
        } catch (error) {
          if (!isUnauthorized(error)) throw error;
        }
      } else if (session) {
        await api.logout(session.token).catch(() => undefined);
      }
      await clear();
    }),
  };
}

import type { SavedSession } from './session-controller';

const tokenKey = 'inventory_web_token';
export const sessionKey = 'inventory_web_session';

export const sessionStorage = {
  read(): SavedSession | null {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(sessionKey);
    if (raw !== null) return JSON.parse(raw) as SavedSession | null;
    const token = window.localStorage.getItem(tokenKey);
    return token ? { token } : null;
  },
  write(session: SavedSession | null) {
    // One write keeps the active token and its return credentials together across tabs.
    window.localStorage.setItem(sessionKey, JSON.stringify(session));
    try { window.localStorage.removeItem(tokenKey); } catch { /* The new session is already authoritative. */ }
  },
};

export const tokenStorage = {
  get: () => sessionStorage.read()?.token ?? null,
  set: (token: string) => sessionStorage.write({ token }),
  clear: () => sessionStorage.write(null),
};

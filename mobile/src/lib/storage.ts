import * as SecureStore from 'expo-secure-store';
import type { SavedSession } from './session-controller';

const TOKEN_KEY = 'inventory_token';
const SESSION_KEY = 'inventory_session';

export const sessionStorage = {
  async read(): Promise<SavedSession | null> {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (raw !== null) return JSON.parse(raw) as SavedSession | null;
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    return token ? { token } : null;
  },
  async write(session: SavedSession | null) {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
  },
};

export const tokenStorage = {
  get: async () => (await sessionStorage.read())?.token ?? null,
  set: (token: string) => sessionStorage.write({ token }),
  clear: () => sessionStorage.write(null),
};

const tokenKey = 'inventory_web_token';

export const tokenStorage = {
  get() {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(tokenKey);
  },
  set(token: string) {
    window.localStorage.setItem(tokenKey, token);
  },
  clear() {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(tokenKey);
  },
};

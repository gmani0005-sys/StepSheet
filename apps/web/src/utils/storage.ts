export const storage = {
  get: (key: string): string | null => {
    try {
      if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.getItem === 'function') {
        return window.localStorage.getItem(key);
      }
    } catch {
      // ignore
    }
    return null;
  },
  set: (key: string, val: string): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.setItem === 'function') {
        window.localStorage.setItem(key, val);
      }
    } catch {
      // ignore
    }
  },
  remove: (key: string): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.removeItem === 'function') {
        window.localStorage.removeItem(key);
      }
    } catch {
      // ignore
    }
  },
};

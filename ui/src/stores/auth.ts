import { create } from 'zustand';

type User = {
  id: string;
  name: string;
  email: string;
};

type Session = {
  user: User | null;
  token: string;
  accountId: string;
};

interface AuthStore {
  session: Session | null;
  setSession: (session: Session | null) => void;
  clearSession: () => void;
  isAuthenticated: () => boolean;
  getAccountId: () => string | null;
}

const SESSION_KEY = "near_agent_session";

// Helper function to check auth without hook
export const isAuthenticated = (): boolean => {
  const session = loadSession();
  return !!session?.user;
};

// Load from localStorage on init
export const loadSession = (): Session | null => {
  try {
    const data = localStorage.getItem(SESSION_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

export const useAuthStore = create<AuthStore>((set) => ({
  session: loadSession(),

  setSession: (session) => {
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
    set({ session });
  },

  clearSession: () => {
    localStorage.removeItem(SESSION_KEY);
    set({ session: null });
  },

  isAuthenticated: () => {
    const session = loadSession();
    return !!session?.user;
  },

  getAccountId: () => {
    const session = loadSession();
    return session?.accountId || null;
  },
}));

import { create } from 'zustand';

interface User {
  id: string;
  username: string;
  role: string;
  display_name: string;
}

interface AuthState {
  isLocked: boolean;
  currentUser: User | null;
  currentSessionId: string | null;
  lastActivityAt: number;
  lockTimeoutMs: number;
  authMethod: 'password' | 'biometric' | null;
  isIntentionalBackground: boolean; // 🚀 NEW: Prevents locking during native UI prompts
  
  unlock: (method: 'password' | 'biometric', user: User, sessionId: string) => void;
  lock: () => void;
  recordActivity: () => void;
  setIntentionalBackground: (isIntentional: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isLocked: true,
  currentUser: null,
  currentSessionId: null,
  lastActivityAt: Date.now(),
  lockTimeoutMs: 5 * 60 * 1000, // 5 minutes
  authMethod: null,
  isIntentionalBackground: false,

  unlock: (method, user, sessionId) => set({
    isLocked: false,
    authMethod: method,
    currentUser: user,
    currentSessionId: sessionId,
    lastActivityAt: Date.now()
  }),
  
  lock: () => set({
    isLocked: true,
    authMethod: null,
    // We intentionally keep currentUser to allow biometric unlock
  }),
  
  recordActivity: () => set({ lastActivityAt: Date.now() }),

  setIntentionalBackground: (isIntentional) => set({ isIntentionalBackground: isIntentional })
}));

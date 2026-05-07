import { create } from 'zustand';

interface User {
  id: string;
  username: string;
  role: string;
  display_name: string;
}

interface AuthState {
  isLocked: boolean;
  lastActivityAt: number;
  lockTimeoutMs: number;
  sessionId: string | null;
  currentUser: User | null;
  unlockMethod: 'password' | 'biometric' | null;
  recordActivity: () => void;
  lock: () => void;
  unlock: (method: 'password' | 'biometric', user: User, sessionId: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isLocked: true,
  lastActivityAt: Date.now(),
  lockTimeoutMs: 120000,
  sessionId: null,
  currentUser: null,
  unlockMethod: null,
  
  recordActivity: () => set({ lastActivityAt: Date.now() }),
  
  lock: () => set({ 
    isLocked: true,
    unlockMethod: null 
  }),
  
  unlock: (method, user, sessionId) => set({ 
    isLocked: false, 
    lastActivityAt: Date.now(),
    currentUser: user,
    sessionId: sessionId,
    unlockMethod: method
  }),
}));

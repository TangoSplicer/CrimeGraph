import { create } from 'zustand';
import { getDb } from '../capacitor/db';

export interface User { id: string; badge: string; name: string; role: 'admin' | 'analyst'; }

interface AuthState {
  currentUser: User | null;
  isFirstBoot: boolean;
  isAppReady: boolean;
  intentionalBackground: boolean;
  setIntentionalBackground: (state: boolean) => void;
  initializeAuth: () => Promise<void>;
  setupMasterAdmin: (password: string) => Promise<void>;
  login: (badge: string, pin: string) => Promise<boolean>;
  biometricLogin: () => Promise<boolean>;
  adminLogin: (password: string) => Promise<boolean>;
  addAnalyst: (badge: string, name: string, pin: string) => Promise<void>;
  logout: () => void;
}

const hashSecret = async (secret: string) => {
  try {
    if (window.crypto && window.crypto.subtle) {
      const msgBuffer = new TextEncoder().encode(secret);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {}
  let hash = 0;
  for (let i = 0; i < secret.length; i++) {
    const char = secret.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; 
  }
  return "fb_" + Math.abs(hash).toString(16);
};

export const useAuthStore = create<AuthState>((set) => ({
  currentUser: null,
  isFirstBoot: true,
  isAppReady: false,
  intentionalBackground: false,

  setIntentionalBackground: (state) => set({ intentionalBackground: state }),

  initializeAuth: async () => {
    try {
      const db = await getDb();
      try { await db.query('SELECT badge FROM users LIMIT 1'); } 
      catch (e) { await db.run('DROP TABLE IF EXISTS users'); }
      await db.run('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, badge TEXT UNIQUE, name TEXT, hash TEXT, role TEXT, created_at TEXT)');
      const res = await db.query('SELECT COUNT(*) as count FROM users');
      set({ isFirstBoot: (res.values?.[0]?.count || 0) === 0, isAppReady: true });
    } catch (e) { set({ isAppReady: true }); }
  },

  setupMasterAdmin: async (password: string) => {
    const db = await getDb();
    const hash = await hashSecret(password);
    const now = new Date().toISOString();
    await db.run('INSERT INTO users (id, badge, name, hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)', ['admin_001', 'ADMIN', 'Master Admin', hash, 'admin', now]);
    const testHash = await hashSecret('123456');
    await db.run('INSERT INTO users (id, badge, name, hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)', ['test_001', 'TEST-99', 'Test Analyst', testHash, 'analyst', now]);
    set({ isFirstBoot: false });
  },

  login: async (badge: string, pin: string) => {
    try {
      const db = await getDb();
      const inputHash = await hashSecret(pin);
      const res = await db.query('SELECT * FROM users WHERE badge = ? AND hash = ? AND role = ?', [badge.toUpperCase(), inputHash, 'analyst']);
      if (res.values && res.values.length > 0) {
        localStorage.setItem('crimegraph_last_user', badge.toUpperCase());
        set({ currentUser: res.values[0] as User });
        return true;
      }
      return false;
    } catch (e) { return false; }
  },

  biometricLogin: async () => {
    try {
      const lastBadge = localStorage.getItem('crimegraph_last_user');
      if (!lastBadge) return false;
      const db = await getDb();
      const res = await db.query('SELECT * FROM users WHERE badge = ? AND role = ?', [lastBadge, 'analyst']);
      if (res.values && res.values.length > 0) {
        set({ currentUser: res.values[0] as User });
        return true;
      }
      return false;
    } catch (e) { return false; }
  },

  adminLogin: async (password: string) => {
    try {
      const db = await getDb();
      const inputHash = await hashSecret(password);
      const res = await db.query('SELECT * FROM users WHERE role = ? AND hash = ?', ['admin', inputHash]);
      if (res.values && res.values.length > 0) {
        set({ currentUser: res.values[0] as User });
        return true;
      }
      return false;
    } catch (e) { return false; }
  },

  addAnalyst: async (badge: string, name: string, pin: string) => {
    const db = await getDb();
    const hash = await hashSecret(pin);
    const id = `user_${Date.now()}`;
    await db.run('INSERT INTO users (id, badge, name, hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, badge.toUpperCase(), name, hash, 'analyst', new Date().toISOString()]);
  },

  logout: () => set({ currentUser: null })
}));

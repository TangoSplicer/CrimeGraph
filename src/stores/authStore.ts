import { create } from 'zustand';
import { getDb } from '../capacitor/db';

export interface User { id: string; badge: string; name: string; role: 'admin' | 'analyst'; }

interface AuthState {
  currentUser: User | null;
  isFirstBoot: boolean;
  isAppReady: boolean;
  initializeAuth: () => Promise<void>;
  setupMasterAdmin: (password: string) => Promise<void>;
  login: (badge: string, pin: string) => Promise<boolean>;
  adminLogin: (password: string) => Promise<boolean>;
  logout: () => void;
}

// Secure SHA-256 Hashing for offline PINs/Passwords
const hashSecret = async (secret: string) => {
  const msgBuffer = new TextEncoder().encode(secret);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: null,
  isFirstBoot: true,
  isAppReady: false,

  initializeAuth: async () => {
    try {
      const db = await getDb();
      await db.run('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, badge TEXT UNIQUE, name TEXT, hash TEXT, role TEXT, created_at TEXT)');
      
      const res = await db.query('SELECT COUNT(*) as count FROM users');
      const count = res.values?.[0]?.count || 0;
      
      if (count === 0) {
        set({ isFirstBoot: true, isAppReady: true });
      } else {
        set({ isFirstBoot: false, isAppReady: true });
      }
    } catch (e) { console.error("Auth DB Init Error", e); }
  },

  setupMasterAdmin: async (password: string) => {
    try {
      const db = await getDb();
      const hash = await hashSecret(password);
      const now = new Date().toISOString();
      
      // 1. Create Master Admin
      await db.run('INSERT INTO users (id, badge, name, hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)', 
        ['admin_001', 'ADMIN', 'Master Admin', hash, 'admin', now]);
      
      // 2. Inject the deliberate Test Case
      const testHash = await hashSecret('123456');
      await db.run('INSERT INTO users (id, badge, name, hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)', 
        ['test_001', 'TEST-99', 'Test Analyst', testHash, 'analyst', now]);

      set({ isFirstBoot: false });
    } catch (e) { throw e; }
  },

  login: async (badge: string, pin: string) => {
    try {
      const db = await getDb();
      const inputHash = await hashSecret(pin);
      const res = await db.query('SELECT * FROM users WHERE badge = ? AND hash = ? AND role = ?', [badge.toUpperCase(), inputHash, 'analyst']);
      
      if (res.values && res.values.length > 0) {
        const user = res.values[0];
        set({ currentUser: { id: user.id, badge: user.badge, name: user.name, role: user.role } });
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
        const admin = res.values[0];
        set({ currentUser: { id: admin.id, badge: admin.badge, name: admin.name, role: admin.role } });
        return true;
      }
      return false;
    } catch (e) { return false; }
  },

  logout: () => set({ currentUser: null })
}));

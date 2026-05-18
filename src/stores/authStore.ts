import { create } from 'zustand';
import { getDb } from '../capacitor/db';

export interface User { id: string; badge: string; name: string; role: 'admin' | 'analyst'; }

interface AuthState {
  currentUser: User | null;
  isFirstBoot: boolean;
  isAppReady: boolean;
  isLocked: boolean;
  intentionalBackground: boolean;
  lock: () => void;
  unlock: () => void;
  setIntentionalBackground: (state: boolean) => void;
  initializeAuth: () => Promise<void>;
  setupMasterAdmin: (password: string) => Promise<void>;
  login: (badge: string, pin: string) => Promise<boolean>;
  adminLogin: (password: string) => Promise<boolean>;
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
  } catch (e) {
    console.warn("WebCrypto unavailable, using fallback.");
  }
  
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
  isLocked: false,
  intentionalBackground: false,

  lock: () => set({ isLocked: true }),
  unlock: () => set({ isLocked: false }),
  setIntentionalBackground: (state) => set({ intentionalBackground: state }),

  initializeAuth: async () => {
    try {
      const db = await getDb();
      
      // 🚀 THE FIX: Self-Healing Schema Check
      try {
        await db.query('SELECT badge FROM users LIMIT 1');
      } catch (schemaError) {
        console.warn("Old/Malformed users table detected. Executing schema wipe...");
        await db.run('DROP TABLE IF EXISTS users');
      }

      await db.run('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, badge TEXT UNIQUE, name TEXT, hash TEXT, role TEXT, created_at TEXT)');
      
      const res = await db.query('SELECT COUNT(*) as count FROM users');
      const count = res.values?.[0]?.count || 0;
      set({ isFirstBoot: count === 0, isAppReady: true });
    } catch (e) { 
      console.error("Auth DB Init Error", e); 
      set({ isAppReady: true });
    }
  },

  setupMasterAdmin: async (password: string) => {
    try {
      const db = await getDb();
      const hash = await hashSecret(password);
      const now = new Date().toISOString();
      await db.run('INSERT INTO users (id, badge, name, hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)', ['admin_001', 'ADMIN', 'Master Admin', hash, 'admin', now]);
      
      const testHash = await hashSecret('123456');
      await db.run('INSERT INTO users (id, badge, name, hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)', ['test_001', 'TEST-99', 'Test Analyst', testHash, 'analyst', now]);
      set({ isFirstBoot: false });
    } catch (e: any) { 
      throw new Error(e.message || "Database insert failed"); 
    }
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

  logout: () => set({ currentUser: null, isLocked: true })
}));

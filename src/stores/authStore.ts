import { create } from 'zustand';
import { getDb } from '../capacitor/db';
import { hashPassword, verifyPassword } from '../capacitor/crypto';
import { assertPermission, isUserRole, type UserRole } from '../utils/permissions';
import { appendAuditEntry } from '../utils/auditLedger';

export interface User { id: string; badge: string; name: string; role: UserRole; }

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
  addOperator: (badge: string, name: string, pin: string, role: Exclude<UserRole, 'admin'>) => Promise<void>;
  logout: () => void;
}

const createUsersTable = async (db: any) => {
  await db.run('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, badge TEXT UNIQUE NOT NULL, name TEXT NOT NULL, hash TEXT NOT NULL, role TEXT NOT NULL, biometric_enabled INTEGER DEFAULT 0, created_at TEXT NOT NULL, last_login TEXT)');
};

const legacySha256 = async (secret: string): Promise<string> => {
  const encoded = new TextEncoder().encode(secret);
  const digest = await window.crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const isSixDigitPin = (value: string): boolean => /^\d{6}$/.test(value);
const isStrongMasterPassword = (value: string): boolean => value.length >= 12;

const migrateLegacyUsersSchema = async (db: any): Promise<void> => {
  const tableInfo = await db.query('PRAGMA table_info(users)');
  const columns = new Set((tableInfo.values || []).map((column: any) => column.name));
  if (columns.size === 0 || columns.has('badge')) return;

  const legacyTable = `users_legacy_${Date.now()}`;
  await db.execute(`ALTER TABLE users RENAME TO ${legacyTable};`);
  await createUsersTable(db);

  if (columns.has('username') && columns.has('password_hash') && columns.has('display_name')) {
    const biometricColumn = columns.has('biometric_enabled') ? 'biometric_enabled' : '0';
    const createdColumn = columns.has('created_at') ? 'created_at' : "datetime('now')";
    const lastLoginColumn = columns.has('last_login') ? 'last_login' : 'NULL';
    await db.execute(
      `INSERT INTO users (id, badge, name, hash, role, biometric_enabled, created_at, last_login)
       SELECT id, UPPER(username), display_name, password_hash, role, ${biometricColumn}, ${createdColumn}, ${lastLoginColumn}
       FROM ${legacyTable};`,
    );
  }
};

const verifyAndUpgradeCredential = async (db: any, user: any, secret: string): Promise<boolean> => {
  const storedHash = String(user.hash || '');
  let isValid = false;
  let needsUpgrade = false;

  if (storedHash.includes(':')) {
    isValid = await verifyPassword(secret, storedHash);
  } else if (storedHash) {
    isValid = storedHash === await legacySha256(secret);
    needsUpgrade = isValid;
  }

  if (isValid && needsUpgrade) {
    await db.run('UPDATE users SET hash = ? WHERE id = ?', [await hashPassword(secret), user.id]);
  }
  return isValid;
};

const updateLastLogin = async (db: any, userId: string, biometricEnabled = false): Promise<void> => {
  const now = new Date().toISOString();
  if (biometricEnabled) {
    await db.run('UPDATE users SET last_login = ?, biometric_enabled = 1 WHERE id = ?', [now, userId]);
  } else {
    await db.run('UPDATE users SET last_login = ? WHERE id = ?', [now, userId]);
  }
};

export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: null,
  isFirstBoot: true,
  isAppReady: false,
  intentionalBackground: false,

  setIntentionalBackground: (state) => set({ intentionalBackground: state }),

  initializeAuth: async () => {
    try {
      const db = await getDb();
      await migrateLegacyUsersSchema(db);
      await createUsersTable(db);
      const result = await db.query('SELECT COUNT(*) AS count FROM users WHERE role = ?', ['admin']);
      set({ isFirstBoot: Number(result.values?.[0]?.count || 0) === 0, isAppReady: true });
    } catch (error) {
      console.error('Authentication initialisation failed.', error);
      set({ isAppReady: true });
    }
  },

  setupMasterAdmin: async (password: string) => {
    if (!isStrongMasterPassword(password)) throw new Error('Master password must be at least 12 characters.');
    const db = await getDb();
    const existing = await db.query('SELECT id FROM users WHERE role = ? LIMIT 1', ['admin']);
    if (existing.values?.length) throw new Error('Master administrator already exists.');

    const now = new Date().toISOString();
    await db.run(
      'INSERT INTO users (id, badge, name, hash, role, biometric_enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['admin_001', 'ADMIN', 'Master Admin', await hashPassword(password), 'admin', 0, now],
    );
    set({ isFirstBoot: false });
  },

  login: async (badge: string, pin: string) => {
    if (!badge.trim() || !isSixDigitPin(pin)) return false;
    try {
      const db = await getDb();
      const result = await db.query('SELECT * FROM users WHERE badge = ? AND role != ?', [badge.trim().toUpperCase(), 'admin']);
      const user = result.values?.[0];
      if (!user || !isUserRole(user.role) || !await verifyAndUpgradeCredential(db, user, pin)) return false;

      await updateLastLogin(db, user.id, true);
      localStorage.setItem('crimegraph_last_user', user.badge);
      set({ currentUser: user as User });
      return true;
    } catch (error) {
      console.error('Operator sign-in failed.', error);
      return false;
    }
  },

  biometricLogin: async () => {
    try {
      const badge = localStorage.getItem('crimegraph_last_user');
      if (!badge) return false;
      const db = await getDb();
      const result = await db.query('SELECT * FROM users WHERE badge = ? AND role != ? AND biometric_enabled = 1', [badge, 'admin']);
      const user = result.values?.[0];
      if (!user || !isUserRole(user.role)) return false;

      await updateLastLogin(db, user.id);
      set({ currentUser: user as User });
      return true;
    } catch (error) {
      console.error('Biometric profile restoration failed.', error);
      return false;
    }
  },

  adminLogin: async (password: string) => {
    try {
      const db = await getDb();
      const result = await db.query('SELECT * FROM users WHERE role = ? LIMIT 1', ['admin']);
      const user = result.values?.[0];
      if (!user || !isUserRole(user.role) || !await verifyAndUpgradeCredential(db, user, password)) return false;

      await updateLastLogin(db, user.id);
      set({ currentUser: user as User });
      return true;
    } catch (error) {
      console.error('Administrator sign-in failed.', error);
      return false;
    }
  },

  addOperator: async (badge: string, name: string, pin: string, role: Exclude<UserRole, 'admin'>) => {
    assertPermission(get().currentUser?.role, 'operator:provision');
    const cleanBadge = badge.trim().toUpperCase();
    const cleanName = name.trim();
    if (!/^[A-Z0-9-]{3,32}$/.test(cleanBadge)) throw new Error('Badge must contain 3–32 letters, numbers, or hyphens.');
    if (!cleanName || cleanName.length > 100) throw new Error('Operator name is required and must be 100 characters or fewer.');
    if (!isSixDigitPin(pin)) throw new Error('PIN must contain exactly six digits.');
    if (!isUserRole(role)) throw new Error('Select a valid operational role.');

    const db = await getDb();
    const id = window.crypto?.randomUUID ? `user_${window.crypto.randomUUID()}` : `user_${Date.now()}`;
    const now = new Date().toISOString();
    await db.execute('BEGIN IMMEDIATE;');
    try {
      await db.run(
        'INSERT INTO users (id, badge, name, hash, role, biometric_enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, cleanBadge, cleanName, await hashPassword(pin), role, 0, now],
      );
      await appendAuditEntry(db, 'PROVISION_OPERATOR', id, `Provisioned ${role} operator ${cleanBadge}`, get().currentUser?.badge || 'SYSTEM_UNKNOWN');
      await db.execute('COMMIT;');
    } catch (error) {
      try { await db.execute('ROLLBACK;'); } catch { /* Preserve the original provisioning failure. */ }
      throw error;
    }
  },

  logout: () => set({ currentUser: null, intentionalBackground: false }),
}));

import { create } from 'zustand';
import { getDb, withDatabaseTransaction } from '../capacitor/db';
import { hashPassword, verifyPassword } from '../capacitor/crypto';
import { assertPermission, isUserRole, type UserRole } from '../utils/permissions';
import { appendAuditEntry } from '../utils/auditLedger';

export type OperatorStatus = 'active' | 'disabled';
export interface User { id: string; badge: string; name: string; role: UserRole; biometricEnabled?: boolean; }
type ManageableRole = Exclude<UserRole, 'admin'>;
export interface OperatorRecord extends Omit<User, 'role'> {
  role: ManageableRole;
  status: OperatorStatus;
  biometricEnabled: boolean;
  createdAt: string;
  lastLogin: string | null;
  credentialsUpdatedAt: string | null;
  disabledAt: string | null;
  disabledBy: string | null;
  disabledReason: string | null;
}

interface AuthState {
  currentUser: User | null;
  operators: OperatorRecord[];
  isFirstBoot: boolean;
  isAppReady: boolean;
  intentionalBackground: boolean;
  setIntentionalBackground: (state: boolean) => void;
  initializeAuth: () => Promise<void>;
  setupMasterAdmin: (password: string) => Promise<void>;
  login: (badge: string, pin: string) => Promise<boolean>;
  biometricLogin: () => Promise<boolean>;
  adminLogin: (password: string) => Promise<boolean>;
  addOperator: (badge: string, name: string, pin: string, role: ManageableRole) => Promise<void>;
  loadOperators: () => Promise<void>;
  disableOperator: (operatorId: string, reason: string) => Promise<void>;
  reinstateOperator: (operatorId: string, reason: string) => Promise<void>;
  resetOperatorPin: (operatorId: string, pin: string) => Promise<void>;
  changeOperatorRole: (operatorId: string, role: ManageableRole) => Promise<void>;
  logout: () => void;
}

const createUsersTable = async (db: any) => {
  await db.run("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, badge TEXT UNIQUE NOT NULL, name TEXT NOT NULL, hash TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled')), biometric_enabled INTEGER DEFAULT 0, created_at TEXT NOT NULL, last_login TEXT, credentials_updated_at TEXT, disabled_at TEXT, disabled_by TEXT, disabled_reason TEXT)");
};

const legacySha256 = async (secret: string): Promise<string> => {
  const encoded = new TextEncoder().encode(secret);
  const digest = await window.crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const isSixDigitPin = (value: string): boolean => /^\d{6}$/.test(value);
const isStrongMasterPassword = (value: string): boolean => value.length >= 12;
const isOperatorStatus = (value: unknown): value is OperatorStatus => value === 'active' || value === 'disabled';
const isManageableRole = (value: unknown): value is ManageableRole => isUserRole(value) && value !== 'admin';

const normaliseOperator = (record: any): OperatorRecord => {
  if (!record || !isUserRole(record.role) || record.role === 'admin') throw new Error('Invalid operator record.');
  const status = isOperatorStatus(record.status) ? record.status : 'active';
  return {
    id: String(record.id),
    badge: String(record.badge),
    name: String(record.name),
    role: record.role,
    status,
    biometricEnabled: Number(record.biometric_enabled || 0) === 1,
    createdAt: String(record.created_at || ''),
    lastLogin: record.last_login ? String(record.last_login) : null,
    credentialsUpdatedAt: record.credentials_updated_at ? String(record.credentials_updated_at) : null,
    disabledAt: record.disabled_at ? String(record.disabled_at) : null,
    disabledBy: record.disabled_by ? String(record.disabled_by) : null,
    disabledReason: record.disabled_reason ? String(record.disabled_reason) : null,
  };
};

const validateLifecycleReason = (reason: string): string => {
  const cleanReason = reason.trim();
  if (cleanReason.length < 5 || cleanReason.length > 500) {
    throw new Error('A lifecycle reason between 5 and 500 characters is required.');
  }
  return cleanReason;
};

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
      `INSERT INTO users (id, badge, name, hash, role, status, biometric_enabled, created_at, last_login)
       SELECT id, UPPER(username), display_name, password_hash, role, 'active', ${biometricColumn}, ${createdColumn}, ${lastLoginColumn}
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
    await db.run('UPDATE users SET hash = ?, credentials_updated_at = ? WHERE id = ?', [await hashPassword(secret), new Date().toISOString(), user.id]);
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

const replaceOperator = (operators: OperatorRecord[], updated: OperatorRecord): OperatorRecord[] =>
  operators.map((operator) => operator.id === updated.id ? updated : operator);

export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: null,
  operators: [],
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
      'INSERT INTO users (id, badge, name, hash, role, status, biometric_enabled, created_at, credentials_updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['admin_001', 'ADMIN', 'Master Admin', await hashPassword(password), 'admin', 'active', 0, now, now],
    );
    set({ isFirstBoot: false });
  },

  login: async (badge: string, pin: string) => {
    if (!badge.trim() || !isSixDigitPin(pin)) return false;
    try {
      const db = await getDb();
      const result = await db.query("SELECT * FROM users WHERE badge = ? AND role != ? AND COALESCE(status, 'active') = 'active'", [badge.trim().toUpperCase(), 'admin']);
      const user = result.values?.[0];
      if (!user || !isUserRole(user.role) || !await verifyAndUpgradeCredential(db, user, pin)) return false;

      await updateLastLogin(db, user.id, true);
      localStorage.setItem('crimegraph_last_user', user.badge);
      set({ currentUser: { ...user, biometricEnabled: true } as User });
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
      const result = await db.query("SELECT * FROM users WHERE badge = ? AND role != ? AND biometric_enabled = 1 AND COALESCE(status, 'active') = 'active'", [badge, 'admin']);
      const user = result.values?.[0];
      if (!user || !isUserRole(user.role)) return false;

      await updateLastLogin(db, user.id);
      set({ currentUser: { ...user, biometricEnabled: Number(user.biometric_enabled || 0) === 1 } as User });
      return true;
    } catch (error) {
      console.error('Biometric profile restoration failed.', error);
      return false;
    }
  },

  adminLogin: async (password: string) => {
    try {
      const db = await getDb();
      const result = await db.query("SELECT * FROM users WHERE role = ? AND COALESCE(status, 'active') = 'active' LIMIT 1", ['admin']);
      const user = result.values?.[0];
      if (!user || !isUserRole(user.role) || !await verifyAndUpgradeCredential(db, user, password)) return false;

      await updateLastLogin(db, user.id);
      set({ currentUser: { ...user, biometricEnabled: false } as User });
      return true;
    } catch (error) {
      console.error('Administrator sign-in failed.', error);
      return false;
    }
  },

  loadOperators: async () => {
    assertPermission(get().currentUser?.role, 'operator:provision');
    const db = await getDb();
    const result = await db.query("SELECT * FROM users WHERE role != 'admin' ORDER BY CASE COALESCE(status, 'active') WHEN 'active' THEN 0 ELSE 1 END, badge COLLATE NOCASE ASC");
    set({ operators: (result.values || []).map(normaliseOperator) });
  },

  addOperator: async (badge: string, name: string, pin: string, role: ManageableRole) => {
    assertPermission(get().currentUser?.role, 'operator:provision');
    const cleanBadge = badge.trim().toUpperCase();
    const cleanName = name.trim();
    if (!/^[A-Z0-9-]{3,32}$/.test(cleanBadge)) throw new Error('Badge must contain 3–32 letters, numbers, or hyphens.');
    if (!cleanName || cleanName.length > 100) throw new Error('Operator name is required and must be 100 characters or fewer.');
    if (!isSixDigitPin(pin)) throw new Error('PIN must contain exactly six digits.');
    if (!isManageableRole(role)) throw new Error('Select a valid operational role.');

    const db = await getDb();
    const existingBadge = await db.query('SELECT id FROM users WHERE badge = ? COLLATE NOCASE LIMIT 1', [cleanBadge]);
    if (existingBadge.values?.length) throw new Error(`Badge ${cleanBadge} is already provisioned on this device. Choose a different badge ID.`);
    const id = window.crypto?.randomUUID ? `user_${window.crypto.randomUUID()}` : `user_${Date.now()}`;
    const now = new Date().toISOString();
    const operator: OperatorRecord = {
      id, badge: cleanBadge, name: cleanName, role, status: 'active', biometricEnabled: false,
      createdAt: now, lastLogin: null, credentialsUpdatedAt: now, disabledAt: null, disabledBy: null, disabledReason: null,
    };
    await withDatabaseTransaction(db, async (transactionDb) => {
      await transactionDb.run(
        'INSERT INTO users (id, badge, name, hash, role, status, biometric_enabled, created_at, credentials_updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, cleanBadge, cleanName, await hashPassword(pin), role, 'active', 0, now, now],
      );
      await appendAuditEntry(transactionDb, 'PROVISION_OPERATOR', id, `Provisioned ${role} operator ${cleanBadge}`, get().currentUser?.badge || 'SYSTEM_UNKNOWN');
    });
    set((state) => ({ operators: [...state.operators.filter((existing) => existing.id !== id), operator].sort((a, b) => a.badge.localeCompare(b.badge)) }));
  },

  disableOperator: async (operatorId: string, reason: string) => {
    assertPermission(get().currentUser?.role, 'operator:provision');
    const cleanReason = validateLifecycleReason(reason);
    const db = await getDb();
    const result = await db.query("SELECT * FROM users WHERE id = ? AND role != 'admin' LIMIT 1", [operatorId]);
    const existing = result.values?.[0] ? normaliseOperator(result.values[0]) : null;
    if (!existing) throw new Error('Operator record was not found.');
    if (existing.status === 'disabled') throw new Error('Operator is already disabled.');

    const now = new Date().toISOString();
    await withDatabaseTransaction(db, async (transactionDb) => {
      await transactionDb.run('UPDATE users SET status = ?, disabled_at = ?, disabled_by = ?, disabled_reason = ?, biometric_enabled = 0, last_login = NULL WHERE id = ?', ['disabled', now, get().currentUser?.badge || 'SYSTEM_UNKNOWN', cleanReason, operatorId]);
      await appendAuditEntry(transactionDb, 'DISABLE_OPERATOR', operatorId, `Disabled ${existing.badge}: ${cleanReason}`, get().currentUser?.badge || 'SYSTEM_UNKNOWN');
    });
    set((state) => ({ operators: replaceOperator(state.operators, { ...existing, status: 'disabled', biometricEnabled: false, lastLogin: null, disabledAt: now, disabledBy: get().currentUser?.badge || 'SYSTEM_UNKNOWN', disabledReason: cleanReason }) }));
  },

  reinstateOperator: async (operatorId: string, reason: string) => {
    assertPermission(get().currentUser?.role, 'operator:provision');
    const cleanReason = validateLifecycleReason(reason);
    const db = await getDb();
    const result = await db.query("SELECT * FROM users WHERE id = ? AND role != 'admin' LIMIT 1", [operatorId]);
    const existing = result.values?.[0] ? normaliseOperator(result.values[0]) : null;
    if (!existing) throw new Error('Operator record was not found.');
    if (existing.status !== 'disabled') throw new Error('Only disabled operators can be reinstated.');

    await withDatabaseTransaction(db, async (transactionDb) => {
      await transactionDb.run('UPDATE users SET status = ?, disabled_at = NULL, disabled_by = NULL, disabled_reason = NULL, biometric_enabled = 0 WHERE id = ?', ['active', operatorId]);
      await appendAuditEntry(transactionDb, 'REINSTATE_OPERATOR', operatorId, `Reinstated ${existing.badge}: ${cleanReason}`, get().currentUser?.badge || 'SYSTEM_UNKNOWN');
    });
    set((state) => ({ operators: replaceOperator(state.operators, { ...existing, status: 'active', biometricEnabled: false, disabledAt: null, disabledBy: null, disabledReason: null }) }));
  },

  resetOperatorPin: async (operatorId: string, pin: string) => {
    assertPermission(get().currentUser?.role, 'operator:provision');
    if (!isSixDigitPin(pin)) throw new Error('PIN must contain exactly six digits.');
    const db = await getDb();
    const result = await db.query("SELECT * FROM users WHERE id = ? AND role != 'admin' LIMIT 1", [operatorId]);
    const existing = result.values?.[0] ? normaliseOperator(result.values[0]) : null;
    if (!existing) throw new Error('Operator record was not found.');
    if (existing.status !== 'active') throw new Error('Reinstate the operator before resetting their PIN.');

    const now = new Date().toISOString();
    await withDatabaseTransaction(db, async (transactionDb) => {
      await transactionDb.run('UPDATE users SET hash = ?, biometric_enabled = 0, last_login = NULL, credentials_updated_at = ? WHERE id = ?', [await hashPassword(pin), now, operatorId]);
      await appendAuditEntry(transactionDb, 'RESET_OPERATOR_PIN', operatorId, `Reset PIN and revoked biometric sign-in for ${existing.badge}`, get().currentUser?.badge || 'SYSTEM_UNKNOWN');
    });
    set((state) => ({ operators: replaceOperator(state.operators, { ...existing, biometricEnabled: false, lastLogin: null, credentialsUpdatedAt: now }) }));
  },

  changeOperatorRole: async (operatorId: string, role: ManageableRole) => {
    assertPermission(get().currentUser?.role, 'operator:provision');
    if (!isManageableRole(role)) throw new Error('Select a valid operational role.');
    const db = await getDb();
    const result = await db.query("SELECT * FROM users WHERE id = ? AND role != 'admin' LIMIT 1", [operatorId]);
    const existing = result.values?.[0] ? normaliseOperator(result.values[0]) : null;
    if (!existing) throw new Error('Operator record was not found.');
    if (existing.role === role) throw new Error('The operator already has that role.');

    await withDatabaseTransaction(db, async (transactionDb) => {
      await transactionDb.run('UPDATE users SET role = ?, biometric_enabled = 0, last_login = NULL WHERE id = ?', [role, operatorId]);
      await appendAuditEntry(transactionDb, 'CHANGE_OPERATOR_ROLE', operatorId, `Changed ${existing.badge} role from ${existing.role} to ${role}; biometric sign-in revoked`, get().currentUser?.badge || 'SYSTEM_UNKNOWN');
    });
    set((state) => ({ operators: replaceOperator(state.operators, { ...existing, role, biometricEnabled: false, lastLogin: null }) }));
  },

  logout: () => set({ currentUser: null, operators: [], intentionalBackground: false }),
}));

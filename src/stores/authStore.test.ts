import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  appendAuditEntry: vi.fn(),
  withDatabaseTransaction: vi.fn(async (db: unknown, operation: (transactionDb: unknown) => Promise<unknown>) => operation(db)),
}));

vi.mock('../capacitor/db', () => ({ getDb: mocks.getDb, withDatabaseTransaction: mocks.withDatabaseTransaction }));
vi.mock('../utils/auditLedger', () => ({ appendAuditEntry: mocks.appendAuditEntry }));

import { useAuthStore } from './authStore';

beforeAll(() => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    },
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  const users: Array<Record<string, any>> = [];
  const db = {
    execute: vi.fn().mockResolvedValue(undefined),
    run: vi.fn(async (statement: string, values: unknown[] = []) => {
      if (statement.startsWith('INSERT INTO users')) {
        users.push({
          id: values[0], badge: values[1], name: values[2], hash: values[3], role: values[4], status: values[5],
          biometric_enabled: values[6], created_at: values[7], credentials_updated_at: values[8], last_login: null,
          disabled_at: null, disabled_by: null, disabled_reason: null,
        });
        return;
      }
      if (statement.startsWith('UPDATE users SET last_login')) {
        const user = users.find((candidate) => candidate.id === values[values.length - 1]);
        if (user) {
          user.last_login = values[0];
          if (statement.includes('biometric_enabled = 1')) user.biometric_enabled = 1;
        }
        return;
      }
      if (statement.startsWith('UPDATE users SET status = ?') && statement.includes('disabled_at = ?')) {
        const user = users.find((candidate) => candidate.id === values[4]);
        if (user) Object.assign(user, { status: values[0], disabled_at: values[1], disabled_by: values[2], disabled_reason: values[3], biometric_enabled: 0, last_login: null });
        return;
      }
      if (statement.startsWith('UPDATE users SET status = ?') && statement.includes('disabled_at = NULL')) {
        const user = users.find((candidate) => candidate.id === values[1]);
        if (user) Object.assign(user, { status: values[0], disabled_at: null, disabled_by: null, disabled_reason: null, biometric_enabled: 0 });
        return;
      }
      if (statement.startsWith('UPDATE users SET hash = ?')) {
        const user = users.find((candidate) => candidate.id === values[2]);
        if (user) Object.assign(user, { hash: values[0], biometric_enabled: 0, last_login: null, credentials_updated_at: values[1] });
        return;
      }
      if (statement.startsWith('UPDATE users SET role = ?')) {
        const user = users.find((candidate) => candidate.id === values[1]);
        if (user) Object.assign(user, { role: values[0], biometric_enabled: 0, last_login: null });
      }
    }),
    query: vi.fn(async (statement: string, values: unknown[] = []) => {
      if (statement.includes('WHERE badge = ?')) {
        const badge = values[0];
        const requiresBiometric = statement.includes('biometric_enabled = 1');
        return {
          values: users.filter((candidate) => candidate.badge === badge && candidate.role !== 'admin' && candidate.status === 'active' && (!requiresBiometric || candidate.biometric_enabled === 1)),
        };
      }
      if (statement.includes('WHERE id = ?')) {
        return { values: users.filter((candidate) => candidate.id === values[0] && candidate.role !== 'admin') };
      }
      if (statement.includes("WHERE role != 'admin'")) {
        return { values: users.filter((candidate) => candidate.role !== 'admin') };
      }
      return { values: [] };
    }),
  };
  mocks.getDb.mockResolvedValue(db);
  mocks.appendAuditEntry.mockResolvedValue(undefined);
  useAuthStore.setState({
    currentUser: { id: 'admin_001', badge: 'ADMIN', name: 'Master Admin', role: 'admin' },
    operators: [],
    isFirstBoot: false,
    isAppReady: true,
    intentionalBackground: false,
  });
});

describe('operator provisioning and sign-in', () => {
  it('accepts a normalized TEST-001 badge and its newly assigned six-digit PIN', async () => {
    await useAuthStore.getState().addOperator('test-001', 'Test Operator', '123456', 'analyst');

    await expect(useAuthStore.getState().login('TEST-001', '123456')).resolves.toBe(true);
    expect(useAuthStore.getState().currentUser).toMatchObject({ badge: 'TEST-001', role: 'analyst', name: 'Test Operator' });
    expect(mocks.appendAuditEntry).toHaveBeenCalledWith(expect.anything(), 'PROVISION_OPERATOR', expect.any(String), expect.stringContaining('TEST-001'), 'ADMIN');
  });

  it('rejects an invalid operator PIN without authenticating the account', async () => {
    await useAuthStore.getState().addOperator('TEST-001', 'Test Operator', '123456', 'analyst');

    await expect(useAuthStore.getState().login('TEST-001', '654321')).resolves.toBe(false);
    expect(useAuthStore.getState().currentUser).toMatchObject({ badge: 'ADMIN', role: 'admin' });
  });
});

describe('operator lifecycle', () => {
  it('lists managed operators, disables an account, and blocks its PIN and biometric sign-in', async () => {
    await useAuthStore.getState().addOperator('FIELD-001', 'Field Operator', '123456', 'field');
    const operator = useAuthStore.getState().operators[0];

    await useAuthStore.getState().loadOperators();
    expect(useAuthStore.getState().operators).toHaveLength(1);

    await useAuthStore.getState().disableOperator(operator.id, 'Device reassigned to another officer.');
    await expect(useAuthStore.getState().login('FIELD-001', '123456')).resolves.toBe(false);
    localStorage.setItem('crimegraph_last_user', 'FIELD-001');
    await expect(useAuthStore.getState().biometricLogin()).resolves.toBe(false);
    expect(useAuthStore.getState().operators[0]).toMatchObject({ status: 'disabled', biometricEnabled: false, disabledReason: 'Device reassigned to another officer.' });
    expect(mocks.appendAuditEntry).toHaveBeenCalledWith(expect.anything(), 'DISABLE_OPERATOR', operator.id, expect.stringContaining('FIELD-001'), 'ADMIN');
  });

  it('requires reinstatement before a PIN reset and records a new credential after reinstatement', async () => {
    await useAuthStore.getState().addOperator('FIELD-001', 'Field Operator', '123456', 'field');
    const operator = useAuthStore.getState().operators[0];
    await useAuthStore.getState().disableOperator(operator.id, 'Access review pending.');

    await expect(useAuthStore.getState().resetOperatorPin(operator.id, '654321')).rejects.toThrow('Reinstate');
    await useAuthStore.getState().reinstateOperator(operator.id, 'Access review completed.');
    await useAuthStore.getState().resetOperatorPin(operator.id, '654321');

    await expect(useAuthStore.getState().login('FIELD-001', '123456')).resolves.toBe(false);
    await expect(useAuthStore.getState().login('FIELD-001', '654321')).resolves.toBe(true);
    expect(mocks.appendAuditEntry).toHaveBeenCalledWith(expect.anything(), 'RESET_OPERATOR_PIN', operator.id, expect.stringContaining('FIELD-001'), 'ADMIN');
  });

  it('changes a non-administrator role without widening the account to administrator', async () => {
    await useAuthStore.getState().addOperator('FIELD-001', 'Field Operator', '123456', 'field');
    const operator = useAuthStore.getState().operators[0];

    await useAuthStore.getState().changeOperatorRole(operator.id, 'analyst');
    expect(useAuthStore.getState().operators[0]).toMatchObject({ role: 'analyst', biometricEnabled: false });
    expect(mocks.appendAuditEntry).toHaveBeenCalledWith(expect.anything(), 'CHANGE_OPERATOR_ROLE', operator.id, expect.stringContaining('field to analyst'), 'ADMIN');
  });
});


describe('explicit biometric preference', () => {
  it('keeps a newly signed-in operator opted out until the operator explicitly enables strong biometrics', async () => {
    await useAuthStore.getState().addOperator('ANL-001', 'Analyst One', '123456', 'analyst');
    await expect(useAuthStore.getState().login('ANL-001', '123456')).resolves.toBe(true);
    expect(useAuthStore.getState().currentUser).toMatchObject({ badge: 'ANL-001', biometricEnabled: false });

    await useAuthStore.getState().setBiometricPreference(true);
    expect(useAuthStore.getState().currentUser).toMatchObject({ badge: 'ANL-001', biometricEnabled: true });
    expect(mocks.appendAuditEntry).toHaveBeenCalledWith(expect.anything(), 'ENABLE_BIOMETRIC_PREFERENCE', expect.any(String), expect.stringContaining('ANL-001'), 'ANL-001');

    await useAuthStore.getState().setBiometricPreference(false);
    expect(useAuthStore.getState().currentUser).toMatchObject({ badge: 'ANL-001', biometricEnabled: false });
    expect(mocks.appendAuditEntry).toHaveBeenCalledWith(expect.anything(), 'DISABLE_BIOMETRIC_PREFERENCE', expect.any(String), expect.stringContaining('ANL-001'), 'ANL-001');
  });

  it('does not offer administrator biometric preference changes', async () => {
    await expect(useAuthStore.getState().setBiometricPreference(true)).rejects.toThrow('Administrator biometric sign-in is not available');
  });
});

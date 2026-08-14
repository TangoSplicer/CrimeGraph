import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  appendAuditEntry: vi.fn(),
}));

vi.mock('../capacitor/db', () => ({ getDb: mocks.getDb }));
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
  const users: Array<Record<string, unknown>> = [];
  const db = {
    execute: vi.fn().mockResolvedValue(undefined),
    run: vi.fn(async (statement: string, values: unknown[] = []) => {
      if (statement.startsWith('INSERT INTO users')) {
        users.push({
          id: values[0], badge: values[1], name: values[2], hash: values[3], role: values[4],
          biometric_enabled: values[5], created_at: values[6], last_login: null,
        });
      }
      if (statement.startsWith('UPDATE users SET last_login')) {
        const user = users.find((candidate) => candidate.id === values[values.length - 1]);
        if (user) {
          user.last_login = values[0];
          if (statement.includes('biometric_enabled = 1')) user.biometric_enabled = 1;
        }
      }
    }),
    query: vi.fn(async (statement: string, values: unknown[] = []) => {
      if (statement.startsWith('SELECT * FROM users WHERE badge')) {
        const badge = values[0];
        return { values: users.filter((candidate) => candidate.badge === badge && candidate.role !== 'admin') };
      }
      return { values: [] };
    }),
  };
  mocks.getDb.mockResolvedValue(db);
  mocks.appendAuditEntry.mockResolvedValue(undefined);
  useAuthStore.setState({
    currentUser: { id: 'admin_001', badge: 'ADMIN', name: 'Master Admin', role: 'admin' },
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

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  getDeviceStorageSecret: vi.fn(),
  destroyDeviceStorageSecret: vi.fn(),
  connection: {
    initWebStore: vi.fn(),
    isSecretStored: vi.fn(),
    setEncryptionSecret: vi.fn(),
    checkEncryptionSecret: vi.fn(),
    isDatabase: vi.fn(),
    isDatabaseEncrypted: vi.fn(),
    checkConnectionsConsistency: vi.fn(),
    isConnection: vi.fn(),
    retrieveConnection: vi.fn(),
    createConnection: vi.fn(),
    closeConnection: vi.fn(),
  },
  sqlite: { deleteDatabase: vi.fn() },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: mocks.isNativePlatform,
    getPlatform: () => 'android',
  },
}));

vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: mocks.sqlite,
  SQLiteConnection: class {
    constructor() {
      return mocks.connection;
    }
  },
}));

vi.mock('jeep-sqlite/loader', () => ({ defineCustomElements: vi.fn() }));

vi.mock('./deviceIdentity', () => ({
  getDeviceStorageSecret: mocks.getDeviceStorageSecret,
  destroyDeviceStorageSecret: mocks.destroyDeviceStorageSecret,
}));

const makeDatabase = () => ({
  open: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  execute: vi.fn().mockResolvedValue(undefined),
  run: vi.fn().mockResolvedValue(undefined),
});

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.isNativePlatform.mockReturnValue(true);
  mocks.getDeviceStorageSecret.mockResolvedValue(`${'A'.repeat(43)}=`);
  mocks.connection.isSecretStored.mockResolvedValue({ result: false });
  mocks.connection.setEncryptionSecret.mockResolvedValue(undefined);
  mocks.connection.isDatabase.mockResolvedValue({ result: false });
  mocks.connection.isDatabaseEncrypted.mockResolvedValue({ result: false });
  mocks.connection.checkConnectionsConsistency.mockResolvedValue({ result: true });
  mocks.connection.closeConnection.mockResolvedValue(undefined);
  mocks.sqlite.deleteDatabase.mockResolvedValue(undefined);
});

describe('protected database bootstrap', () => {
  it('serializes concurrent callers so the device encryption secret and native connection are initialized once', async () => {
    const db = makeDatabase();
    mocks.connection.isConnection.mockResolvedValue({ result: false });
    mocks.connection.createConnection.mockResolvedValue(db);
    const { getDb } = await import('./db');

    const [first, second, third] = await Promise.all([getDb(), getDb(), getDb()]);

    expect(first).toBe(db);
    expect(second).toBe(db);
    expect(third).toBe(db);
    expect(mocks.getDeviceStorageSecret).toHaveBeenCalledTimes(1);
    expect(mocks.connection.setEncryptionSecret).toHaveBeenCalledWith(`${'A'.repeat(43)}=`);
    expect(mocks.connection.createConnection).toHaveBeenCalledWith('crimegraph_db', true, 'secret', 1, false);
    expect(mocks.connection.createConnection).toHaveBeenCalledTimes(1);
    expect(db.open).toHaveBeenCalledTimes(1);
  });

  it('reconciles a stale JavaScript connection and recreates it when native open reports no available connection', async () => {
    const staleDb = makeDatabase();
    staleDb.open.mockRejectedValueOnce(new Error('No available connection for database crimegraph_db'));
    const freshDb = makeDatabase();
    mocks.connection.isConnection
      .mockResolvedValueOnce({ result: true })
      .mockResolvedValueOnce({ result: false });
    mocks.connection.retrieveConnection.mockResolvedValue(staleDb);
    mocks.connection.createConnection.mockResolvedValue(freshDb);
    const { getDb } = await import('./db');

    await expect(getDb()).resolves.toBe(freshDb);

    expect(mocks.connection.checkConnectionsConsistency).toHaveBeenCalledTimes(2);
    expect(mocks.connection.createConnection).toHaveBeenCalledWith('crimegraph_db', true, 'secret', 1, false);
    expect(staleDb.open).toHaveBeenCalledTimes(1);
    expect(freshDb.open).toHaveBeenCalledTimes(1);
  });

  it('uses conversion mode only for an existing plaintext database', async () => {
    const db = makeDatabase();
    mocks.connection.isDatabase.mockResolvedValue({ result: true });
    mocks.connection.isDatabaseEncrypted.mockResolvedValue({ result: false });
    mocks.connection.isConnection.mockResolvedValue({ result: false });
    mocks.connection.createConnection.mockResolvedValue(db);
    const { getDb } = await import('./db');

    await expect(getDb()).resolves.toBe(db);

    expect(mocks.connection.createConnection).toHaveBeenCalledWith('crimegraph_db', true, 'encryption', 1, false);
  });
});

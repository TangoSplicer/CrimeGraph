import { beforeEach, describe, expect, it, vi } from 'vitest';

const meshMocks = vi.hoisted(() => ({
  initializeHardware: vi.fn(),
  startTacticalScan: vi.fn(),
  stopTacticalScan: vi.fn(),
}));

vi.mock('../capacitor/mesh', () => ({ MeshNetwork: meshMocks }));
vi.mock('../capacitor/db', async () => {
  const actual = await vi.importActual<typeof import('../capacitor/db')>('../capacitor/db');
  return { ...actual, getDb: vi.fn() };
});

import { withDatabaseTransaction } from '../capacitor/db';
import { useSyncStore } from './syncStore';

describe('Tactical Mesh discovery controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSyncStore.setState({
      isHardwareReady: false,
      isScanning: false,
      discoveredPeers: [],
      transferStatus: 'Tactical Mesh radio is not initialized. Discovery never transfers case intelligence.',
    });
  });

  it('initializes the native adapter, discovers peer beacons, deduplicates them, and stops scanning without transfer', async () => {
    meshMocks.initializeHardware.mockResolvedValue(true);
    meshMocks.startTacticalScan.mockImplementation(async (callback: (device: unknown) => void) => {
      callback({ deviceId: 'ble-peer-1', name: 'Field A', rssi: -47 });
      callback({ deviceId: 'ble-peer-1', name: 'Field A updated', rssi: -42 });
      callback({ deviceId: 'ble-peer-2', name: 'Field B', rssi: -61 });
    });
    meshMocks.stopTacticalScan.mockResolvedValue(undefined);

    await useSyncStore.getState().initializeMesh();
    expect(useSyncStore.getState().isHardwareReady).toBe(true);

    await useSyncStore.getState().startDiscovery();
    expect(meshMocks.startTacticalScan).toHaveBeenCalledTimes(1);
    expect(useSyncStore.getState().isScanning).toBe(true);
    expect(useSyncStore.getState().discoveredPeers).toEqual([
      { deviceId: 'ble-peer-2', name: 'Field B', rssi: -61 },
      { deviceId: 'ble-peer-1', name: 'Field A updated', rssi: -42 },
    ]);
    expect(useSyncStore.getState().transferStatus).toContain('does not exchange');

    await useSyncStore.getState().stopDiscovery();
    expect(meshMocks.stopTacticalScan).toHaveBeenCalledTimes(1);
    expect(useSyncStore.getState().isScanning).toBe(false);
    expect(useSyncStore.getState().transferStatus).toContain('No intelligence was transferred');
  });

  it('does not start a scan before successful hardware initialization and gives an explicit status', async () => {
    await useSyncStore.getState().startDiscovery();
    expect(meshMocks.startTacticalScan).not.toHaveBeenCalled();
    expect(useSyncStore.getState().transferStatus).toContain('Initialize the Tactical Mesh radio');

    meshMocks.initializeHardware.mockRejectedValue(new Error('Bluetooth radio is not ready (disabled).'));
    await useSyncStore.getState().initializeMesh();
    expect(useSyncStore.getState().isHardwareReady).toBe(false);
    expect(useSyncStore.getState().transferStatus).toContain('TACTICAL MESH INACTIVE');
    expect(useSyncStore.getState().transferStatus).toContain('Bluetooth radio is not ready');
  });
});

describe('native-safe transaction helper', () => {
  it('uses the bridge lifecycle APIs when native transaction methods are available', async () => {
    const db = { beginTransaction: vi.fn(), commitTransaction: vi.fn(), rollbackTransaction: vi.fn(), execute: vi.fn() };
    const result = await withDatabaseTransaction(db, async () => 'committed');
    expect(result).toBe('committed');
    expect(db.beginTransaction).toHaveBeenCalledOnce();
    expect(db.commitTransaction).toHaveBeenCalledOnce();
    expect(db.rollbackTransaction).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('keeps scoped writes inside the native transaction by disabling per-call auto-transactions', async () => {
    const db = { beginTransaction: vi.fn(), commitTransaction: vi.fn(), rollbackTransaction: vi.fn(), run: vi.fn(), execute: vi.fn(), executeSet: vi.fn() };
    await withDatabaseTransaction(db, async (transactionDb) => {
      await transactionDb.run('INSERT INTO users (id) VALUES (?)', ['operator-1']);
      await transactionDb.execute('CREATE INDEX IF NOT EXISTS idx_users_id ON users(id)');
      await transactionDb.executeSet([{ statement: 'UPDATE users SET name = ?', values: ['Operator'] }]);
    });
    expect(db.run).toHaveBeenCalledWith('INSERT INTO users (id) VALUES (?)', ['operator-1'], false, 'no', true);
    expect(db.execute).toHaveBeenCalledWith('CREATE INDEX IF NOT EXISTS idx_users_id ON users(id)', false, true);
    expect(db.executeSet).toHaveBeenCalledWith([{ statement: 'UPDATE users SET name = ?', values: ['Operator'] }], false, 'no', true);
    expect(db.commitTransaction).toHaveBeenCalledOnce();
  });

  it('also scopes legacy callbacks that close over the base connection', async () => {
    const nativeRun = vi.fn();
    const nativeExecute = vi.fn();
    const db = { beginTransaction: vi.fn(), commitTransaction: vi.fn(), rollbackTransaction: vi.fn(), run: nativeRun, execute: nativeExecute };
    await withDatabaseTransaction(db, async () => {
      await db.run('INSERT INTO nodes (id) VALUES (?)', ['node-1']);
      await db.execute('UPDATE nodes SET label = \'Local\' WHERE id = \'node-1\'');
    });
    expect(nativeRun).toHaveBeenCalledWith('INSERT INTO nodes (id) VALUES (?)', ['node-1'], false, 'no', true);
    expect(nativeExecute).toHaveBeenCalledWith("UPDATE nodes SET label = 'Local' WHERE id = 'node-1'", false, true);
    expect(db.run).toBe(nativeRun);
    expect(db.execute).toBe(nativeExecute);
  });

  it('rolls back through the bridge when the operation fails', async () => {
    const db = { beginTransaction: vi.fn(), commitTransaction: vi.fn(), rollbackTransaction: vi.fn(), execute: vi.fn() };
    await expect(withDatabaseTransaction(db, async () => { throw new Error('write failed'); })).rejects.toThrow('write failed');
    expect(db.beginTransaction).toHaveBeenCalledOnce();
    expect(db.commitTransaction).not.toHaveBeenCalled();
    expect(db.rollbackTransaction).toHaveBeenCalledOnce();
  });

  it('retains the SQL transaction fallback for the browser SQLite test bridge', async () => {
    const db = { execute: vi.fn() };
    await withDatabaseTransaction(db, async () => undefined);
    expect(db.execute).toHaveBeenNthCalledWith(1, 'BEGIN IMMEDIATE;', false);
    expect(db.execute).toHaveBeenNthCalledWith(2, 'COMMIT;', false);
  });
});

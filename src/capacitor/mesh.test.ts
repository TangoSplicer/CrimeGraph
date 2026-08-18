import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MeshNetwork } from './mesh';

describe('Tactical Mesh Bluetooth LE adapter', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true });
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { bluetoothle?: unknown }).bluetoothle;
  });

  it('rejects with an explicit installed-bridge error when the native Bluetooth bridge is absent', async () => {
    await expect(MeshNetwork.initializeHardware()).rejects.toThrow('Bluetooth LE bridge is not loaded');
  });

  it('uses the Cordova BLE callback-first signatures to initialize, advertise, scan, and stop', async () => {
    const adapter = {
      initialize: vi.fn((success: (result: unknown) => void, params: unknown) => {
        expect(params).toEqual({ request: true, statusReceiver: false });
        success({ status: 'enabled' });
      }),
      initializePeripheral: vi.fn((success: (result: unknown) => void, _error: unknown, params: unknown) => {
        expect(params).toEqual({ request: true });
        success({ status: 'enabled' });
      }),
      addService: vi.fn((success: () => void, _error: unknown, params: { service: string }) => {
        expect(params.service).toContain('0000FF01');
        success();
      }),
      startAdvertising: vi.fn((success: () => void, _error: unknown, params: { services: string[] }) => {
        expect(params.services[0]).toContain('0000FF01');
        success();
      }),
      startScan: vi.fn((success: (result: unknown) => void, _error: unknown, params: { services: string[] }) => {
        expect(params.services[0]).toContain('0000FF01');
        success({ status: 'scanStarted' });
        success({ status: 'scanResult', address: 'AA:BB:CC:DD:EE:FF', name: 'Field handset A', rssi: -49 });
      }),
      stopScan: vi.fn((success: () => void) => success()),
    };
    (globalThis as typeof globalThis & { bluetoothle?: unknown }).bluetoothle = adapter;

    await expect(MeshNetwork.initializeHardware()).resolves.toBeUndefined();
    const discovered: Array<{ deviceId: string; name: string; rssi: number }> = [];
    await MeshNetwork.startTacticalScan((device) => discovered.push(device));
    await MeshNetwork.stopTacticalScan();

    expect(adapter.initialize).toHaveBeenCalledOnce();
    expect(adapter.addService).toHaveBeenCalledOnce();
    expect(adapter.startAdvertising).toHaveBeenCalledOnce();
    expect(adapter.startScan).toHaveBeenCalledOnce();
    expect(adapter.stopScan).toHaveBeenCalledOnce();
    expect(discovered).toEqual([{ deviceId: 'AA:BB:CC:DD:EE:FF', name: 'Field handset A', rssi: -49 }]);
  });

  it('reports a radio initialization failure with its native status', async () => {
    (globalThis as typeof globalThis & { bluetoothle?: unknown }).bluetoothle = {
      initialize: vi.fn((success: (result: unknown) => void) => success({ status: 'disabled' })),
    };
    await expect(MeshNetwork.initializeHardware()).rejects.toThrow('Bluetooth radio is not ready (disabled)');
  });

  it('propagates scan errors rather than leaving discovery in an ambiguous state', async () => {
    (globalThis as typeof globalThis & { bluetoothle?: unknown }).bluetoothle = {
      startScan: vi.fn((_success: unknown, error: (value: unknown) => void) => error({ message: 'permission denied' })),
    };
    await expect(MeshNetwork.startTacticalScan(() => undefined)).rejects.toThrow('permission denied');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  nativePlugin: {
    getPublicIdentity: vi.fn(),
    getStorageSecret: vi.fn(),
    destroyStorageSecret: vi.fn(),
    sign: vi.fn(),
    verify: vi.fn(),
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
  registerPlugin: () => mocks.nativePlugin,
}));

import { getDeviceStorageSecret, isValidDeviceStorageSecret } from './deviceIdentity';

const VALID_SECRET = `${'A'.repeat(43)}=`;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isNativePlatform.mockReturnValue(true);
});

describe('device-bound storage secret contract', () => {
  it('accepts only an exact base64-encoded 32-byte AES secret', () => {
    expect(isValidDeviceStorageSecret(VALID_SECRET)).toBe(true);
    expect(isValidDeviceStorageSecret('A'.repeat(44))).toBe(false);
    expect(isValidDeviceStorageSecret(`${'A'.repeat(42)}==`)).toBe(false);
    expect(isValidDeviceStorageSecret(btoa('too-short'))).toBe(false);
    expect(isValidDeviceStorageSecret('not base64 !!!')).toBe(false);
  });

  it('fails closed when the native bridge returns a malformed storage secret', async () => {
    mocks.nativePlugin.getStorageSecret.mockResolvedValue({ secret: btoa('too-short') });
    await expect(getDeviceStorageSecret()).rejects.toThrow('storage secret is unavailable');
  });

  it('returns a valid bridge secret only on a native platform', async () => {
    mocks.nativePlugin.getStorageSecret.mockResolvedValue({ secret: VALID_SECRET });
    await expect(getDeviceStorageSecret()).resolves.toBe(VALID_SECRET);
    mocks.isNativePlatform.mockReturnValue(false);
    await expect(getDeviceStorageSecret()).rejects.toThrow('native Android application');
  });
});

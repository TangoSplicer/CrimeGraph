import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  isBiometricAvailable: vi.fn(),
  authenticateWithBiometrics: vi.fn(),
  getAuthState: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
}));

vi.mock('../capacitor/biometrics', () => ({
  isBiometricAvailable: mocks.isBiometricAvailable,
  authenticateWithBiometrics: mocks.authenticateWithBiometrics,
}));

vi.mock('../stores/authStore', () => ({
  useAuthStore: { getState: mocks.getAuthState },
}));

import { requireHighRiskReauthentication } from './highRiskAuth';

beforeAll(() => {
  Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true });
});

beforeEach(() => {
  mocks.isNativePlatform.mockReturnValue(false);
  mocks.isBiometricAvailable.mockResolvedValue(false);
  mocks.authenticateWithBiometrics.mockResolvedValue(false);
  Object.defineProperty(globalThis, 'prompt', { value: vi.fn(), configurable: true });
});

describe('high-risk reauthentication gate', () => {
  it('rejects sensitive actions without an active operator session', async () => {
    mocks.getAuthState.mockReturnValue({ currentUser: null });
    await expect(requireHighRiskReauthentication('Wipe protected data')).rejects.toThrow('active session');
  });

  it('uses successful native biometric confirmation without requesting a credential', async () => {
    const login = vi.fn();
    mocks.getAuthState.mockReturnValue({ currentUser: { badge: 'FIELD-7', role: 'field', biometricEnabled: true }, login, adminLogin: vi.fn() });
    mocks.isNativePlatform.mockReturnValue(true);
    mocks.isBiometricAvailable.mockResolvedValue(true);
    mocks.authenticateWithBiometrics.mockResolvedValue(true);

    await expect(requireHighRiskReauthentication('Verify peer device')).resolves.toBeUndefined();
    expect(mocks.authenticateWithBiometrics).toHaveBeenCalledWith('Verify peer device');
    expect(login).not.toHaveBeenCalled();
    expect(globalThis.prompt).not.toHaveBeenCalled();
  });

  it('uses the current operator PIN when biometric confirmation is unavailable', async () => {
    const login = vi.fn().mockResolvedValue(true);
    mocks.getAuthState.mockReturnValue({ currentUser: { badge: 'FIELD-7', role: 'field' }, login, adminLogin: vi.fn() });
    const prompt = vi.fn().mockReturnValue('123456');
    Object.defineProperty(globalThis, 'prompt', { value: prompt, configurable: true });

    await expect(requireHighRiskReauthentication('Revoke peer device')).resolves.toBeUndefined();
    expect(prompt).toHaveBeenCalledWith('Confirm this sensitive action with your six-digit PIN:');
    expect(login).toHaveBeenCalledWith('FIELD-7', '123456');
  });

  it('fails closed when the fallback credential is rejected', async () => {
    const login = vi.fn().mockResolvedValue(false);
    mocks.getAuthState.mockReturnValue({ currentUser: { badge: 'FIELD-7', role: 'field' }, login, adminLogin: vi.fn() });
    Object.defineProperty(globalThis, 'prompt', { value: vi.fn().mockReturnValue('000000'), configurable: true });

    await expect(requireHighRiskReauthentication('Wipe protected data')).rejects.toThrow('Credential confirmation failed');
  });
});

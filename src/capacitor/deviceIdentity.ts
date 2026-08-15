import { Capacitor, registerPlugin } from '@capacitor/core';

interface NativeDeviceIdentityPlugin {
  getPublicIdentity(): Promise<{ deviceId: string; publicKey: string; fingerprint: string }>;
  getAssurance(): Promise<DeviceAssurance>;
  getStorageSecret(): Promise<{ secret: string }>;
  destroyStorageSecret(): Promise<void>;
  sign(options: { payload: string }): Promise<{ signature: string }>;
  verify(options: { publicKey: string; payload: string; signature: string }): Promise<{ verified: boolean }>;
}

const NativeDeviceIdentity = registerPlugin<NativeDeviceIdentityPlugin>('DeviceIdentity');

export interface DeviceIdentity {
  deviceId: string;
  publicKey: string;
  fingerprint: string;
}

export interface DeviceAssurance {
  identityKeyPresent: boolean;
  storageSecretPresent: boolean;
  identityKeySecurityLevel: 'strongbox' | 'trusted-environment' | 'software' | 'hardware-backed-level-not-exposed' | 'unavailable' | 'unknown';
  storageWrapKeySecurityLevel: 'strongbox' | 'trusted-environment' | 'software' | 'hardware-backed-level-not-exposed' | 'unavailable' | 'unknown';
  backupExcluded: boolean;
  availableStorageBytes: number;
  biometricReadiness: 'available' | 'hardware-present-not-enrolled' | 'temporarily-unavailable' | 'unavailable' | 'unknown';
  appVersion: string;
  appVersionCode: number;
  androidVersion: string;
  sdkInt: number;
}

export const isValidDeviceStorageSecret = (secret: unknown): secret is string =>
  typeof secret === 'string' && /^[A-Za-z0-9+/]{43}=$/.test(secret);

const assertNativeIdentitySupport = (): void => {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Verified pairing is available only in the native Android application. Browser previews do not expose a secure device identity.');
  }
};

export const getDeviceAssurance = async (): Promise<DeviceAssurance> => {
  assertNativeIdentitySupport();
  return NativeDeviceIdentity.getAssurance();
};

export const getDeviceIdentity = async (): Promise<DeviceIdentity> => {
  assertNativeIdentitySupport();
  const identity = await NativeDeviceIdentity.getPublicIdentity();
  if (!identity.deviceId || !identity.publicKey || !identity.fingerprint) {
    throw new Error('The device identity could not be established.');
  }
  return identity;
};

export const getDeviceStorageSecret = async (): Promise<string> => {
  assertNativeIdentitySupport();
  const result = await NativeDeviceIdentity.getStorageSecret();
  if (!isValidDeviceStorageSecret(result.secret)) throw new Error('The device storage secret is unavailable.');
  return result.secret;
};

export const destroyDeviceStorageSecret = async (): Promise<void> => {
  assertNativeIdentitySupport();
  await NativeDeviceIdentity.destroyStorageSecret();
};

export const signWithDeviceIdentity = async (payload: string): Promise<string> => {
  assertNativeIdentitySupport();
  if (!payload) throw new Error('A pairing payload is required.');
  const result = await NativeDeviceIdentity.sign({ payload });
  if (!result.signature) throw new Error('The device could not sign the pairing payload.');
  return result.signature;
};

export const verifyDeviceSignature = async (publicKey: string, payload: string, signature: string): Promise<boolean> => {
  assertNativeIdentitySupport();
  if (!publicKey || !payload || !signature) return false;
  const result = await NativeDeviceIdentity.verify({ publicKey, payload, signature });
  return result.verified === true;
};

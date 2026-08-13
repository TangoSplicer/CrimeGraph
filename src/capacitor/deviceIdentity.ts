import { Capacitor, registerPlugin } from '@capacitor/core';

interface NativeDeviceIdentityPlugin {
  getPublicIdentity(): Promise<{ deviceId: string; publicKey: string; fingerprint: string }>;
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

const assertNativeIdentitySupport = (): void => {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Verified pairing is available only in the native Android application. Browser previews do not expose a secure device identity.');
  }
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
  if (!result.secret || !/^[A-Za-z0-9+/=]{32,}$/.test(result.secret)) throw new Error('The device storage secret is unavailable.');
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

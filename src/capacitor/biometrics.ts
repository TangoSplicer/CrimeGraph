import { AndroidBiometryStrength, BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { Preferences } from '@capacitor/preferences';

export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const info = await BiometricAuth.checkBiometry();
    return info.isAvailable;
  } catch {
    return false;
  }
}

export async function authenticateWithBiometrics(reason: string): Promise<boolean> {
  try {
    // High-risk CrimeGraph actions require strong biometrics, explicit user
    // confirmation, and never silently fall back to the device unlock secret.
    await BiometricAuth.authenticate({
      reason,
      cancelTitle: 'Cancel',
      androidTitle: 'CrimeGraph Security Check',
      androidSubtitle: 'Confirm this protected operation',
      allowDeviceCredential: false,
      androidConfirmationRequired: true,
      androidBiometryStrength: AndroidBiometryStrength.strong,
    });
    return true;
  } catch {
    // The caller exposes a generic, user-safe failure state; raw native errors
    // can reveal device enrollment or lockout details in production logs.
    return false;
  }
}

export async function enableBiometricForUser(userId: string): Promise<void> {
  await Preferences.set({ key: `biometric_${userId}`, value: '1' });
}

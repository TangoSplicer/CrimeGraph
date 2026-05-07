import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { Preferences } from '@capacitor/preferences';

export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const info = await BiometricAuth.checkBiometry();
    return info.isAvailable;
  } catch (e) {
    return false;
  }
}

export async function authenticateWithBiometrics(reason: string): Promise<boolean> {
  try {
    // The plugin resolves with void on success, and throws on failure/cancel
    await BiometricAuth.authenticate({ reason });
    return true;
  } catch (e) {
    console.error('Biometric auth failed or canceled', e);
    return false;
  }
}

export async function enableBiometricForUser(userId: string): Promise<void> {
  await Preferences.set({ key: `biometric_${userId}`, value: '1' });
}

import { Capacitor } from '@capacitor/core';
import { authenticateWithBiometrics, isBiometricAvailable } from '../capacitor/biometrics';
import { useAuthStore } from '../stores/authStore';

export const requireHighRiskReauthentication = async (reason: string): Promise<void> => {
  const auth = useAuthStore.getState();
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('An active session is required for this action.');

  if (Capacitor.isNativePlatform() && await isBiometricAvailable()) {
    if (await authenticateWithBiometrics(reason)) return;
    throw new Error('Biometric confirmation is required to continue.');
  }

  const prompt = currentUser.role === 'admin'
    ? 'Confirm this sensitive action with the administrator password:'
    : 'Confirm this sensitive action with your six-digit PIN:';
  const credential = window.prompt(prompt);
  if (!credential) throw new Error('Sensitive action cancelled.');
  const reauthenticated = currentUser.role === 'admin'
    ? await auth.adminLogin(credential)
    : await auth.login(currentUser.badge, credential);
  if (!reauthenticated) throw new Error('Credential confirmation failed.');
};

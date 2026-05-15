import { registerPlugin } from '@capacitor/core';
const proxy = registerPlugin('BiometricAuthNative', {
    web: async () => import('./web').then((module) => new module.BiometricAuthWeb()),
    ios: async () => import('./native').then((module) => new module.BiometricAuthNative(proxy)),
    android: async () => import('./native').then((module) => new module.BiometricAuthNative(proxy)),
});
export * from './definitions';
export * from './web-utils';
export { proxy as BiometricAuth };

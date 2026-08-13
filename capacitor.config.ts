import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.crimegraph.app',
  appName: 'CrimeGraph',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#0c0e14",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    CapacitorSQLite: {
      androidIsEncryption: true,
      androidBiometric: {
        biometricAuth: false,
        biometricTitle: 'Unlock protected CrimeGraph storage',
        biometricSubTitle: 'Authenticate to access encrypted local intelligence',
      },
      iosIsEncryption: true,
      iosKeychainPrefix: 'com.crimegraph.app',
    },
  },
};

export default config;

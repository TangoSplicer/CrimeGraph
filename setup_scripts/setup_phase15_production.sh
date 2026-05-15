#!/bin/bash

echo "Installing Splash Screen plugin and Asset Generator..."
npm install @capacitor/splash-screen
npm install -D @capacitor/assets

echo "Updating capacitor.config.ts with production Splash Screen settings..."
cat << 'EOF' > capacitor.config.ts
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.crimegraph.app',
  appName: 'CrimeGraph',
  webDir: 'dist',
  bundledWebRuntime: false,
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
  },
};

export default config;
EOF

echo "Creating the assets directory..."
mkdir -p assets

echo "Adding asset generation to package.json scripts..."
sed -i 's/"build": "tsc && vite build",/"build": "tsc && vite build",\n    "generate-assets": "capacitor-assets generate",/g' package.json

echo "Staging files..."
git add package.json package-lock.json capacitor.config.ts assets/

echo "Committing..."
git commit -m "chore: configure native splash screen and setup capacitor-assets for production"

echo "Pushing to GitHub..."
git push origin main

echo "Production Configuration Deployed!"

#!/bin/bash

echo "Creating project directories..."
mkdir -p src/capacitor src/stores src/screens src/components src/utils
mkdir -p public/fonts .github/workflows

echo "Writing package.json..."
cat << 'EOF' > package.json
{
  "name": "crimegraph",
  "private": true,
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "sync": "cap sync"
  },
  "dependencies": {
    "@capacitor-community/electron": "^5.0.0",
    "@capacitor-community/screen-recorder": "^1.0.0",
    "@capacitor-community/sqlite": "^6.0.0",
    "@capacitor/android": "^6.0.0",
    "@capacitor/app": "^6.0.0",
    "@capacitor/camera": "^6.0.0",
    "@capacitor/core": "^6.0.0",
    "@capacitor/filesystem": "^6.0.0",
    "@capacitor/haptics": "^6.0.0",
    "@capacitor/ios": "^6.0.0",
    "@capacitor/preferences": "^6.0.0",
    "@capacitor/share": "^6.0.0",
    "@capacitor/status-bar": "^6.0.0",
    "capacitor-biometric-authentication": "^8.0.0",
    "cytoscape": "^3.28.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.22.0",
    "vis-timeline": "^7.7.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.66",
    "@types/react-dom": "^18.2.22",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.2.2",
    "vite": "^5.0.0"
  }
}
EOF

echo "Writing capacitor.config.ts..."
cat << 'EOF' > capacitor.config.ts
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'uk.police.crimegraph',
  appName: 'CrimeGraph',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0c0e14'
    },
    Keyboard: {
      resize: 'body',
      style: 'DARK'
    }
  }
};

export default config;
EOF

echo "Writing Vite config..."
cat << 'EOF' > vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
});
EOF

echo "Writing Database Schema..."
cat << 'EOF' > src/capacitor/schema.sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','sio','analyst','officer','readonly')),
  display_name TEXT NOT NULL,
  force_unit TEXT,
  biometric_enabled INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  last_login TEXT,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  reference_number TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  case_type TEXT NOT NULL CHECK(case_type IN ('major_crime','missing_person','organised_crime','other')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','pending_review','closed','archived')),
  lead_officer_id TEXT REFERENCES users(id),
  classification TEXT NOT NULL DEFAULT 'OFFICIAL',
  description TEXT,
  date_opened TEXT NOT NULL,
  date_closed TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Additional tables (nodes, edges, attachments, audit_log) will be initialized here.
EOF

echo "Updating GitHub Actions CI/CD for Capacitor..."
cat << 'EOF' > .github/workflows/android-build.yml
name: CrimeGraph Capacitor Build

on:
  push:
    branches: [ "main", "master" ]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
    - name: Checkout Repository
      uses: actions/checkout@v4

    - name: Set up Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'npm'

    - name: Set up JDK 17
      uses: actions/setup-java@v4
      with:
        java-version: '17'
        distribution: 'temurin'

    - name: Install Dependencies
      run: npm install

    - name: Build React App
      run: npm run build

    - name: Generate Capacitor Android Project
      run: |
        npx cap add android
        npx cap sync android

    - name: Build Android APK
      working-directory: ./android
      run: |
        chmod +x gradlew
        ./gradlew assembleDebug

    - name: Upload APK
      uses: actions/upload-artifact@v4
      with:
        name: crimegraph-android-apk
        path: android/app/build/outputs/apk/debug/app-debug.apk
EOF

echo "Phase 1 Scaffolding Complete!"

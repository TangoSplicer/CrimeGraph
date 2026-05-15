#!/bin/bash

echo "Patching GitHub Actions to forcefully use Capacitor CLI v6..."
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

    - name: Clean Install Dependencies
      run: npm ci --legacy-peer-deps

    - name: Build React App
      run: npm run build

    - name: Generate Capacitor Android Project
      # 🚀 THE ELITE FIX: Explicitly append @6 to force npx's hand
      run: |
        npx @capacitor/cli@6 add android
        npx @capacitor/cli@6 sync android

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

echo "Staging pipeline file..."
git add .github/workflows/android-build.yml

echo "Committing..."
git commit -m "ci: absolutely force npx to use @capacitor/cli@6"

echo "Pushing to GitHub..."
git push origin main

echo "Done! The cloud runner is now forced into compliance."

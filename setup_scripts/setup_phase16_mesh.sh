#!/bin/bash
echo "Installing BLE dependencies (Capacitor 6 compatible)..."
npm install @capacitor-community/bluetooth-le@^6.0.0

echo "Compiling web assets (generating /dist directory)..."
npm run build

echo "Syncing Capacitor bridge..."
npx cap sync android

echo "Creating native bridge file placeholder..."
touch src/capacitor/mesh.ts

echo "Phase 16 Mesh Setup Complete."

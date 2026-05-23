#!/bin/bash
echo "Uninstalling scanning-only plugin..."
npm uninstall @capacitor-community/bluetooth-le

echo "Installing dual-role mesh plugin..."
npm install cordova-plugin-bluetoothle

echo "Syncing native bridge to remove old Java files..."
npx cap sync android

echo "Plugin swap complete."

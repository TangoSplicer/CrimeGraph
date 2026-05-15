#!/bin/bash

echo "Installing Capacitor 6 CLI locally..."
npm install -D @capacitor/cli@^6.0.0 --legacy-peer-deps

echo "Staging files..."
git add package.json package-lock.json

echo "Committing..."
git commit -m "build: lock Capacitor CLI to v6 to prevent npx major version drift"

echo "Pushing to GitHub..."
git push origin main

echo "Done! The CI pipeline is now locked to v6."

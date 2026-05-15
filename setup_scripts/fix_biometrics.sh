#!/bin/bash

echo "Removing the hallucinated biometric package..."
npm pkg delete dependencies."capacitor-biometric-authentication"

echo "Installing the correct Capacitor 6 biometric auth plugin..."
npm install @aparajita/capacitor-biometric-auth@^8.0.0 --legacy-peer-deps

echo "Staging files..."
git add package.json package-lock.json

echo "Committing..."
git commit -m "fix: replace invalid biometric auth package with correct namespace"

echo "Pushing to GitHub..."
git push origin main

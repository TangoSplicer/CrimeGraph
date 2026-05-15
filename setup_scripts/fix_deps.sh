#!/bin/bash

echo "Installing Capacitor 6 compatible privacy-screen..."
npm install @capacitor-community/privacy-screen@^6.0.0

echo "Staging files..."
git add package.json package-lock.json

echo "Committing..."
git commit -m "fix: resolve peer dependency conflict and lock versions"

echo "Pushing to GitHub..."
git push origin main

#!/bin/bash

echo "Forcing installation of privacy-screen bypassing peer checks..."
npm install @capacitor-community/privacy-screen@^6.0.0 --legacy-peer-deps

echo "Ensuring all other dependencies are locked..."
npm install --legacy-peer-deps

echo "Staging files..."
git add package.json package-lock.json

echo "Committing..."
git commit -m "build: force dependency resolution with legacy-peer-deps"

echo "Pushing to GitHub..."
git push origin main

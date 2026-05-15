#!/bin/bash

echo "Patching App.tsx to use dynamic Capacitor plugin registration..."
cat << 'EOF' > src/App.tsx
import React, { useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { useAuthStore } from './stores/authStore';
import { initDatabase } from './capacitor/db';

// 🚀 ELITE FIX: Dynamically register the native plugin to bypass Vite's static web bundler
const PrivacyScreen = registerPlugin<any>('PrivacyScreen');

const App: React.FC = () => {
  const { isLocked, recordActivity, lock, lockTimeoutMs, lastActivityAt } = useAuthStore();

  useEffect(() => {
    initDatabase().catch(console.error);

    if (Capacitor.isNativePlatform()) {
      // This will now execute natively on Android/iOS without crashing Vite
      PrivacyScreen.enable().catch(console.error);
      
      CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) lock();
      });
    }

    const timer = setInterval(() => {
      if (!isLocked && Date.now() - lastActivityAt > lockTimeoutMs) lock();
    }, 5000);

    return () => clearInterval(timer);
  }, [isLocked, lastActivityAt, lockTimeoutMs, lock]);

  return (
    <div 
      className="w-full h-screen relative flex flex-col items-center justify-center bg-[#0c0e14] text-[#dde1ec]"
      onClick={recordActivity}
      onTouchStart={recordActivity}
    >
      {isLocked ? (
        <div className="text-center">
          <h1 className="text-2xl font-mono text-[#3a7bd5] mb-4">CrimeGraph Locked</h1>
          <p className="text-[#7880a0]">Authentication module pending...</p>
        </div>
      ) : (
        <div className="text-center">
          <h1 className="text-2xl font-mono text-[#1d9a6c] mb-4">Workspace Active</h1>
          <p className="text-[#7880a0]">Database connected successfully.</p>
        </div>
      )}
    </div>
  );
};

export default App;
EOF

echo "Staging App.tsx..."
git add src/App.tsx

echo "Committing..."
git commit -m "fix: dynamically register PrivacyScreen to bypass Vite rollup error"

echo "Pushing to GitHub..."
git push origin main

echo "Plugin patch deployed!"

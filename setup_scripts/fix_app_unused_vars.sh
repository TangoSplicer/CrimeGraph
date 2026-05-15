#!/bin/bash

echo "Patching App.tsx to remove unused variables..."
cat << 'EOF' > src/App.tsx
import React, { useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { initDatabase } from './capacitor/db';
import { LoginScreen } from './screens/LoginScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { GraphWorkspaceScreen } from './screens/GraphWorkspaceScreen';
import { AddEntityScreen } from './screens/AddEntityScreen';
import { CreateCaseScreen } from './screens/CreateCaseScreen';
import { TimelineScreen } from './screens/TimelineScreen';

const PrivacyScreen = registerPlugin<any>('PrivacyScreen');

const App: React.FC = () => {
  // 🚀 FIXED: Removed the unused lockTimeoutMs and lastActivityAt variables
  const { isLocked, recordActivity } = useAuthStore();

  useEffect(() => {
    initDatabase().catch(console.error);
    
    if (Capacitor.isNativePlatform()) {
      PrivacyScreen.enable().catch(console.error);
      
      CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        const state = useAuthStore.getState();
        if (!isActive) {
          if (!state.isIntentionalBackground) {
            state.lock();
          }
        } else {
          if (state.isIntentionalBackground) {
            state.setIntentionalBackground(false);
            state.recordActivity();
          }
        }
      });
    }

    const timer = setInterval(() => {
      // 🚀 Using getState() here prevents staleness, which is why we didn't need the variables above
      const state = useAuthStore.getState();
      if (!state.isLocked && Date.now() - state.lastActivityAt > state.lockTimeoutMs) {
        state.lock();
      }
    }, 5000);
    
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full h-screen relative flex flex-col items-center justify-center bg-[#0c0e14] text-[#dde1ec]" onClick={recordActivity} onTouchStart={recordActivity}>
      {isLocked ? (
        <LoginScreen />
      ) : (
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<DashboardScreen />} />
            <Route path="/new-case" element={<CreateCaseScreen />} />
            <Route path="/graph" element={<GraphWorkspaceScreen />} />
            <Route path="/add" element={<AddEntityScreen />} />
            <Route path="/timeline" element={<TimelineScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      )}
    </div>
  );
};
export default App;
EOF

echo "Staging files..."
git add src/App.tsx

echo "Committing..."
git commit -m "fix: resolve TS6133 by removing unused variables in App.tsx"

echo "Pushing to GitHub..."
git push origin main

echo "Unused vars patch deployed!"

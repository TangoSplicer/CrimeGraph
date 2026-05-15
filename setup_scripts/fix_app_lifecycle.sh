#!/bin/bash

echo "Patching authStore.ts to include intentional backgrounding..."
cat << 'EOF' > src/stores/authStore.ts
import { create } from 'zustand';

interface User {
  id: string;
  username: string;
  role: string;
  display_name: string;
}

interface AuthState {
  isLocked: boolean;
  currentUser: User | null;
  currentSessionId: string | null;
  lastActivityAt: number;
  lockTimeoutMs: number;
  authMethod: 'password' | 'biometric' | null;
  isIntentionalBackground: boolean; // 🚀 NEW: Prevents locking during native UI prompts
  
  unlock: (method: 'password' | 'biometric', user: User, sessionId: string) => void;
  lock: () => void;
  recordActivity: () => void;
  setIntentionalBackground: (isIntentional: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isLocked: true,
  currentUser: null,
  currentSessionId: null,
  lastActivityAt: Date.now(),
  lockTimeoutMs: 5 * 60 * 1000, // 5 minutes
  authMethod: null,
  isIntentionalBackground: false,

  unlock: (method, user, sessionId) => set({
    isLocked: false,
    authMethod: method,
    currentUser: user,
    currentSessionId: sessionId,
    lastActivityAt: Date.now()
  }),
  
  lock: () => set({
    isLocked: true,
    authMethod: null,
    // We intentionally keep currentUser to allow biometric unlock
  }),
  
  recordActivity: () => set({ lastActivityAt: Date.now() }),

  setIntentionalBackground: (isIntentional) => set({ isIntentionalBackground: isIntentional })
}));
EOF

echo "Patching App.tsx to respect the intentional background flag..."
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
  const { isLocked, recordActivity, lockTimeoutMs, lastActivityAt } = useAuthStore();

  useEffect(() => {
    initDatabase().catch(console.error);
    
    if (Capacitor.isNativePlatform()) {
      PrivacyScreen.enable().catch(console.error);
      
      CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        const state = useAuthStore.getState();
        if (!isActive) {
          // 🚀 FIXED: Only lock if the user didn't intentionally invoke a native OS screen
          if (!state.isIntentionalBackground) {
            state.lock();
          }
        } else {
          // 🚀 FIXED: When app resumes, reset the flag and reset the timeout timer
          if (state.isIntentionalBackground) {
            state.setIntentionalBackground(false);
            state.recordActivity();
          }
        }
      });
    }

    const timer = setInterval(() => {
      const state = useAuthStore.getState();
      if (!state.isLocked && Date.now() - state.lastActivityAt > state.lockTimeoutMs) {
        state.lock();
      }
    }, 5000);
    
    return () => clearInterval(timer);
  }, []); // Removed dependencies to prevent infinite listener attachment loops

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

echo "Patching DashboardScreen.tsx to suspend lock before opening file picker..."
cat << 'EOF' > src/screens/DashboardScreen.tsx
import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCaseStore } from '../stores/caseStore';
import { useAuthStore } from '../stores/authStore';
import { BottomTabBar } from '../components/layout/BottomTabBar';

export const DashboardScreen: React.FC = () => {
  const { cases, loadCases, setActiveCase, archiveCase, restoreCase, importCase } = useCaseStore();
  const { setIntentionalBackground } = useAuthStore();
  const navigate = useNavigate();
  const [view, setView] = useState<'active' | 'archived'>('active');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  const handleCaseSelect = (caseId: string) => {
    setActiveCase(caseId);
    navigate('/graph');
  };

  const handleArchiveToggle = (e: React.MouseEvent, caseId: string, currentStatus: string) => {
    e.stopPropagation();
    if (currentStatus === 'archived') {
      restoreCase(caseId);
    } else {
      if (window.confirm('Archive this operation? It will be moved to the archive tab.')) archiveCase(caseId);
    }
  };

  const handleImportClick = () => {
    // 🚀 FIXED: Tell the security engine we are intentionally leaving the app for a moment
    setIntentionalBackground(true);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        await importCase(content);
        alert('Intelligence package imported successfully!');
      } catch(err) {
        alert('Failed to import file. Ensure it is a valid CrimeGraph JSON package.');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; 
  };

  const displayedCases = cases.filter(c => view === 'active' ? c.status !== 'archived' : c.status === 'archived');
  const getClassificationColor = (c: string) => {
    switch(c) {
      case 'SECRET': return 'bg-[#3d0000] text-[#e74c3c] border-[#e74c3c]';
      case 'OFFICIAL-SENSITIVE': return 'bg-[#3d2a00] text-[#f39c12] border-[#f39c12]';
      default: return 'bg-[#252a3a] text-[#dde1ec] border-[#454d66]';
    }
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#0c0e14]">
      <div className="px-4 py-4 bg-[#14171f] border-b border-[#252a3a] pt-safe flex justify-between items-center">
        <div>
          <h1 className="text-xl font-mono text-[#dde1ec]">Operations</h1>
          <p className="text-[#7880a0] text-xs mt-1">Select a database to load</p>
        </div>
        <div className="flex space-x-2">
          <input type="file" accept=".json" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
          <button onClick={handleImportClick} className="bg-[#1c2030] text-[#dde1ec] border border-[#454d66] text-xs font-bold px-3 py-2 rounded shadow-md hover:bg-[#252a3a]">
            IMPORT
          </button>
          <button onClick={() => navigate('/new-case')} className="bg-[#3a7bd5] text-white text-xs font-bold px-3 py-2 rounded shadow-md hover:bg-[#4a8be5]">
            + NEW
          </button>
        </div>
      </div>
      <div className="flex w-full bg-[#14171f] border-b border-[#252a3a]">
        <button className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${view === 'active' ? 'text-[#3a7bd5] border-b-2 border-[#3a7bd5]' : 'text-[#7880a0]'}`} onClick={() => setView('active')}>Active</button>
        <button className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${view === 'archived' ? 'text-[#3a7bd5] border-b-2 border-[#3a7bd5]' : 'text-[#7880a0]'}`} onClick={() => setView('archived')}>Archived</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {displayedCases.map((c) => (
          <div key={c.id} onClick={() => handleCaseSelect(c.id)} className="bg-[#1c2030] border border-[#252a3a] rounded-lg p-4 active:bg-[#252a3a] transition-colors cursor-pointer relative">
            <div className="flex justify-between items-start mb-2">
              <span className="font-mono text-xs text-[#3a7bd5]">{c.reference_number}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getClassificationColor(c.classification)}`}>{c.classification}</span>
            </div>
            <h2 className="text-lg font-bold text-[#dde1ec] mb-1 pr-16">{c.title}</h2>
            <div className="flex justify-between items-center text-xs text-[#7880a0] mt-4">
              <span className="uppercase">{c.case_type.replace('_', ' ')}</span>
              <span className={`uppercase font-bold ${c.status === 'archived' ? 'text-[#7880a0]' : 'text-[#1d9a6c]'}`}>{c.status}</span>
            </div>
            <button onClick={(e) => handleArchiveToggle(e, c.id, c.status)} className="absolute top-12 right-4 px-3 py-1.5 bg-[#0f1219] border border-[#252a3a] text-[#7880a0] text-[10px] font-bold uppercase rounded hover:border-[#454d66] hover:text-[#dde1ec]">
              {c.status === 'archived' ? 'Restore' : 'Archive'}
            </button>
          </div>
        ))}
        {displayedCases.length === 0 && (
          <div className="flex flex-col items-center justify-center mt-12 space-y-2">
            <p className="text-[#7880a0] text-sm">{view === 'active' ? 'No active operations found.' : 'No archived operations.'}</p>
          </div>
        )}
      </div>
      <BottomTabBar />
    </div>
  );
};
EOF

echo "Patching caseStore.ts to suspend lock before opening Share Sheet..."
sed -i 's/const canShare = await Share.canShare();/useAuthStore.getState().setIntentionalBackground(true);\n      const canShare = await Share.canShare();/g' src/stores/caseStore.ts

echo "Staging files..."
git add src/

echo "Committing..."
git commit -m "fix: suspend auto-lock during intentional native UI overlays (import/export)"

echo "Pushing to GitHub..."
git push origin main

echo "Lifecycle Patch Deployed!"

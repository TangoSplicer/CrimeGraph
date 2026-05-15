#!/bin/bash

echo "Creating components and screens directories..."
mkdir -p src/components/layout src/components/cases src/screens src/stores

echo "Updating db.ts with the cases table schema..."
cat << 'EOF' > src/capacitor/db.ts
import { CapacitorSQLite, SQLiteConnection, CapacitorSQLitePlugin } from '@capacitor-community/sqlite';

const sqlite: CapacitorSQLitePlugin = CapacitorSQLite;
const sqliteConnection = new SQLiteConnection(sqlite);

export async function initDatabase() {
  try {
    const isConn = await sqliteConnection.isConnection('crimegraph_db', false);
    let db;
    if (isConn.result) {
      db = await sqliteConnection.retrieveConnection('crimegraph_db', false);
    } else {
      db = await sqliteConnection.createConnection('crimegraph_db', false, 'no-encryption', 1, false);
    }
    
    await db.open();

    const createTables = `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        display_name TEXT NOT NULL,
        force_unit TEXT,
        biometric_enabled INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        last_login TEXT,
        is_active INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS cases (
        id TEXT PRIMARY KEY,
        reference_number TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        case_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        lead_officer_id TEXT REFERENCES users(id),
        classification TEXT NOT NULL DEFAULT 'OFFICIAL',
        description TEXT,
        date_opened TEXT NOT NULL,
        date_closed TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `;
    await db.execute(createTables);
    
    return db;
  } catch (error) {
    console.error('Database Error:', error);
    throw error;
  }
}
EOF

echo "Creating caseStore.ts..."
cat << 'EOF' > src/stores/caseStore.ts
import { create } from 'zustand';

export interface Case {
  id: string;
  reference_number: string;
  title: string;
  case_type: 'major_crime' | 'missing_person' | 'organised_crime' | 'other';
  status: 'active' | 'pending_review' | 'closed' | 'archived';
  classification: 'OFFICIAL' | 'OFFICIAL-SENSITIVE' | 'SECRET';
  date_opened: string;
  node_count?: number; // Virtual field for UI
}

interface CaseState {
  cases: Case[];
  activeCaseId: string | null;
  loadCases: () => Promise<void>;
  setActiveCase: (id: string) => void;
}

export const useCaseStore = create<CaseState>((set) => ({
  cases: [],
  activeCaseId: null,
  
  // In a real app, this queries SQLite. For now, we mock it to build the UI.
  loadCases: async () => {
    const mockCases: Case[] = [
      {
        id: '1',
        reference_number: 'OP-VANGUARD-26',
        title: 'Operation Vanguard (O/C Network)',
        case_type: 'organised_crime',
        status: 'active',
        classification: 'SECRET',
        date_opened: new Date().toISOString(),
        node_count: 142
      },
      {
        id: '2',
        reference_number: 'MP-882-BR',
        title: 'Misper: John DOE (High Risk)',
        case_type: 'missing_person',
        status: 'pending_review',
        classification: 'OFFICIAL-SENSITIVE',
        date_opened: new Date(Date.now() - 86400000 * 3).toISOString(),
        node_count: 28
      }
    ];
    set({ cases: mockCases });
  },
  
  setActiveCase: (id) => set({ activeCaseId: id }),
}));
EOF

echo "Creating BottomTabBar.tsx..."
cat << 'EOF' > src/components/layout/BottomTabBar.tsx
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export const BottomTabBar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const tabs = [
    { id: 'dashboard', label: 'Cases', path: '/' },
    { id: 'graph', label: 'Graph', path: '/graph' },
    { id: 'add', label: '+', path: '/add', isAction: true },
    { id: 'timeline', label: 'Timeline', path: '/timeline' },
    { id: 'more', label: 'More', path: '/more' },
  ];

  return (
    <div className="flex justify-around items-center w-full h-16 bg-[#14171f] border-t border-[#252a3a] pb-safe">
      {tabs.map((tab) => {
        const isActive = location.pathname === tab.path;
        if (tab.isAction) {
          return (
            <button 
              key={tab.id}
              onClick={() => navigate(tab.path)}
              className="w-12 h-12 bg-[#3a7bd5] text-white rounded-full flex items-center justify-center text-2xl font-bold shadow-lg transform -translate-y-4"
            >
              {tab.label}
            </button>
          );
        }
        return (
          <button 
            key={tab.id}
            onClick={() => navigate(tab.path)}
            className={`flex flex-col items-center justify-center w-full h-full text-xs font-bold uppercase tracking-wider ${isActive ? 'text-[#3a7bd5]' : 'text-[#7880a0]'}`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};
EOF

echo "Creating DashboardScreen.tsx..."
cat << 'EOF' > src/screens/DashboardScreen.tsx
import React, { useEffect } from 'react';
import { useCaseStore } from '../stores/caseStore';
import { BottomTabBar } from '../components/layout/BottomTabBar';

export const DashboardScreen: React.FC = () => {
  const { cases, loadCases } = useCaseStore();

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  const getClassificationColor = (classification: string) => {
    switch(classification) {
      case 'SECRET': return 'bg-[#3d0000] text-[#e74c3c] border-[#e74c3c]';
      case 'OFFICIAL-SENSITIVE': return 'bg-[#3d2a00] text-[#f39c12] border-[#f39c12]';
      default: return 'bg-[#252a3a] text-[#dde1ec] border-[#454d66]';
    }
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#0c0e14]">
      {/* Header */}
      <div className="px-4 py-6 bg-[#14171f] border-b border-[#252a3a] pt-safe">
        <h1 className="text-2xl font-mono text-[#dde1ec]">Active Investigations</h1>
        <p className="text-[#7880a0] text-sm mt-1">Select a case to launch workspace</p>
      </div>

      {/* Case List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {cases.map((c) => (
          <div key={c.id} className="bg-[#1c2030] border border-[#252a3a] rounded-lg p-4 active:bg-[#252a3a] transition-colors">
            <div className="flex justify-between items-start mb-2">
              <span className="font-mono text-xs text-[#3a7bd5]">{c.reference_number}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getClassificationColor(c.classification)}`}>
                {c.classification}
              </span>
            </div>
            <h2 className="text-lg font-bold text-[#dde1ec] mb-1">{c.title}</h2>
            <div className="flex justify-between items-center text-xs text-[#7880a0] mt-4">
              <span>{c.node_count} Nodes</span>
              <span className="uppercase">{c.status.replace('_', ' ')}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Navigation */}
      <BottomTabBar />
    </div>
  );
};
EOF

echo "Updating App.tsx with Router..."
cat << 'EOF' > src/App.tsx
import React, { useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { initDatabase } from './capacitor/db';
import { LoginScreen } from './screens/LoginScreen';
import { DashboardScreen } from './screens/DashboardScreen';

const PrivacyScreen = registerPlugin<any>('PrivacyScreen');

const App: React.FC = () => {
  const { isLocked, recordActivity, lock, lockTimeoutMs, lastActivityAt } = useAuthStore();

  useEffect(() => {
    initDatabase().catch(console.error);

    if (Capacitor.isNativePlatform()) {
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
        <LoginScreen />
      ) : (
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<DashboardScreen />} />
            {/* Fallback routing */}
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
git add src/

echo "Committing..."
git commit -m "feat: implement Case Dashboard, BottomNav, and Router"

echo "Pushing to GitHub..."
git push origin main

echo "Phase 2 deployed!"

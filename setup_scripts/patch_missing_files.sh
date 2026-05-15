#!/bin/bash

echo "Ensuring directories exist..."
mkdir -p src/stores src/capacitor

echo "Recreating authStore.ts..."
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
  lastActivityAt: number;
  lockTimeoutMs: number;
  sessionId: string | null;
  currentUser: User | null;
  recordActivity: () => void;
  lock: () => void;
  unlock: (method: 'password' | 'biometric', user: User, sessionId: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isLocked: true,
  lastActivityAt: Date.now(),
  lockTimeoutMs: 120000,
  sessionId: null,
  currentUser: null,
  recordActivity: () => set({ lastActivityAt: Date.now() }),
  lock: () => set({ isLocked: true }),
  unlock: (method, user, sessionId) => set({ 
    isLocked: false, 
    lastActivityAt: Date.now(),
    currentUser: user,
    sessionId: sessionId
  }),
}));
EOF

echo "Recreating db.ts..."
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

    const createUsersTable = `
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
    `;
    await db.execute(createUsersTable);
    
    return db;
  } catch (error) {
    console.error('Database Error:', error);
    throw error;
  }
}
EOF

echo "Fixing TypeScript declarations for Privacy Screen..."
cat << 'EOF' > src/vite-env.d.ts
/// <reference types="vite/client" />
declare module '@capacitor-community/privacy-screen';
EOF

echo "Force adding files to git..."
git add -f src/stores/authStore.ts src/capacitor/db.ts src/vite-env.d.ts

echo "Committing and pushing..."
git commit -m "fix: add missing authStore, db, and mock privacy-screen typings"
git push origin main

echo "Patch complete!"

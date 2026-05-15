#!/bin/bash

echo "Patching db.ts to safely handle SQLite initialization..."
cat << 'EOF' > src/capacitor/db.ts
import { CapacitorSQLite, SQLiteConnection, CapacitorSQLitePlugin } from '@capacitor-community/sqlite';

const sqlite: CapacitorSQLitePlugin = CapacitorSQLite;
const sqliteConnection = new SQLiteConnection(sqlite);
let dbInstance: any = null;

export async function getDb() {
  if (dbInstance) return dbInstance;
  return await initDatabase();
}

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
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL, display_name TEXT NOT NULL, force_unit TEXT, biometric_enabled INTEGER DEFAULT 0, created_at TEXT NOT NULL, last_login TEXT, is_active INTEGER DEFAULT 1);
      CREATE TABLE IF NOT EXISTS cases (id TEXT PRIMARY KEY, reference_number TEXT UNIQUE NOT NULL, title TEXT NOT NULL, case_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', lead_officer_id TEXT, classification TEXT NOT NULL DEFAULT 'OFFICIAL', description TEXT, date_opened TEXT NOT NULL, date_closed TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS nodes (id TEXT PRIMARY KEY, case_id TEXT NOT NULL, label TEXT NOT NULL, type TEXT NOT NULL, confidence INTEGER DEFAULT 3, created_at TEXT NOT NULL, FOREIGN KEY(case_id) REFERENCES cases(id));
      CREATE TABLE IF NOT EXISTS edges (id TEXT PRIMARY KEY, case_id TEXT NOT NULL, source TEXT NOT NULL, target TEXT NOT NULL, label TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(case_id) REFERENCES cases(id), FOREIGN KEY(source) REFERENCES nodes(id), FOREIGN KEY(target) REFERENCES nodes(id));
      CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, user_id TEXT NOT NULL, action TEXT NOT NULL, target_id TEXT, details TEXT);
    `;
    await db.execute(createTables);
    
    // Safely execute PRAGMA using run instead of execute to prevent initialization crashes
    try {
       await db.run('PRAGMA secure_delete = ON;');
    } catch (pragmaError) {
       console.warn('Forensic wiping PRAGMA not supported on this architecture, bypassing.');
    }

    dbInstance = db;
    return db;
  } catch (error) {
    console.error('Database Error:', error);
    throw error;
  }
}
EOF

echo "Patching caseStore.ts to pass raw errors up to the UI..."
sed -i "s/throw new Error('Database rejected creation. Check uniqueness.');/throw e;/g" src/stores/caseStore.ts

echo "Patching CreateCaseScreen.tsx to display the true error..."
cat << 'EOF' > src/screens/CreateCaseScreen.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCaseStore } from '../stores/caseStore';
import { BottomTabBar } from '../components/layout/BottomTabBar';

export const CreateCaseScreen: React.FC = () => {
  const navigate = useNavigate();
  const { addCase } = useCaseStore();
  const [title, setTitle] = useState('');
  const [refNumber, setRefNumber] = useState('');
  const [caseType, setCaseType] = useState('major_crime');
  const [classification, setClassification] = useState('OFFICIAL');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !refNumber.trim()) return;
    
    try {
      await addCase(title.trim(), refNumber.trim().toUpperCase(), caseType, classification);
      navigate('/');
    } catch (error: any) {
      // 🚀 FIXED: We now show the actual raw database error so we know exactly what went wrong.
      const errorMessage = error?.message || JSON.stringify(error) || "Unknown SQLite Error";
      alert(`CRITICAL ERROR:\n\n${errorMessage}\n\nPlease check your inputs or application state.`);
    }
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#0c0e14]">
      <div className="px-4 py-4 bg-[#14171f] border-b border-[#252a3a] pt-safe flex items-center justify-between">
        <div>
          <h1 className="text-xl font-mono text-[#dde1ec]">New Operation</h1>
          <p className="text-[#7880a0] text-xs">Initialize a blank workspace</p>
        </div>
        <button onClick={() => navigate('/')} className="text-[#7880a0] font-bold text-sm">Cancel</button>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div>
            <label className="block text-xs font-bold text-[#7880a0] mb-2 uppercase">Reference No. / URN</label>
            <input 
              type="text" className="w-full px-3 py-3 bg-[#0f1219] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5] uppercase"
              placeholder="e.g. OP-VANGUARD-26" value={refNumber} onChange={(e) => setRefNumber(e.target.value)} required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#7880a0] mb-2 uppercase">Operation Title</label>
            <input 
              type="text" className="w-full px-3 py-3 bg-[#0f1219] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5]"
              placeholder="e.g. Operation Vanguard" value={title} onChange={(e) => setTitle(e.target.value)} required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#7880a0] mb-2 uppercase">Type</label>
            <select 
              value={caseType} onChange={(e) => setCaseType(e.target.value)}
              className="w-full px-3 py-3 bg-[#0f1219] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5]"
            >
              <option value="major_crime">Major Crime</option>
              <option value="missing_person">Missing Person</option>
              <option value="organised_crime">Organised Crime</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#7880a0] mb-2 uppercase">Classification</label>
            <select 
              value={classification} onChange={(e) => setClassification(e.target.value)}
              className="w-full px-3 py-3 bg-[#0f1219] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5]"
            >
              <option value="OFFICIAL">OFFICIAL</option>
              <option value="OFFICIAL-SENSITIVE">OFFICIAL-SENSITIVE</option>
              <option value="SECRET">SECRET</option>
            </select>
          </div>

          <button type="submit" className="w-full py-3 bg-[#3a7bd5] hover:bg-[#4a8be5] text-white font-bold rounded shadow-lg transition-colors mt-8">
            Create Database
          </button>
        </form>
      </div>
      <BottomTabBar />
    </div>
  );
};
EOF

echo "Staging files..."
git add src/

echo "Committing..."
git commit -m "fix: safely isolate PRAGMA execution and surface raw SQLite errors"

echo "Pushing to GitHub..."
git push origin main

echo "Error Unmasking Patch Deployed!"

#!/bin/bash

echo "Patching caseStore.ts for Import logic and custom Reference Numbers..."
cat << 'EOF' > src/stores/caseStore.ts
import { create } from 'zustand';
import { getDb } from '../capacitor/db';
import { Share } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { useAuthStore } from './authStore';

export interface Case {
  id: string; reference_number: string; title: string;
  case_type: string; status: string; classification: string; date_opened: string; node_count?: number;
}

export interface GraphElement {
  data: { 
    id: string; label: string; type?: string; source?: string; target?: string; 
    confidence?: number; created_at?: string; 
  };
}

interface CaseState {
  cases: Case[]; activeCaseId: string | null; graphElements: GraphElement[];
  selectedNodeId: string | null; connectingFromId: string | null;
  
  loadCases: () => Promise<void>; setActiveCase: (id: string) => void;
  // 🚀 UPDATED: Now accepts a custom reference number
  addCase: (title: string, refNumber: string, caseType: string, classification: string) => Promise<void>;
  archiveCase: (caseId: string) => Promise<void>; restoreCase: (caseId: string) => Promise<void>;
  loadGraphElements: (caseId: string) => Promise<void>;
  addNode: (nodeType: string, label: string, confidence: number) => Promise<void>;
  addEdge: (sourceId: string, targetId: string, relationshipType: string) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
  setSelectedNodeId: (id: string | null) => void; setConnectingFromId: (id: string | null) => void;
  exportActiveCase: () => Promise<void>;
  // 🚀 NEW: Import function
  importCase: (jsonData: string) => Promise<void>;
}

const logAudit = async (action: string, targetId: string, details: string) => {
  try {
    const db = await getDb();
    const userId = useAuthStore.getState().currentUser?.id || 'SYSTEM_UNKNOWN';
    const id = `audit_${Date.now()}`;
    await db.run(
      'INSERT INTO audit_logs (id, timestamp, user_id, action, target_id, details) VALUES (?, ?, ?, ?, ?, ?)',
      [id, new Date().toISOString(), userId, action, targetId, details]
    );
  } catch (e) {
    console.error('Audit log failed', e);
  }
};

export const useCaseStore = create<CaseState>((set, get) => ({
  cases: [], activeCaseId: null, graphElements: [], selectedNodeId: null, connectingFromId: null,
  
  loadCases: async () => {
    try {
      const db = await getDb();
      const res = await db.query('SELECT * FROM cases ORDER BY date_opened DESC');
      set({ cases: res.values || [] });
    } catch (e) { console.error('Failed to load cases', e); }
  },

  setActiveCase: (id) => { set({ activeCaseId: id }); get().loadGraphElements(id); },

  // 🚀 UPDATED: Uses user's refNumber
  addCase: async (title, refNumber, caseType, classification) => {
    const id = `case_${Date.now()}`;
    const now = new Date().toISOString();
    try {
      const db = await getDb();
      await db.run(
        'INSERT INTO cases (id, reference_number, title, case_type, status, classification, date_opened, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, refNumber, title, caseType, 'active', classification, now, now, now]
      );
      await logAudit('CREATE_CASE', id, `Created ${refNumber}: ${title}`);
      get().loadCases();
    } catch (e) { console.error(e); }
  },

  archiveCase: async (caseId) => {
    try {
      const db = await getDb();
      await db.run("UPDATE cases SET status = 'archived', updated_at = ? WHERE id = ?", [new Date().toISOString(), caseId]);
      await logAudit('ARCHIVE_CASE', caseId, 'Case moved to archive');
      get().loadCases();
    } catch (e) { console.error(e); }
  },

  restoreCase: async (caseId) => {
    try {
      const db = await getDb();
      await db.run("UPDATE cases SET status = 'active', updated_at = ? WHERE id = ?", [new Date().toISOString(), caseId]);
      await logAudit('RESTORE_CASE', caseId, 'Case restored from archive');
      get().loadCases();
    } catch (e) { console.error(e); }
  },

  loadGraphElements: async (caseId) => {
    try {
      const db = await getDb();
      const nodesRes = await db.query('SELECT * FROM nodes WHERE case_id = ? ORDER BY created_at ASC', [caseId]);
      const edgesRes = await db.query('SELECT * FROM edges WHERE case_id = ? ORDER BY created_at ASC', [caseId]);
      
      const elements: GraphElement[] = [];
      if (nodesRes.values) {
        nodesRes.values.forEach((n: any) => elements.push({
          data: { id: n.id, label: n.label, type: n.type, confidence: n.confidence, created_at: n.created_at }
        }));
      }
      if (edgesRes.values) {
        edgesRes.values.forEach((e: any) => elements.push({
          data: { id: e.id, source: e.source, target: e.target, label: e.label, created_at: e.created_at }
        }));
      }
      set({ graphElements: elements });
    } catch (e) { console.error(e); }
  },

  addNode: async (nodeType, label, confidence) => {
    const { activeCaseId, graphElements } = get();
    if (!activeCaseId) return;
    const id = `node_${Date.now()}`;
    const now = new Date().toISOString();
    try {
      const db = await getDb();
      await db.run('INSERT INTO nodes (id, case_id, label, type, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, activeCaseId, label, nodeType, confidence, now]);
      await logAudit('ADD_NODE', id, `Added ${nodeType}: ${label} (Conf: ${confidence})`);
      set({ graphElements: [...graphElements, { data: { id, label, type: nodeType, confidence, created_at: now } }] });
    } catch (e) { console.error(e); }
  },

  addEdge: async (sourceId, targetId, relationshipType) => {
    const { activeCaseId, graphElements } = get();
    if (!activeCaseId || sourceId === targetId) return;
    if (graphElements.some(e => e.data.source === sourceId && e.data.target === targetId)) return;
    const id = `edge_${Date.now()}`;
    const now = new Date().toISOString();
    try {
      const db = await getDb();
      await db.run('INSERT INTO edges (id, case_id, source, target, label, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, activeCaseId, sourceId, targetId, relationshipType, now]);
      await logAudit('ADD_EDGE', id, `Connected ${sourceId} to ${targetId} via ${relationshipType}`);
      set({ graphElements: [...graphElements, { data: { id, source: sourceId, target: targetId, label: relationshipType, created_at: now } }] });
    } catch (e) { console.error(e); }
  },

  deleteNode: async (nodeId) => {
    const { graphElements } = get();
    try {
      const db = await getDb();
      await db.run('DELETE FROM edges WHERE source = ? OR target = ?', [nodeId, nodeId]);
      await db.run('DELETE FROM nodes WHERE id = ?', [nodeId]);
      await logAudit('DELETE_NODE', nodeId, 'Node and associated edges destroyed');
      const remainingElements = graphElements.filter(e => e.data.id !== nodeId && e.data.source !== nodeId && e.data.target !== nodeId);
      set({ graphElements: remainingElements, selectedNodeId: null });
    } catch (e) { console.error(e); }
  },

  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  setConnectingFromId: (id) => set({ connectingFromId: id }),

  exportActiveCase: async () => {
    const { activeCaseId, cases, graphElements } = get();
    if (!activeCaseId) return;
    const activeCase = cases.find(c => c.id === activeCaseId);
    if (!activeCase) return;

    await logAudit('EXPORT_PACKAGE', activeCaseId, 'Exported intelligence package to external sheet');

    const exportData = {
      metadata: {
        reference: activeCase.reference_number,
        title: activeCase.title,
        classification: activeCase.classification,
        exported_at: new Date().toISOString(),
        system: "CrimeGraph v1.0"
      },
      intelligence_nodes: graphElements.filter(e => !e.data.source),
      relationships: graphElements.filter(e => e.data.source)
    };

    try {
      const jsonStr = JSON.stringify(exportData, null, 2);
      const fileName = `intelligence_pkg_${activeCase.reference_number}.json`;

      const fileResult = await Filesystem.writeFile({
        path: fileName,
        data: jsonStr,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });

      const canShare = await Share.canShare();
      if (canShare.value) {
        await Share.share({
          title: `Intelligence Package: ${activeCase.reference_number}`,
          text: `Encrypted Intelligence Data for ${activeCase.title}`,
          url: fileResult.uri,
          dialogTitle: 'Export Intelligence Package',
        });
      } else {
        alert("Device does not support native sharing.");
      }
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export case data. See logs for details.');
    }
  },

  // 🚀 NEW: Import Engine
  importCase: async (jsonData: string) => {
    try {
      const data = JSON.parse(jsonData);
      if (!data.metadata || !data.intelligence_nodes) throw new Error("Invalid format");

      const db = await getDb();
      const newCaseId = `case_${Date.now()}`;
      const now = new Date().toISOString();

      // Append (Imported) so you know it's a clone
      const refNumber = `${data.metadata.reference}-IMP`;
      const title = `${data.metadata.title} (Imported)`;

      await db.run(
        'INSERT INTO cases (id, reference_number, title, case_type, status, classification, date_opened, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [newCaseId, refNumber, title, 'other', 'active', data.metadata.classification || 'OFFICIAL', now, now, now]
      );

      // Create an ID mapping dictionary so we don't accidentally overwrite existing nodes
      const idMap = new Map<string, string>();

      for (const node of data.intelligence_nodes) {
        const newNodeId = `node_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;
        idMap.set(node.data.id, newNodeId);
        await db.run(
          'INSERT INTO nodes (id, case_id, label, type, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [newNodeId, newCaseId, node.data.label, node.data.type, node.data.confidence, node.data.created_at || now]
        );
      }

      for (const edge of data.relationships) {
        const newEdgeId = `edge_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;
        const newSource = idMap.get(edge.data.source);
        const newTarget = idMap.get(edge.data.target);
        if (newSource && newTarget) {
          await db.run(
            'INSERT INTO edges (id, case_id, source, target, label, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [newEdgeId, newCaseId, newSource, newTarget, edge.data.label, edge.data.created_at || now]
          );
        }
      }

      get().loadCases();
      await logAudit('IMPORT_CASE', newCaseId, `Imported package: ${title}`);
    } catch (e) {
      console.error('Import failed', e);
      throw e;
    }
  }
}));
EOF

echo "Patching CreateCaseScreen.tsx with URN Input..."
cat << 'EOF' > src/screens/CreateCaseScreen.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCaseStore } from '../stores/caseStore';
import { BottomTabBar } from '../components/layout/BottomTabBar';

export const CreateCaseScreen: React.FC = () => {
  const navigate = useNavigate();
  const { addCase } = useCaseStore();
  const [title, setTitle] = useState('');
  const [refNumber, setRefNumber] = useState(''); // 🚀 NEW: State for custom URN
  const [caseType, setCaseType] = useState('major_crime');
  const [classification, setClassification] = useState('OFFICIAL');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !refNumber.trim()) return;
    await addCase(title.trim(), refNumber.trim().toUpperCase(), caseType, classification);
    navigate('/');
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
          
          {/* 🚀 NEW: Input field for URN/Reference Number */}
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

echo "Patching DashboardScreen.tsx to include the File Import button..."
cat << 'EOF' > src/screens/DashboardScreen.tsx
import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCaseStore } from '../stores/caseStore';
import { BottomTabBar } from '../components/layout/BottomTabBar';

export const DashboardScreen: React.FC = () => {
  const { cases, loadCases, setActiveCase, archiveCase, restoreCase, importCase } = useCaseStore();
  const navigate = useNavigate();
  const [view, setView] = useState<'active' | 'archived'>('active');
  const fileInputRef = useRef<HTMLInputElement>(null); // 🚀 NEW: Reference to hidden file input

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
      if (window.confirm('Archive this operation? It will be moved to the archive tab.')) {
        archiveCase(caseId);
      }
    }
  };

  // 🚀 NEW: Handle the file once selected by the user
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
    e.target.value = ''; // Reset input so same file can be selected again
  };

  const displayedCases = cases.filter(c => view === 'active' ? c.status !== 'archived' : c.status === 'archived');

  const getClassificationColor = (classification: string) => {
    switch(classification) {
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
          {/* 🚀 NEW: Import UI Button & Hidden Input */}
          <input 
            type="file" 
            accept=".json" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="bg-[#1c2030] text-[#dde1ec] border border-[#454d66] text-xs font-bold px-3 py-2 rounded shadow-md hover:bg-[#252a3a]"
          >
            IMPORT
          </button>
          <button 
            onClick={() => navigate('/new-case')}
            className="bg-[#3a7bd5] text-white text-xs font-bold px-3 py-2 rounded shadow-md hover:bg-[#4a8be5]"
          >
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

echo "Staging files..."
git add src/

echo "Committing..."
git commit -m "feat: add custom URN input and JSON intelligence package importing"

echo "Pushing to GitHub..."
git push origin main

echo "Import feature deployed!"

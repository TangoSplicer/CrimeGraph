#!/bin/bash

echo "Patching DashboardScreen.tsx to fix the JSX comment block..."
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
    setIntentionalBackground(true);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.enc') && !fileName.endsWith('.json')) {
      alert('Invalid file selected. Please select a valid CrimeGraph .enc or .json package.');
      e.target.value = ''; 
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        await importCase(content);
        alert('Intelligence package imported successfully!');
      } catch(err) {
        alert('Failed to import file. Ensure it is a valid encrypted CrimeGraph package and the password is correct.');
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
          {/* 🚀 FIXED: Universal accept parameter forces Google Drive to allow custom extensions */}
          <input type="file" accept="*/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
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

echo "Staging files..."
git add src/screens/DashboardScreen.tsx

echo "Committing..."
git commit -m "fix: resolve JSX block comment syntax error breaking the build"

echo "Pushing to GitHub..."
git push origin main

echo "Syntax Patch Deployed!"

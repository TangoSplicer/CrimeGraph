import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCaseStore } from '../stores/caseStore';
import { BottomTabBar } from '../components/layout/BottomTabBar';

export const DashboardScreen: React.FC = () => {
  const { cases, loadCases, setActiveCase, archiveCase, restoreCase } = useCaseStore();
  const navigate = useNavigate();
  const [view, setView] = useState<'active' | 'archived'>('active');

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  const handleCaseSelect = (caseId: string) => {
    setActiveCase(caseId);
    navigate('/graph');
  };

  const handleArchiveToggle = (e: React.MouseEvent, caseId: string, currentStatus: string) => {
    e.stopPropagation(); // Prevent the click from launching the graph
    if (currentStatus === 'archived') {
      restoreCase(caseId);
    } else {
      if (window.confirm('Archive this operation? It will be moved to the archive tab.')) {
        archiveCase(caseId);
      }
    }
  };

  const displayedCases = cases.filter(c => 
    view === 'active' ? c.status !== 'archived' : c.status === 'archived'
  );

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
        <button 
          onClick={() => navigate('/new-case')}
          className="bg-[#3a7bd5] text-white text-xs font-bold px-3 py-2 rounded shadow-md hover:bg-[#4a8be5]"
        >
          + NEW
        </button>
      </div>

      {/* Tabs */}
      <div className="flex w-full bg-[#14171f] border-b border-[#252a3a]">
        <button 
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${view === 'active' ? 'text-[#3a7bd5] border-b-2 border-[#3a7bd5]' : 'text-[#7880a0]'}`}
          onClick={() => setView('active')}
        >
          Active
        </button>
        <button 
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${view === 'archived' ? 'text-[#3a7bd5] border-b-2 border-[#3a7bd5]' : 'text-[#7880a0]'}`}
          onClick={() => setView('archived')}
        >
          Archived
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {displayedCases.map((c) => (
          <div 
            key={c.id} 
            onClick={() => handleCaseSelect(c.id)}
            className="bg-[#1c2030] border border-[#252a3a] rounded-lg p-4 active:bg-[#252a3a] transition-colors cursor-pointer relative"
          >
            <div className="flex justify-between items-start mb-2">
              <span className="font-mono text-xs text-[#3a7bd5]">{c.reference_number}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getClassificationColor(c.classification)}`}>
                {c.classification}
              </span>
            </div>
            
            <h2 className="text-lg font-bold text-[#dde1ec] mb-1 pr-16">{c.title}</h2>
            
            <div className="flex justify-between items-center text-xs text-[#7880a0] mt-4">
              <span className="uppercase">{c.case_type.replace('_', ' ')}</span>
              <span className={`uppercase font-bold ${c.status === 'archived' ? 'text-[#7880a0]' : 'text-[#1d9a6c]'}`}>
                {c.status}
              </span>
            </div>

            {/* Quick Action Button */}
            <button 
              onClick={(e) => handleArchiveToggle(e, c.id, c.status)}
              className="absolute top-12 right-4 px-3 py-1.5 bg-[#0f1219] border border-[#252a3a] text-[#7880a0] text-[10px] font-bold uppercase rounded hover:border-[#454d66] hover:text-[#dde1ec]"
            >
              {c.status === 'archived' ? 'Restore' : 'Archive'}
            </button>
          </div>
        ))}

        {displayedCases.length === 0 && (
          <div className="flex flex-col items-center justify-center mt-12 space-y-2">
            <p className="text-[#7880a0] text-sm">
              {view === 'active' ? 'No active operations found.' : 'No archived operations.'}
            </p>
          </div>
        )}
      </div>

      <BottomTabBar />
    </div>
  );
};

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCaseStore } from '../stores/caseStore';
import { BottomTabBar } from '../components/layout/BottomTabBar';

export const DashboardScreen: React.FC = () => {
  const { cases, loadCases, setActiveCase } = useCaseStore();
  const navigate = useNavigate();

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  const handleCaseSelect = (caseId: string) => {
    setActiveCase(caseId);
    navigate('/graph');
  };

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
          <h1 className="text-xl font-mono text-[#dde1ec]">Active Investigations</h1>
          <p className="text-[#7880a0] text-xs mt-1">Select a database to load</p>
        </div>
        <button 
          onClick={() => navigate('/new-case')}
          className="bg-[#3a7bd5] text-white text-xs font-bold px-3 py-2 rounded shadow-md"
        >
          + NEW
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {cases.map((c) => (
          <div 
            key={c.id} 
            onClick={() => handleCaseSelect(c.id)}
            className="bg-[#1c2030] border border-[#252a3a] rounded-lg p-4 active:bg-[#252a3a] transition-colors cursor-pointer"
          >
            <div className="flex justify-between items-start mb-2">
              <span className="font-mono text-xs text-[#3a7bd5]">{c.reference_number}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getClassificationColor(c.classification)}`}>
                {c.classification}
              </span>
            </div>
            <h2 className="text-lg font-bold text-[#dde1ec] mb-1">{c.title}</h2>
            <div className="flex justify-between items-center text-xs text-[#7880a0] mt-4">
              <span className="uppercase">{c.case_type.replace('_', ' ')}</span>
              <span className="uppercase text-[#1d9a6c]">{c.status}</span>
            </div>
          </div>
        ))}
        {cases.length === 0 && (
          <p className="text-center text-[#7880a0] mt-10 text-sm">No active operations. Create one to begin.</p>
        )}
      </div>

      <BottomTabBar />
    </div>
  );
};

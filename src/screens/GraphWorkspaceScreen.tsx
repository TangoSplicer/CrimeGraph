import React from 'react';
import { GraphCanvas } from '../components/graph/GraphCanvas';
import { BottomTabBar } from '../components/layout/BottomTabBar';
import { useCaseStore } from '../stores/caseStore';

export const GraphWorkspaceScreen: React.FC = () => {
  const { activeCaseId, cases } = useCaseStore();
  
  // Find active case details, fallback to placeholder if none selected
  const activeCase = cases.find(c => c.id === activeCaseId) || { reference_number: 'NO CASE SELECTED', classification: 'OFFICIAL' };

  return (
    <div className="flex flex-col w-full h-full bg-[#0c0e14]">
      {/* Classification & Case Header */}
      <div className="px-4 py-3 bg-[#14171f] border-b border-[#252a3a] pt-safe z-10 flex justify-between items-center shadow-md">
        <div>
          <h2 className="text-sm font-mono text-[#3a7bd5]">{activeCase.reference_number}</h2>
          <p className="text-xs text-[#7880a0]">Graph Workspace</p>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#454d66] text-[#dde1ec] bg-[#252a3a]">
          {activeCase.classification}
        </span>
      </div>

      {/* The Interactive Graph Canvas */}
      <div className="flex-1 relative overflow-hidden">
        <GraphCanvas />
      </div>

      <BottomTabBar />
    </div>
  );
};

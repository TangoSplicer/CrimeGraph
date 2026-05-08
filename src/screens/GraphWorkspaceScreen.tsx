import React from 'react';
import { GraphCanvas } from '../components/graph/GraphCanvas';
import { BottomTabBar } from '../components/layout/BottomTabBar';
import { BottomSheet } from '../components/shared/BottomSheet';
import { useCaseStore } from '../stores/caseStore';

export const GraphWorkspaceScreen: React.FC = () => {
  const { 
    graphElements, 
    selectedNodeId, 
    setSelectedNodeId, 
    connectingFromId, 
    setConnectingFromId 
  } = useCaseStore();
  
  const selectedNode = graphElements.find(e => e.data.id === selectedNodeId);

  const handleStartConnection = () => {
    if (selectedNodeId) {
      setConnectingFromId(selectedNodeId);
      setSelectedNodeId(null); // Close the sheet to let them tap the target
    }
  };

  const handleCancelConnection = () => {
    setConnectingFromId(null);
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#0c0e14] relative">
      <div className="px-4 py-3 bg-[#14171f] border-b border-[#252a3a] pt-safe z-10 flex justify-between items-center shadow-md">
        <div>
          <h2 className="text-sm font-mono text-[#3a7bd5]">OP-VANGUARD-26</h2>
          <p className="text-xs text-[#7880a0]">Graph Workspace</p>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#454d66] text-[#dde1ec] bg-[#252a3a]">
          SECRET
        </span>
      </div>

      {/* Target Mode Banner */}
      {connectingFromId && (
        <div className="absolute top-[70px] left-4 right-4 z-20 bg-[#3a7bd5] text-white p-3 rounded shadow-lg flex justify-between items-center">
          <span className="text-xs font-bold uppercase tracking-wide animate-pulse">
            Tap target node to connect...
          </span>
          <button 
            onClick={handleCancelConnection}
            className="text-white border border-white/30 px-3 py-1 rounded text-xs hover:bg-white/10"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="flex-1 relative overflow-hidden">
        <GraphCanvas />
      </div>

      {/* The Slide-Up Detail Sheet */}
      <BottomSheet 
        isOpen={!!selectedNodeId && !connectingFromId} 
        onClose={() => setSelectedNodeId(null)}
        title={selectedNode?.data.label || 'Node Details'}
      >
        {selectedNode && (
          <div className="space-y-6">
            <div className="flex justify-between items-center border-b border-[#252a3a] pb-4">
              <span className="text-[#7880a0] text-xs uppercase font-bold">Type</span>
              <span className="text-[#dde1ec] capitalize">{selectedNode.data.type?.replace('_', ' ')}</span>
            </div>
            
            <div className="flex justify-between items-center border-b border-[#252a3a] pb-4">
              <span className="text-[#7880a0] text-xs uppercase font-bold">Confidence</span>
              <span className="text-[#1d9a6c] font-mono">★★★☆☆</span>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4">
              <button 
                onClick={handleStartConnection}
                className="py-3 bg-[#3a7bd5] text-white font-bold rounded shadow-md hover:bg-[#4a8be5] transition-colors"
              >
                Draw Connection
              </button>
              <button 
                className="py-3 border border-[#c0392b] text-[#c0392b] font-bold rounded hover:bg-[#c0392b] hover:text-white transition-colors"
                onClick={() => alert('Delete function pending Phase 6')}
              >
                Delete Node
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      <BottomTabBar />
    </div>
  );
};

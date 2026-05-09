import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraphCanvas } from '../components/graph/GraphCanvas';
import { BottomTabBar } from '../components/layout/BottomTabBar';
import { BottomSheet } from '../components/shared/BottomSheet';
import { useCaseStore } from '../stores/caseStore';

export const GraphWorkspaceScreen: React.FC = () => {
  const navigate = useNavigate();
  const { 
    graphElements, selectedNodeId, setSelectedNodeId, 
    connectingFromId, setConnectingFromId, deleteNode, 
    activeCaseId, cases
  } = useCaseStore();
  
  const activeCase = cases.find(c => c.id === activeCaseId);

  // If no case is selected, redirect back to Dashboard
  useEffect(() => {
    if (!activeCaseId) {
      navigate('/');
    }
  }, [activeCaseId, navigate]);

  const selectedNode = graphElements.find(e => e.data.id === selectedNodeId);

  const handleStartConnection = () => {
    if (selectedNodeId) {
      setConnectingFromId(selectedNodeId);
      setSelectedNodeId(null);
    }
  };

  const handleDeleteNode = () => {
    if (selectedNodeId && window.confirm('Permanently delete this intelligence node and connections?')) {
      deleteNode(selectedNodeId);
    }
  };

  const renderStars = (rating: number = 3) => '★'.repeat(rating) + '☆'.repeat(5 - rating);

  if (!activeCase) return null;

  return (
    <div className="flex flex-col w-full h-full bg-[#0c0e14] relative">
      <div className="px-4 py-3 bg-[#14171f] border-b border-[#252a3a] pt-safe z-10 flex justify-between items-center shadow-md">
        <div>
          {/* 🚀 FIXED: Dynamic Title Injection */}
          <h2 className="text-sm font-mono text-[#3a7bd5]">{activeCase.reference_number}</h2>
          <p className="text-[10px] text-[#7880a0] truncate w-48">{activeCase.title}</p>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#454d66] text-[#dde1ec] bg-[#252a3a]">
          {activeCase.classification}
        </span>
      </div>

      {connectingFromId && (
        <div className="absolute top-[70px] left-4 right-4 z-20 bg-[#3a7bd5] text-white p-3 rounded shadow-lg flex justify-between items-center">
          <span className="text-xs font-bold uppercase tracking-wide animate-pulse">Tap target node...</span>
          <button onClick={() => setConnectingFromId(null)} className="text-white border border-white/30 px-3 py-1 rounded text-xs">Cancel</button>
        </div>
      )}

      <div className="flex-1 relative overflow-hidden">
        <GraphCanvas />
      </div>

      <BottomSheet isOpen={!!selectedNodeId && !connectingFromId} onClose={() => setSelectedNodeId(null)} title={selectedNode?.data.label || 'Node Details'}>
        {selectedNode && (
          <div className="space-y-6">
            <div className="flex justify-between items-center border-b border-[#252a3a] pb-4">
              <span className="text-[#7880a0] text-xs uppercase font-bold">Type</span>
              <span className="text-[#dde1ec] capitalize">{selectedNode.data.type?.replace('_', ' ')}</span>
            </div>
            <div className="flex justify-between items-center border-b border-[#252a3a] pb-4">
              <span className="text-[#7880a0] text-xs uppercase font-bold">Confidence</span>
              <span className="text-[#1d9a6c] font-mono text-lg">{renderStars(selectedNode.data.confidence)}</span>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4">
              <button onClick={handleStartConnection} className="py-3 bg-[#3a7bd5] text-white font-bold rounded">Draw Connection</button>
              <button onClick={handleDeleteNode} className="py-3 border border-[#c0392b] text-[#c0392b] font-bold rounded">Delete Node</button>
            </div>
          </div>
        )}
      </BottomSheet>
      <BottomTabBar />
    </div>
  );
};

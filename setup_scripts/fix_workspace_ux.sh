#!/bin/bash

echo "Upgrading BottomSheet.tsx for dynamic height and scrolling..."
cat << 'EOF' > src/components/shared/BottomSheet.tsx
import React from 'react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({ isOpen, onClose, title, children }) => {
  return (
    <>
      {/* Darkened Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 transition-opacity" 
          onClick={onClose}
        />
      )}
      
      {/* Sheet Container */}
      <div 
        className={`fixed inset-x-0 bottom-0 z-50 bg-[#14171f] rounded-t-2xl transform transition-transform duration-300 ease-in-out border-t border-[#252a3a] flex flex-col max-h-[85vh] ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-[#252a3a] shrink-0">
          <h3 className="font-bold text-[#dde1ec] text-lg">{title}</h3>
          <button 
            onClick={onClose} 
            className="text-[#7880a0] text-2xl leading-none hover:text-[#dde1ec] p-2 -mr-2"
          >
            &times;
          </button>
        </div>
        
        {/* 🚀 FIXED: Content Area is now scrollable with extra bottom padding for mobile safe areas */}
        <div className="p-4 overflow-y-auto pb-safe-offset-12 pb-12">
          {children}
        </div>
      </div>
    </>
  );
};
EOF

echo "Patching GraphWorkspaceScreen.tsx to restore the Add Node button..."
cat << 'EOF' > src/screens/GraphWorkspaceScreen.tsx
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraphCanvas } from '../components/graph/GraphCanvas';
import { BottomTabBar } from '../components/layout/BottomTabBar';
import { BottomSheet } from '../components/shared/BottomSheet';
import { useCaseStore } from '../stores/caseStore';

export const GraphWorkspaceScreen: React.FC = () => {
  const navigate = useNavigate();
  const { 
    graphElements, 
    selectedNodeId, setSelectedNodeId, 
    selectedEdgeId, setSelectedEdgeId,
    connectingFromId, setConnectingFromId, 
    deleteNode, deleteEdge,
    activeCaseId, cases, exportActiveCase
  } = useCaseStore();
  
  const activeCase = cases.find(c => c.id === activeCaseId);

  useEffect(() => {
    if (!activeCaseId) navigate('/');
  }, [activeCaseId, navigate]);

  const selectedNode = graphElements.find(e => e.data.id === selectedNodeId);
  const selectedEdge = graphElements.find(e => e.data.id === selectedEdgeId);

  const getLabelForNode = (id: string) => {
    return graphElements.find(e => e.data.id === id)?.data.label || 'Unknown';
  };

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

  const handleDeleteEdge = () => {
    if (selectedEdgeId && window.confirm('Sever this relationship link? Both nodes will remain intact.')) {
      deleteEdge(selectedEdgeId);
    }
  };

  const renderStars = (rating: number = 3) => '★'.repeat(rating) + '☆'.repeat(5 - rating);

  if (!activeCase) return null;

  return (
    <div className="flex flex-col w-full h-full bg-[#0c0e14] relative">
      <div className="px-4 py-3 bg-[#14171f] border-b border-[#252a3a] pt-safe z-10 flex justify-between items-center shadow-md">
        <div>
          <h2 className="text-sm font-mono text-[#3a7bd5]">{activeCase.reference_number}</h2>
          <p className="text-[10px] text-[#7880a0] truncate w-48">{activeCase.title}</p>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={exportActiveCase} className="text-[10px] font-bold px-2 py-1 rounded border border-[#3a7bd5] text-[#3a7bd5] hover:bg-[#3a7bd5] hover:text-white transition-colors">
            EXPORT
          </button>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#454d66] text-[#dde1ec] bg-[#252a3a]">
            {activeCase.classification}
          </span>
        </div>
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

      {/* 🚀 FIXED: The Floating Action Button (FAB) is back! */}
      {!selectedNodeId && !selectedEdgeId && !connectingFromId && (
        <button 
          onClick={() => navigate('/add')}
          className="absolute bottom-20 right-6 w-14 h-14 bg-[#3a7bd5] text-white rounded-full flex items-center justify-center text-3xl shadow-[0_4px_15px_rgba(58,123,213,0.4)] z-30 hover:bg-[#4a8be5] transition-colors"
        >
          +
        </button>
      )}

      <BottomSheet 
        isOpen={(!!selectedNodeId || !!selectedEdgeId) && !connectingFromId} 
        onClose={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }} 
        title={selectedNode ? selectedNode.data.label : 'Relationship Details'}
      >
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
            {/* 🚀 FIXED: Added padding bottom to ensure buttons clear the mobile safe area */}
            <div className="grid grid-cols-2 gap-4 pt-4 pb-4">
              <button onClick={handleStartConnection} className="py-3 bg-[#3a7bd5] text-white font-bold rounded hover:bg-[#4a8be5]">Draw Connection</button>
              <button onClick={handleDeleteNode} className="py-3 border border-[#c0392b] text-[#c0392b] font-bold rounded hover:bg-[#c0392b] hover:text-white">Delete Node</button>
            </div>
          </div>
        )}

        {selectedEdge && selectedEdge.data.source && selectedEdge.data.target && (
          <div className="space-y-6">
            <div className="bg-[#1c2030] border border-[#252a3a] rounded p-4 flex flex-col items-center space-y-3">
              <span className="text-[#dde1ec] font-mono text-xs">{getLabelForNode(selectedEdge.data.source)}</span>
              <div className="flex flex-col items-center text-[#e74c3c]">
                <span className="text-[10px] font-bold uppercase mb-1">{selectedEdge.data.label}</span>
                <span>↓</span>
              </div>
              <span className="text-[#dde1ec] font-mono text-xs">{getLabelForNode(selectedEdge.data.target)}</span>
            </div>
            
            <div className="pt-4 pb-4">
              <button onClick={handleDeleteEdge} className="w-full py-3 bg-[#c0392b] text-white font-bold rounded hover:bg-[#a93226]">
                Sever Connection
              </button>
            </div>
          </div>
        )}
      </BottomSheet>
      <BottomTabBar />
    </div>
  );
};
EOF

echo "Staging files..."
git add src/

echo "Committing..."
git commit -m "fix: restore FAB node addition button and adjust BottomSheet dynamic CSS"

echo "Pushing to GitHub..."
git push origin main

echo "UX Patch Deployed!"

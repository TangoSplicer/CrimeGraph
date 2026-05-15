#!/bin/bash

echo "Updating caseStore.ts to include confidence data..."
cat << 'EOF' > src/stores/caseStore.ts
import { create } from 'zustand';

export interface Case {
  id: string;
  reference_number: string;
  title: string;
  case_type: 'major_crime' | 'missing_person' | 'organised_crime' | 'other';
  status: 'active' | 'pending_review' | 'closed' | 'archived';
  classification: 'OFFICIAL' | 'OFFICIAL-SENSITIVE' | 'SECRET';
  date_opened: string;
  node_count?: number;
}

export interface GraphElement {
  data: {
    id: string;
    label: string;
    type?: string;
    source?: string;
    target?: string;
    confidence?: number; // 🚀 NEW: Dynamic confidence rating
  };
}

interface CaseState {
  cases: Case[];
  activeCaseId: string | null;
  graphElements: GraphElement[];
  selectedNodeId: string | null;
  connectingFromId: string | null;
  
  loadCases: () => Promise<void>;
  setActiveCase: (id: string) => void;
  // 🚀 NEW: Added confidence parameter
  addNode: (nodeType: string, label: string, confidence: number) => void;
  addEdge: (sourceId: string, targetId: string, relationshipType: string) => void;
  setSelectedNodeId: (id: string | null) => void;
  setConnectingFromId: (id: string | null) => void;
}

const initialMockElements: GraphElement[] = [
  { data: { id: 'n1', label: 'John DOE', type: 'person', confidence: 4 } },
  { data: { id: 'n2', label: '07700 900123', type: 'phone', confidence: 5 } },
  { data: { id: 'n3', label: 'Ford Transit (Blue)', type: 'vehicle', confidence: 3 } },
  { data: { id: 'n4', label: 'Safehouse A', type: 'location', confidence: 2 } },
  { data: { id: 'e1', source: 'n1', target: 'n2', label: 'OWNS' } },
  { data: { id: 'e2', source: 'n1', target: 'n3', label: 'DRIVES' } },
  { data: { id: 'e3', source: 'n3', target: 'n4', label: 'SEEN AT' } }
];

export const useCaseStore = create<CaseState>((set) => ({
  cases: [],
  activeCaseId: '1',
  graphElements: initialMockElements,
  selectedNodeId: null,
  connectingFromId: null,
  
  loadCases: async () => {
    const mockCases: Case[] = [
      {
        id: '1',
        reference_number: 'OP-VANGUARD-26',
        title: 'Operation Vanguard (O/C Network)',
        case_type: 'organised_crime',
        status: 'active',
        classification: 'SECRET',
        date_opened: new Date().toISOString(),
        node_count: 142
      }
    ];
    set({ cases: mockCases });
  },

  setActiveCase: (id) => set({ activeCaseId: id }),

  // 🚀 NEW: Accepts and stores the confidence rating
  addNode: (nodeType, label, confidence) => set((state) => {
    const newNode: GraphElement = {
      data: { id: `node_${Date.now()}`, label, type: nodeType, confidence }
    };
    return { graphElements: [...state.graphElements, newNode] };
  }),

  addEdge: (sourceId, targetId, relationshipType) => set((state) => {
    if (sourceId === targetId) return state;
    const exists = state.graphElements.some(
      e => e.data.source === sourceId && e.data.target === targetId
    );
    if (exists) return state;

    const newEdge: GraphElement = {
      data: { id: `edge_${Date.now()}`, source: sourceId, target: targetId, label: relationshipType }
    };
    return { graphElements: [...state.graphElements, newEdge] };
  }),

  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  setConnectingFromId: (id) => set({ connectingFromId: id })
}));
EOF

echo "Patching AddEntityScreen.tsx with a Star Selector..."
cat << 'EOF' > src/screens/AddEntityScreen.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCaseStore } from '../stores/caseStore';
import { BottomTabBar } from '../components/layout/BottomTabBar';

export const AddEntityScreen: React.FC = () => {
  const navigate = useNavigate();
  const { addNode } = useCaseStore();
  const [nodeType, setNodeType] = useState('person');
  const [label, setLabel] = useState('');
  const [confidence, setConfidence] = useState(3); // Default to 3 stars

  const nodeTypes = [
    { id: 'person', label: 'Person' },
    { id: 'vehicle', label: 'Vehicle' },
    { id: 'phone', label: 'Phone Number' },
    { id: 'location', label: 'Location' },
    { id: 'event', label: 'Event' },
    { id: 'organisation', label: 'Organisation' },
    { id: 'digital_account', label: 'Digital Account' },
    { id: 'evidence', label: 'Evidence Item' }
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    addNode(nodeType, label.trim(), confidence);
    navigate('/graph');
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#0c0e14]">
      <div className="px-4 py-4 bg-[#14171f] border-b border-[#252a3a] pt-safe">
        <h1 className="text-xl font-mono text-[#dde1ec]">Add Entity</h1>
        <p className="text-[#7880a0] text-xs">Create a new intelligence node</p>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-[#7880a0] mb-2 uppercase">Entity Type</label>
            <div className="grid grid-cols-2 gap-2">
              {nodeTypes.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setNodeType(t.id)}
                  className={`py-2 px-2 rounded text-[11px] font-bold border transition-colors ${
                    nodeType === t.id 
                      ? 'bg-[#3a7bd5] text-white border-[#3a7bd5]' 
                      : 'bg-[#0f1219] text-[#7880a0] border-[#252a3a] hover:border-[#454d66]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-bold text-[#7880a0] mb-2 uppercase">Label / Identifier</label>
            <input 
              type="text" 
              className="w-full px-3 py-3 bg-[#0f1219] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5]"
              placeholder="e.g. John SMITH, 07700 900123"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
            />
          </div>

          {/* 🚀 NEW: Confidence Rating UI */}
          <div>
            <label className="block text-xs font-bold text-[#7880a0] mb-2 uppercase">Intelligence Confidence</label>
            <div className="flex justify-between items-center bg-[#0f1219] border border-[#252a3a] rounded p-3">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setConfidence(star)}
                  className={`text-2xl ${star <= confidence ? 'text-[#1d9a6c]' : 'text-[#454d66]'}`}
                >
                  ★
                </button>
              ))}
            </div>
            <p className="text-right text-[10px] text-[#7880a0] mt-1 font-mono">
              Level {confidence} of 5
            </p>
          </div>

          <button type="submit" className="w-full py-3 bg-[#1d9a6c] hover:bg-[#157a55] text-white font-bold rounded shadow-lg transition-colors mt-4">
            Create Node
          </button>
        </form>
      </div>
      <BottomTabBar />
    </div>
  );
};
EOF

echo "Patching GraphWorkspaceScreen.tsx to render dynamic stars..."
cat << 'EOF' > src/screens/GraphWorkspaceScreen.tsx
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
      setSelectedNodeId(null);
    }
  };

  const handleCancelConnection = () => {
    setConnectingFromId(null);
  };

  // 🚀 NEW: Helper to generate the star string dynamically
  const renderStars = (rating: number = 3) => {
    return '★'.repeat(rating) + '☆'.repeat(5 - rating);
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
            
            {/* 🚀 NEW: Render the dynamic confidence rating here */}
            <div className="flex justify-between items-center border-b border-[#252a3a] pb-4">
              <span className="text-[#7880a0] text-xs uppercase font-bold">Confidence</span>
              <span className="text-[#1d9a6c] font-mono text-lg">
                {renderStars(selectedNode.data.confidence)}
              </span>
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
EOF

echo "Staging files..."
git add src/

echo "Committing..."
git commit -m "feat: make intelligence confidence rating dynamic during entity creation"

echo "Pushing to GitHub..."
git push origin main

echo "Confidence patch deployed!"

#!/bin/bash

echo "Creating shared components directory..."
mkdir -p src/components/shared

echo "Updating caseStore.ts for Edge creation and Selection..."
cat << 'EOF' > src/stores/caseStore.ts
import { create } from 'zustand';

export interface GraphElement {
  data: {
    id: string;
    label: string;
    type?: string;
    source?: string;
    target?: string;
  };
}

interface CaseState {
  activeCaseId: string | null;
  graphElements: GraphElement[];
  selectedNodeId: string | null;
  connectingFromId: string | null; // Tracks source node when drawing an edge
  
  setActiveCase: (id: string) => void;
  addNode: (nodeType: string, label: string) => void;
  addEdge: (sourceId: string, targetId: string, relationshipType: string) => void;
  setSelectedNodeId: (id: string | null) => void;
  setConnectingFromId: (id: string | null) => void;
}

const initialMockElements: GraphElement[] = [
  { data: { id: 'n1', label: 'John DOE', type: 'person' } },
  { data: { id: 'n2', label: '07700 900123', type: 'phone' } },
  { data: { id: 'n3', label: 'Ford Transit (Blue)', type: 'vehicle' } },
  { data: { id: 'n4', label: 'Safehouse A', type: 'location' } },
  { data: { id: 'e1', source: 'n1', target: 'n2', label: 'OWNS' } },
  { data: { id: 'e2', source: 'n1', target: 'n3', label: 'DRIVES' } },
  { data: { id: 'e3', source: 'n3', target: 'n4', label: 'SEEN AT' } }
];

export const useCaseStore = create<CaseState>((set) => ({
  activeCaseId: '1',
  graphElements: initialMockElements,
  selectedNodeId: null,
  connectingFromId: null,
  
  setActiveCase: (id) => set({ activeCaseId: id }),

  addNode: (nodeType, label) => set((state) => {
    const newNode: GraphElement = {
      data: { id: `node_${Date.now()}`, label, type: nodeType }
    };
    return { graphElements: [...state.graphElements, newNode] };
  }),

  addEdge: (sourceId, targetId, relationshipType) => set((state) => {
    // Prevent duplicate exact edges or self-loops
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

echo "Creating reusable BottomSheet.tsx..."
cat << 'EOF' > src/components/shared/BottomSheet.tsx
import React from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const BottomSheet: React.FC<Props> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      {/* Dimmed Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 transition-opacity" 
        onClick={onClose} 
      />
      
      {/* Sliding Sheet */}
      <div className="relative bg-[#14171f] border-t border-[#252a3a] rounded-t-2xl p-5 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] transform transition-transform animate-[slideUp_0.3s_ease-out]">
        
        {/* Drag Handle UI Hint */}
        <div className="w-12 h-1.5 bg-[#454d66] rounded-full mx-auto mb-4" />
        
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-[#dde1ec] font-mono">{title}</h3>
          <button 
            onClick={onClose} 
            className="text-[#7880a0] hover:text-[#dde1ec] font-bold px-2 py-1"
          >
            Close
          </button>
        </div>
        
        <div className="pb-safe">{children}</div>
      </div>
    </div>
  );
};
EOF

echo "Adding slide animation to index.css..."
cat << 'EOF' >> src/index.css

@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
.animate-slide-up {
  animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
EOF

echo "Updating GraphCanvas.tsx to handle tap events..."
cat << 'EOF' > src/components/graph/GraphCanvas.tsx
import React, { useEffect, useRef } from 'react';
import cytoscape, { Core } from 'cytoscape';
import { useCaseStore } from '../../stores/caseStore';

const nodeColors: Record<string, string> = {
  person: '#3a7bd5', vehicle: '#7c4dbb', phone: '#1a9a8a', location: '#c0680a',
  event: '#c0392b', digital_account: '#2776b8', organisation: '#b07d0a', evidence: '#1a8a4a',
};

export const GraphCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const { 
    graphElements, 
    setSelectedNodeId, 
    connectingFromId, 
    setConnectingFromId, 
    addEdge 
  } = useCaseStore();

  useEffect(() => {
    if (!containerRef.current) return;

    const style: any[] = [
      {
        selector: 'node',
        style: {
          'label': 'data(label)',
          'background-color': (ele: any) => nodeColors[ele.data('type')] || '#7880a0',
          'color': '#dde1ec', 'text-valign': 'bottom', 'text-halign': 'center',
          'text-margin-y': 6, 'font-family': 'Space Mono, monospace', 'font-size': '10px',
          'width': 48, 'height': 48, 'border-width': 2, 'border-color': '#252a3a'
        }
      },
      {
        selector: 'node:selected',
        style: { 'border-width': 4, 'border-color': '#ffffff', 'shadow-blur': 15, 'shadow-color': '#ffffff' }
      },
      {
        selector: 'edge',
        style: {
          'width': 2, 'line-color': '#454d66', 'target-arrow-color': '#454d66',
          'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'label': 'data(label)',
          'color': '#7880a0', 'font-size': '8px', 'text-background-opacity': 1,
          'text-background-color': '#0c0e14', 'text-background-padding': 2
        }
      }
    ];

    const cy = cytoscape({
      container: containerRef.current,
      elements: graphElements,
      style: style,
      layout: { name: 'cose', padding: 50, animate: false },
      userZoomingEnabled: true, userPanningEnabled: true, boxSelectionEnabled: false,
      minZoom: 0.1, maxZoom: 4, touchTapThreshold: 8,
    });
    
    cyRef.current = cy;

    // TAP EVENT LISTENER
    cy.on('tap', (evt) => {
      const target = evt.target;
      
      // If user tapped the empty background canvas
      if (target === cy) {
        useCaseStore.getState().setSelectedNodeId(null);
        return;
      }

      // If user tapped a Node
      if (target.isNode()) {
        const targetId = target.id();
        const state = useCaseStore.getState();
        
        // Are we currently in "Draw Connection" mode?
        if (state.connectingFromId) {
          addEdge(state.connectingFromId, targetId, 'LINKED_TO');
          state.setConnectingFromId(null); // Exit drawing mode
        } else {
          // Normal mode: select node to show details
          state.setSelectedNodeId(targetId);
        }
      }
    });

    return () => cy.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Diffing engine for Reactivity
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    const currentIds = new Set();
    cy.elements().forEach((ele: any) => { currentIds.add(ele.id()); });
    const newElements = graphElements.filter(e => !currentIds.has(e.data.id));

    if (newElements.length > 0) {
      cy.add(newElements);
      cy.layout({ name: 'cose', padding: 50, animate: true, animationDuration: 300, randomize: false }).run();
    }
  }, [graphElements]);

  return <div ref={containerRef} className="w-full h-full bg-[#0c0e14]" />;
};
EOF

echo "Updating GraphWorkspaceScreen.tsx to include the Node Detail overlay..."
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
EOF

echo "Patching AddEntityScreen.tsx to include POLE types..."
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

  // Added POLE aligned missing entities: event & organisation
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
    addNode(nodeType, label.trim());
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
          <button type="submit" className="w-full py-3 bg-[#1d9a6c] hover:bg-[#157a55] text-white font-bold rounded shadow-lg transition-colors mt-8">
            Create Node
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
git commit -m "feat: implement slide-up NodeDetailSheet and interactive edge drawing"

echo "Pushing to GitHub..."
git push origin main

echo "Phase 5 Deployed!"

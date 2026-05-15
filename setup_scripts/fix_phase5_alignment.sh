#!/bin/bash

echo "Restoring full CaseState to caseStore.ts..."
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
      },
      {
        id: '2',
        reference_number: 'MP-882-BR',
        title: 'Misper: John DOE (High Risk)',
        case_type: 'missing_person',
        status: 'pending_review',
        classification: 'OFFICIAL-SENSITIVE',
        date_opened: new Date(Date.now() - 86400000 * 3).toISOString(),
        node_count: 28
      }
    ];
    set({ cases: mockCases });
  },

  setActiveCase: (id) => set({ activeCaseId: id }),

  addNode: (nodeType, label) => set((state) => {
    const newNode: GraphElement = {
      data: { id: `node_${Date.now()}`, label, type: nodeType }
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

echo "Cleaning up unused variables in GraphCanvas.tsx..."
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
  
  // FIXED: Only destructure graphElements. Everything else is handled via getState()
  const { graphElements } = useCaseStore();

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

    cy.on('tap', (evt) => {
      const target = evt.target;
      const state = useCaseStore.getState();
      
      if (target === cy) {
        state.setSelectedNodeId(null);
        return;
      }

      if (target.isNode()) {
        const targetId = target.id();
        
        if (state.connectingFromId) {
          state.addEdge(state.connectingFromId, targetId, 'LINKED_TO');
          state.setConnectingFromId(null);
        } else {
          state.setSelectedNodeId(targetId);
        }
      }
    });

    return () => cy.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

echo "Staging files..."
git add src/stores/caseStore.ts src/components/graph/GraphCanvas.tsx

echo "Committing..."
git commit -m "fix: restore missing Dashboard state and remove unused GraphCanvas variables"

echo "Pushing to GitHub..."
git push origin main

echo "Alignment patch deployed!"

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

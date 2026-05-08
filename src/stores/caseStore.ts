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

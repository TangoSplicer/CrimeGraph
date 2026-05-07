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
  loadCases: () => Promise<void>;
  setActiveCase: (id: string) => void;
  addNode: (nodeType: string, label: string) => void;
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
  activeCaseId: null,
  graphElements: initialMockElements,
  
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

  addNode: (nodeType, label) => set((state) => {
    const newNode: GraphElement = {
      data: {
        id: `node_${Date.now()}`, // Temporary ID generation
        label,
        type: nodeType
      }
    };
    return { graphElements: [...state.graphElements, newNode] };
  })
}));

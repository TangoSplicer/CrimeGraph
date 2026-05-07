import { create } from 'zustand';

export interface Case {
  id: string;
  reference_number: string;
  title: string;
  case_type: 'major_crime' | 'missing_person' | 'organised_crime' | 'other';
  status: 'active' | 'pending_review' | 'closed' | 'archived';
  classification: 'OFFICIAL' | 'OFFICIAL-SENSITIVE' | 'SECRET';
  date_opened: string;
  node_count?: number; // Virtual field for UI
}

interface CaseState {
  cases: Case[];
  activeCaseId: string | null;
  loadCases: () => Promise<void>;
  setActiveCase: (id: string) => void;
}

export const useCaseStore = create<CaseState>((set) => ({
  cases: [],
  activeCaseId: null,
  
  // In a real app, this queries SQLite. For now, we mock it to build the UI.
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
}));

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

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCaseStore } from '../stores/caseStore';

const nodeTypes = [
  { id: 'person', label: 'Person', icon: '👤', color: 'bg-[#3a7bd5]' },
  { id: 'vehicle', label: 'Vehicle', icon: '🚗', color: 'bg-[#7c4dbb]' },
  { id: 'phone', label: 'Phone', icon: '📱', color: 'bg-[#1a9a8a]' },
  { id: 'location', label: 'Location', icon: '📍', color: 'bg-[#c0680a]' },
  { id: 'digital_account', label: 'Digital Account', icon: '💻', color: 'bg-[#2776b8]' },
  { id: 'organisation', label: 'Organisation', icon: '🏢', color: 'bg-[#b07d0a]' },
  { id: 'event', label: 'Event', icon: '⚠️', color: 'bg-[#c0392b]' },
  { id: 'evidence', label: 'Evidence', icon: '💼', color: 'bg-[#1a8a4a]' },
];

const metadataTemplates: Record<string, string[]> = {
  person: ['Alias', 'Date of Birth', 'National Insurance'],
  vehicle: ['Registration (VRM)', 'Make/Model', 'Colour'],
  phone: ['Phone Number', 'IMEI', 'Network'],
  location: ['Address', 'Postcode', 'Grid Reference'],
  digital_account: ['Platform', 'Username/Email'],
  organisation: ['Company Name', 'Registration Number'],
  event: ['Date/Time', 'Incident Type'],
  evidence: ['Exhibit Number', 'Seized By', 'Seized From']
};

export const AddNodeScreen: React.FC = () => {
  const navigate = useNavigate();
  const addNode = useCaseStore((state) => state.addNode);
  
  const [selectedType, setSelectedType] = useState('person');
  const [label, setLabel] = useState('');
  const [confidence, setConfidence] = useState(3);
  const [attributes, setAttributes] = useState<{key: string, value: string}[]>([]);

  useEffect(() => {
    const templateKeys = metadataTemplates[selectedType] || [];
    setAttributes(templateKeys.map(key => ({ key, value: '' })));
  }, [selectedType]);

  const handleAddAttribute = () => setAttributes([...attributes, { key: '', value: '' }]);
  const handleUpdateAttribute = (index: number, field: 'key'|'value', val: string) => {
    const newAttrs = [...attributes];
    newAttrs[index][field] = val;
    setAttributes(newAttrs);
  };
  const handleRemoveAttribute = (index: number) => setAttributes(attributes.filter((_, i) => i !== index));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    
    const attrRecord: Record<string, string> = {};
    attributes.forEach(attr => {
      if (attr.key.trim() && attr.value.trim()) attrRecord[attr.key.trim()] = attr.value.trim();
    });

    await addNode(selectedType, label.trim(), confidence, attrRecord);
    navigate('/workspace');
  };

  return (
    <div className="h-screen bg-[#0c0e14] text-[#dde1ec] flex flex-col pt-safe">
      <div className="flex items-center justify-between p-4 bg-[#14171f] border-b border-[#252a3a] shrink-0">
        <h1 className="text-lg font-bold">Add Intelligence Node</h1>
        <button onClick={() => navigate('/workspace')} className="text-[#7880a0] font-bold text-sm">CANCEL</button>
      </div>

      {/* The form container handles all the scrolling natively now */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <section>
          <label className="block text-xs font-bold text-[#7880a0] uppercase mb-3 tracking-wider">Entity Type</label>
          <div className="grid grid-cols-2 gap-3">
            {nodeTypes.map((type) => (
              <button key={type.id} type="button" onClick={() => setSelectedType(type.id)}
                className={`flex items-center p-3 rounded border text-left transition-colors ${
                  selectedType === type.id ? 'border-[#3a7bd5] bg-[#1a2333]' : 'border-[#252a3a] bg-[#14171f] hover:border-[#454d66]'
                }`}>
                <span className="text-xl mr-3">{type.icon}</span>
                <span className="text-sm font-bold text-[#dde1ec]">{type.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <label className="block text-xs font-bold text-[#7880a0] uppercase mb-2 tracking-wider">Primary Identifier (Label)</label>
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. John Doe, 07700 900461..." className="w-full bg-[#14171f] border border-[#252a3a] rounded p-4 text-[#dde1ec] focus:outline-none focus:border-[#3a7bd5]" required />
        </section>

        <section>
          <label className="block text-xs font-bold text-[#7880a0] uppercase mb-2 tracking-wider">Intelligence Confidence: {confidence} / 5</label>
          <input type="range" min="1" max="5" value={confidence} onChange={(e) => setConfidence(parseInt(e.target.value))} className="w-full accent-[#3a7bd5]" />
        </section>

        <section className="border-t border-[#252a3a] pt-6">
          <div className="flex justify-between items-center mb-4">
            <label className="text-xs font-bold text-[#7880a0] uppercase tracking-wider">Entity Metadata</label>
            <button onClick={handleAddAttribute} type="button" className="text-xs font-bold text-[#3a7bd5] hover:text-[#4a8be5]">+ ADD FIELD</button>
          </div>
          
          <div className="space-y-3">
            {attributes.length === 0 && <p className="text-xs text-[#7880a0] italic">No fields.</p>}
            {attributes.map((attr, index) => (
              <div key={index} className="flex space-x-2 items-center">
                <input type="text" placeholder="Key (e.g. Alias)" value={attr.key} onChange={(e) => handleUpdateAttribute(index, 'key', e.target.value)} className="w-1/3 bg-[#14171f] border border-[#252a3a] rounded p-2 text-xs text-[#dde1ec] focus:outline-none focus:border-[#3a7bd5]" />
                <input type="text" placeholder="Value..." value={attr.value} onChange={(e) => handleUpdateAttribute(index, 'value', e.target.value)} className="flex-1 bg-[#14171f] border border-[#252a3a] rounded p-2 text-xs text-[#dde1ec] focus:outline-none focus:border-[#3a7bd5]" />
                <button onClick={() => handleRemoveAttribute(index)} type="button" className="text-[#c0392b] font-bold px-2 text-xl">&times;</button>
              </div>
            ))}
          </div>
        </section>

        {/* 🚀 THE FIX: Button moved inside the scroll flow */}
        <div className="pt-6 pb-8">
          <button onClick={handleSubmit} disabled={!label.trim()} className="w-full py-4 bg-[#3a7bd5] hover:bg-[#4a8be5] disabled:bg-[#252a3a] disabled:text-[#7880a0] text-white font-bold rounded text-lg transition-colors shadow-[0_0_15px_rgba(58,123,213,0.3)] disabled:shadow-none">
            Deploy Node
          </button>
        </div>
      </div>
    </div>
  );
};

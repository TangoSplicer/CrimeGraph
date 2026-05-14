import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCaseStore } from '../stores/caseStore';
import { BottomTabBar } from '../components/layout/BottomTabBar';

export const AddEntityScreen: React.FC = () => {
  const navigate = useNavigate();
  const { addNode, activeCaseId } = useCaseStore();
  const [label, setLabel] = useState('');
  const [nodeType, setNodeType] = useState('person');
  const [confidence, setConfidence] = useState(3);
  
  // 🚀 NEW: Dynamic Attributes State
  const [attributes, setAttributes] = useState<Record<string, string>>({});

  const handleAttrChange = (key: string, value: string) => {
    setAttributes(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !activeCaseId) return;
    
    // Clean out empty attributes
    const cleanAttr = Object.fromEntries(Object.entries(attributes).filter(([_, v]) => v.trim() !== ''));
    
    await addNode(nodeType, label.trim(), confidence, cleanAttr);
    navigate('/graph');
  };

  const renderDynamicFields = () => {
    switch (nodeType) {
      case 'person':
        return (
          <>
            <input type="text" placeholder="Date of Birth (e.g. 01/01/1980)" onChange={(e) => handleAttrChange('dob', e.target.value)} className="w-full px-3 py-3 bg-[#14171f] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5]" />
            <input type="text" placeholder="Known Aliases" onChange={(e) => handleAttrChange('aliases', e.target.value)} className="w-full px-3 py-3 bg-[#14171f] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5]" />
            <input type="text" placeholder="Warning Markers (e.g. VIOLENT, WEAPONS)" onChange={(e) => handleAttrChange('markers', e.target.value)} className="w-full px-3 py-3 bg-[#3d0000] text-[#e74c3c] border border-[#e74c3c] placeholder-[#e74c3c]/50 rounded focus:outline-none" />
          </>
        );
      case 'vehicle':
        return (
          <>
            <input type="text" placeholder="VRM / License Plate" onChange={(e) => handleAttrChange('vrm', e.target.value)} className="w-full px-3 py-3 bg-[#14171f] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5] uppercase" />
            <input type="text" placeholder="Make & Model" onChange={(e) => handleAttrChange('make_model', e.target.value)} className="w-full px-3 py-3 bg-[#14171f] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5]" />
          </>
        );
      case 'phone':
        return (
          <input type="text" placeholder="Network Carrier / IMEI" onChange={(e) => handleAttrChange('carrier_imei', e.target.value)} className="w-full px-3 py-3 bg-[#14171f] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5]" />
        );
      default:
        return (
          <input type="text" placeholder="Additional Notes" onChange={(e) => handleAttrChange('notes', e.target.value)} className="w-full px-3 py-3 bg-[#14171f] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5]" />
        );
    }
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#0c0e14]">
      <div className="px-4 py-4 bg-[#14171f] border-b border-[#252a3a] pt-safe shadow-md flex justify-between items-center">
        <div><h1 className="text-xl font-mono text-[#dde1ec]">Add Intelligence</h1></div>
        <button onClick={() => navigate('/graph')} className="text-[#7880a0] font-bold text-sm">Cancel</button>
      </div>

      <div className="flex-1 p-4 overflow-y-auto pb-safe-offset-12">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-[#7880a0] mb-2 uppercase">Entity Name / Identifier</label>
            <input type="text" className="w-full px-3 py-3 bg-[#0f1219] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5]" placeholder="e.g. John DOE, 07700 900123" value={label} onChange={(e) => setLabel(e.target.value)} required />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#7880a0] mb-2 uppercase">Entity Type</label>
            <select value={nodeType} onChange={(e) => { setNodeType(e.target.value); setAttributes({}); }} className="w-full px-3 py-3 bg-[#0f1219] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5]">
              <option value="person">Person</option>
              <option value="vehicle">Vehicle</option>
              <option value="phone">Phone / Communication</option>
              <option value="location">Location / Address</option>
              <option value="event">Event / Incident</option>
              <option value="digital_account">Digital Account</option>
              <option value="organisation">Organisation</option>
              <option value="evidence">Physical Evidence</option>
            </select>
          </div>

          {/* 🚀 Dynamic Attributes Area */}
          <div className="p-3 border border-[#252a3a] rounded bg-[#0f1219] space-y-3">
            <label className="block text-[10px] font-bold text-[#3a7bd5] uppercase tracking-wider">Metadata (Optional)</label>
            {renderDynamicFields()}
          </div>

          <div>
            <label className="block text-xs font-bold text-[#7880a0] mb-2 uppercase">Intelligence Confidence (1-5)</label>
            <input type="range" min="1" max="5" value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="w-full accent-[#3a7bd5]" />
            <div className="text-center text-[#1d9a6c] font-mono text-xl mt-2">
              {'★'.repeat(confidence)}{'☆'.repeat(5 - confidence)}
            </div>
          </div>

          <button type="submit" className="w-full py-4 bg-[#3a7bd5] hover:bg-[#4a8be5] text-white font-bold rounded shadow-[0_0_15px_rgba(58,123,213,0.3)] transition-colors mt-8 uppercase tracking-widest text-sm">
            Save & Add to Graph
          </button>
        </form>
      </div>
      <BottomTabBar />
    </div>
  );
};

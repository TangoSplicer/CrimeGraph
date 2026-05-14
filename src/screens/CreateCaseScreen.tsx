import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCaseStore } from '../stores/caseStore';
import { BottomTabBar } from '../components/layout/BottomTabBar';

export const CreateCaseScreen: React.FC = () => {
  const navigate = useNavigate();
  const { addCase } = useCaseStore();
  const [title, setTitle] = useState('');
  const [refNumber, setRefNumber] = useState('');
  const [caseType, setCaseType] = useState('major_crime');
  const [classification, setClassification] = useState('OFFICIAL');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !refNumber.trim()) return;
    
    try {
      await addCase(title.trim(), refNumber.trim().toUpperCase(), caseType, classification);
      navigate('/');
    } catch (error: any) {
      // 🚀 FIXED: We now show the actual raw database error so we know exactly what went wrong.
      const errorMessage = error?.message || JSON.stringify(error) || "Unknown SQLite Error";
      alert(`CRITICAL ERROR:\n\n${errorMessage}\n\nPlease check your inputs or application state.`);
    }
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#0c0e14]">
      <div className="px-4 py-4 bg-[#14171f] border-b border-[#252a3a] pt-safe flex items-center justify-between">
        <div>
          <h1 className="text-xl font-mono text-[#dde1ec]">New Operation</h1>
          <p className="text-[#7880a0] text-xs">Initialize a blank workspace</p>
        </div>
        <button onClick={() => navigate('/')} className="text-[#7880a0] font-bold text-sm">Cancel</button>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div>
            <label className="block text-xs font-bold text-[#7880a0] mb-2 uppercase">Reference No. / URN</label>
            <input 
              type="text" className="w-full px-3 py-3 bg-[#0f1219] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5] uppercase"
              placeholder="e.g. OP-VANGUARD-26" value={refNumber} onChange={(e) => setRefNumber(e.target.value)} required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#7880a0] mb-2 uppercase">Operation Title</label>
            <input 
              type="text" className="w-full px-3 py-3 bg-[#0f1219] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5]"
              placeholder="e.g. Operation Vanguard" value={title} onChange={(e) => setTitle(e.target.value)} required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#7880a0] mb-2 uppercase">Type</label>
            <select 
              value={caseType} onChange={(e) => setCaseType(e.target.value)}
              className="w-full px-3 py-3 bg-[#0f1219] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5]"
            >
              <option value="major_crime">Major Crime</option>
              <option value="missing_person">Missing Person</option>
              <option value="organised_crime">Organised Crime</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#7880a0] mb-2 uppercase">Classification</label>
            <select 
              value={classification} onChange={(e) => setClassification(e.target.value)}
              className="w-full px-3 py-3 bg-[#0f1219] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5]"
            >
              <option value="OFFICIAL">OFFICIAL</option>
              <option value="OFFICIAL-SENSITIVE">OFFICIAL-SENSITIVE</option>
              <option value="SECRET">SECRET</option>
            </select>
          </div>

          <button type="submit" className="w-full py-3 bg-[#3a7bd5] hover:bg-[#4a8be5] text-white font-bold rounded shadow-lg transition-colors mt-8">
            Create Database
          </button>
        </form>
      </div>
      <BottomTabBar />
    </div>
  );
};

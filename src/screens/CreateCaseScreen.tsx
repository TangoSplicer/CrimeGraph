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
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !refNumber.trim() || isCreating) return;

    try {
      setIsCreating(true);
      setErrorMessage('');
      await addCase(title.trim(), refNumber.trim().toUpperCase(), caseType, classification);
      navigate('/');
    } catch (error: unknown) {
      // Keep failures inside the safe action region instead of a blocking browser alert.
      setErrorMessage(error instanceof Error ? error.message : 'The operation could not be created. No operation record was added.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex h-screen w-full flex-col bg-[#0c0e14] pt-safe pb-safe-nav">
      <div className="flex shrink-0 items-center justify-between border-b border-[#252a3a] bg-[#14171f] px-4 py-4">
        <div>
          <h1 className="text-xl font-mono text-[#dde1ec]">New Operation</h1>
          <p className="text-xs text-[#7880a0]">Initialize a blank workspace</p>
        </div>
        <button onClick={() => navigate('/')} className="min-h-11 px-2 text-sm font-bold text-[#7880a0]">Cancel</button>
      </div>

      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-6 overflow-y-auto p-4 pb-36">
          <div>
            <label className="mb-2 block text-xs font-bold uppercase text-[#7880a0]">Reference No. / URN</label>
            <input type="text" className="w-full rounded border border-[#252a3a] bg-[#0f1219] px-3 py-3 uppercase text-[#dde1ec] focus:border-[#3a7bd5] focus:outline-none" placeholder="e.g. OP-VANGUARD-26" value={refNumber} onChange={(event) => setRefNumber(event.target.value)} required />
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase text-[#7880a0]">Operation Title</label>
            <input type="text" className="w-full rounded border border-[#252a3a] bg-[#0f1219] px-3 py-3 text-[#dde1ec] focus:border-[#3a7bd5] focus:outline-none" placeholder="e.g. Operation Vanguard" value={title} onChange={(event) => setTitle(event.target.value)} required />
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase text-[#7880a0]">Type</label>
            <select value={caseType} onChange={(event) => setCaseType(event.target.value)} className="w-full rounded border border-[#252a3a] bg-[#0f1219] px-3 py-3 text-[#dde1ec] focus:border-[#3a7bd5] focus:outline-none">
              <option value="major_crime">Major Crime</option>
              <option value="missing_person">Missing Person</option>
              <option value="organised_crime">Organised Crime</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase text-[#7880a0]">Classification</label>
            <select value={classification} onChange={(event) => setClassification(event.target.value)} className="w-full rounded border border-[#252a3a] bg-[#0f1219] px-3 py-3 uppercase text-[#dde1ec] focus:border-[#3a7bd5] focus:outline-none">
              <option value="OFFICIAL">OFFICIAL</option>
              <option value="OFFICIAL-SENSITIVE">OFFICIAL-SENSITIVE</option>
              <option value="SECRET">SECRET</option>
            </select>
          </div>
        </div>

        <div className="shrink-0 border-t border-[#252a3a] bg-[#14171f] px-4 pt-3 pb-safe-nav">
          {errorMessage && <p role="alert" className="mb-3 rounded border border-[#c0392b]/70 bg-[#c0392b]/10 p-3 text-xs leading-relaxed text-[#ffb0aa]">{errorMessage}</p>}
          <button type="submit" disabled={!title.trim() || !refNumber.trim() || isCreating} className="min-h-14 w-full rounded bg-[#3a7bd5] py-3 font-bold text-white shadow-lg transition-colors hover:bg-[#4a8be5] disabled:bg-[#252a3a] disabled:text-[#7880a0]">
            {isCreating ? 'Creating operation…' : 'Create operation'}
          </button>
        </div>
      </form>
      <BottomTabBar />
    </div>
  );
};

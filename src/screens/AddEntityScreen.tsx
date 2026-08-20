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
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleAttrChange = (key: string, value: string) => {
    setAttributes((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!label.trim() || !activeCaseId || isSaving) return;

    try {
      setIsSaving(true);
      setErrorMessage('');
      const cleanAttributes = Object.fromEntries(Object.entries(attributes).filter(([, value]) => value.trim() !== ''));
      await addNode(nodeType, label.trim(), confidence, cleanAttributes);
      navigate('/workspace');
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'The intelligence record could not be saved. No record was created.');
    } finally {
      setIsSaving(false);
    }
  };

  const renderDynamicFields = () => {
    switch (nodeType) {
      case 'person':
        return <><input type="text" placeholder="Date of Birth (e.g. 01/01/1980)" onChange={(event) => handleAttrChange('dob', event.target.value)} className="w-full rounded border border-[#252a3a] bg-[#14171f] px-3 py-3 text-[#dde1ec] focus:border-[#3a7bd5] focus:outline-none" /><input type="text" placeholder="Known Aliases" onChange={(event) => handleAttrChange('aliases', event.target.value)} className="w-full rounded border border-[#252a3a] bg-[#14171f] px-3 py-3 text-[#dde1ec] focus:border-[#3a7bd5] focus:outline-none" /><input type="text" placeholder="Warning Markers (e.g. VIOLENT, WEAPONS)" onChange={(event) => handleAttrChange('markers', event.target.value)} className="w-full rounded border border-[#e74c3c] bg-[#3d0000] px-3 py-3 text-[#e74c3c] placeholder-[#e74c3c]/50 focus:outline-none" /></>;
      case 'vehicle':
        return <><input type="text" placeholder="VRM / License Plate" onChange={(event) => handleAttrChange('vrm', event.target.value)} className="w-full rounded border border-[#252a3a] bg-[#14171f] px-3 py-3 uppercase text-[#dde1ec] focus:border-[#3a7bd5] focus:outline-none" /><input type="text" placeholder="Make & Model" onChange={(event) => handleAttrChange('make_model', event.target.value)} className="w-full rounded border border-[#252a3a] bg-[#14171f] px-3 py-3 text-[#dde1ec] focus:border-[#3a7bd5] focus:outline-none" /></>;
      case 'phone':
        return <input type="text" placeholder="Network Carrier / IMEI" onChange={(event) => handleAttrChange('carrier_imei', event.target.value)} className="w-full rounded border border-[#252a3a] bg-[#14171f] px-3 py-3 text-[#dde1ec] focus:border-[#3a7bd5] focus:outline-none" />;
      default:
        return <input type="text" placeholder="Additional Notes" onChange={(event) => handleAttrChange('notes', event.target.value)} className="w-full rounded border border-[#252a3a] bg-[#14171f] px-3 py-3 text-[#dde1ec] focus:border-[#3a7bd5] focus:outline-none" />;
    }
  };

  return (
    <div className="flex h-screen w-full flex-col bg-[#0c0e14] pt-safe pb-safe-nav">
      <div className="flex shrink-0 items-center justify-between border-b border-[#252a3a] bg-[#14171f] px-4 py-4 shadow-md">
        <h1 className="text-xl font-mono text-[#dde1ec]">Add Intelligence</h1>
        <button onClick={() => navigate('/workspace')} className="min-h-11 px-2 text-sm font-bold text-[#7880a0]">Cancel</button>
      </div>

      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-6 overflow-y-auto p-4 pb-36">
          <div><label className="mb-2 block text-xs font-bold uppercase text-[#7880a0]">Entity Name / Identifier</label><input type="text" className="w-full rounded border border-[#252a3a] bg-[#0f1219] px-3 py-3 text-[#dde1ec] focus:border-[#3a7bd5] focus:outline-none" placeholder="e.g. John DOE, 07700 900123" value={label} onChange={(event) => setLabel(event.target.value)} required /></div>
          <div><label className="mb-2 block text-xs font-bold uppercase text-[#7880a0]">Entity Type</label><select value={nodeType} onChange={(event) => { setNodeType(event.target.value); setAttributes({}); }} className="w-full rounded border border-[#252a3a] bg-[#0f1219] px-3 py-3 text-[#dde1ec] focus:border-[#3a7bd5] focus:outline-none"><option value="person">Person</option><option value="vehicle">Vehicle</option><option value="phone">Phone / Communication</option><option value="location">Location / Address</option><option value="event">Event / Incident</option><option value="digital_account">Digital Account</option><option value="organisation">Organisation</option><option value="evidence">Physical Evidence</option></select></div>
          <div className="space-y-3 rounded border border-[#252a3a] bg-[#0f1219] p-3"><label className="block text-[10px] font-bold uppercase tracking-wider text-[#3a7bd5]">Metadata (Optional)</label>{renderDynamicFields()}</div>
          <div><label className="mb-2 block text-xs font-bold uppercase text-[#7880a0]">Intelligence Confidence (1–5)</label><input type="range" min="1" max="5" value={confidence} onChange={(event) => setConfidence(Number(event.target.value))} className="w-full accent-[#3a7bd5]" /><div className="mt-2 text-center font-mono text-xl text-[#1d9a6c]">{'★'.repeat(confidence)}{'☆'.repeat(5 - confidence)}</div></div>
        </div>
        <div className="shrink-0 border-t border-[#252a3a] bg-[#14171f] px-4 pt-3 pb-safe-nav">
          {errorMessage && <p role="alert" className="mb-3 rounded border border-[#c0392b]/70 bg-[#c0392b]/10 p-3 text-xs leading-relaxed text-[#ffb0aa]">{errorMessage}</p>}
          <button type="submit" disabled={!label.trim() || !activeCaseId || isSaving} className="min-h-14 w-full rounded bg-[#3a7bd5] py-3 text-sm font-bold uppercase tracking-widest text-white shadow-[0_0_15px_rgba(58,123,213,0.3)] transition-colors hover:bg-[#4a8be5] disabled:bg-[#252a3a] disabled:text-[#7880a0]">{isSaving ? 'Saving intelligence…' : 'Save and add to graph'}</button>
        </div>
      </form>
      <BottomTabBar />
    </div>
  );
};

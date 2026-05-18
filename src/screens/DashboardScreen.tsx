import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCaseStore } from '../stores/caseStore';
import { useAuthStore } from '../stores/authStore';
import { BottomTabBar } from '../components/layout/BottomTabBar';

export const DashboardScreen: React.FC = () => {
  const navigate = useNavigate();
  const { cases, loadCases, setActiveCase, addCase, archiveCase, importCase } = useCaseStore();
  const { setIntentionalBackground } = useAuthStore(); // 🚀 NEW: Import Intentional Background trigger
  
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newRef, setNewRef] = useState('');
  const [newClass, setNewClass] = useState('OFFICIAL');

  useEffect(() => { loadCases(); }, [loadCases]);

  const filteredCases = cases.filter(c => c.status === activeTab);

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newRef.trim()) return;
    await addCase(newTitle, newRef, 'operation', newClass);
    setIsModalOpen(false); setNewTitle(''); setNewRef(''); setActiveTab('active');
  };

  const handleOpenCase = (id: string) => {
    setActiveCase(id); navigate('/workspace');
  };

  const handleImport = async () => {
    // 🚀 FIX: Tell the app we are intentionally opening the OS File Picker!
    setIntentionalBackground(true); 
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.enc';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) {
        setIntentionalBackground(false); // Reset if they cancel the picker
        return; 
      }
      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target?.result;
        if (typeof text === 'string') {
          try {
            await importCase(text);
          } catch (err) {
            alert("Import failed. Incorrect password or corrupted package.");
          }
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div className="h-screen w-full bg-[#0c0e14] text-[#dde1ec] flex flex-col pt-safe relative">
      <div className="p-4 bg-[#14171f] border-b border-[#252a3a] flex justify-between items-center z-10 shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-widest text-white uppercase">Operations</h1>
          <p className="text-xs text-[#7880a0]">Select a database to load</p>
        </div>
        <div className="flex space-x-2">
          <button onClick={handleImport} className="px-3 py-2 bg-[#252a3a] text-[#dde1ec] text-xs font-bold rounded uppercase hover:bg-[#3a415c]">Import</button>
          <button onClick={() => setIsModalOpen(true)} className="px-3 py-2 bg-[#3a7bd5] text-white text-xs font-bold rounded uppercase shadow-[0_0_10px_rgba(58,123,213,0.3)] hover:bg-[#4a8be5]">+ New</button>
        </div>
      </div>

      <div className="flex border-b border-[#252a3a] bg-[#14171f] shrink-0">
        <button onClick={() => setActiveTab('active')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-colors ${activeTab === 'active' ? 'text-[#3a7bd5] border-b-2 border-[#3a7bd5]' : 'text-[#7880a0] hover:text-[#dde1ec]'}`}>Active</button>
        <button onClick={() => setActiveTab('archived')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-colors ${activeTab === 'archived' ? 'text-[#e74c3c] border-b-2 border-[#e74c3c]' : 'text-[#7880a0] hover:text-[#dde1ec]'}`}>Archived</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-4">
        {filteredCases.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-[#7880a0]"><p className="text-sm">No {activeTab} operations found.</p></div>
        ) : (
          filteredCases.map((c) => (
            <div key={c.id} className="bg-[#1c2030] border border-[#252a3a] rounded-lg p-4 flex flex-col cursor-pointer hover:border-[#3a7bd5] transition-colors" onClick={() => handleOpenCase(c.id)}>
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] text-[#3a7bd5] font-mono tracking-widest">{c.reference_number}</span>
                <span className="text-[9px] px-2 py-1 bg-[#252a3a] text-[#dde1ec] font-bold rounded uppercase">{c.classification}</span>
              </div>
              <h2 className="text-lg font-bold text-white mb-4 line-clamp-1">{c.title}</h2>
              <div className="flex justify-between items-end border-t border-[#252a3a] pt-3">
                <span className="text-[10px] text-[#7880a0] uppercase tracking-widest">{new Date(c.date_opened).toLocaleDateString()}</span>
                {activeTab === 'active' && <button onClick={(e) => { e.stopPropagation(); archiveCase(c.id); }} className="text-[10px] text-[#e74c3c] font-bold uppercase hover:underline">Archive</button>}
              </div>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#14171f] border border-[#252a3a] w-full max-w-sm rounded-lg p-6 shadow-2xl flex flex-col">
            <h2 className="text-lg font-bold text-white mb-4 uppercase tracking-widest">New Operation</h2>
            <form onSubmit={handleCreateCase} className="space-y-4">
              <div>
                <label className="block text-[10px] text-[#7880a0] font-bold uppercase mb-1">URN / Reference</label>
                <input type="text" value={newRef} onChange={(e) => setNewRef(e.target.value)} required placeholder="e.g. OP-GHOST-01" className="w-full bg-[#0c0e14] border border-[#252a3a] rounded p-3 text-sm text-white focus:border-[#3a7bd5] focus:outline-none font-mono uppercase" />
              </div>
              <div>
                <label className="block text-[10px] text-[#7880a0] font-bold uppercase mb-1">Operation Title</label>
                <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required placeholder="Target Network Name" className="w-full bg-[#0c0e14] border border-[#252a3a] rounded p-3 text-sm text-white focus:border-[#3a7bd5] focus:outline-none" />
              </div>
              <div>
                <label className="block text-[10px] text-[#7880a0] font-bold uppercase mb-1">Classification</label>
                <select value={newClass} onChange={(e) => setNewClass(e.target.value)} className="w-full bg-[#0c0e14] border border-[#252a3a] rounded p-3 text-sm text-white focus:border-[#3a7bd5] focus:outline-none uppercase">
                  <option value="OFFICIAL">Official</option><option value="OFFICIAL-SENSITIVE">Official-Sensitive</option><option value="SECRET">Secret</option>
                </select>
              </div>
              <div className="flex space-x-3 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 border border-[#454d66] text-[#dde1ec] rounded text-xs font-bold uppercase">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-[#3a7bd5] text-white rounded text-xs font-bold uppercase">Deploy</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <BottomTabBar />
    </div>
  );
};

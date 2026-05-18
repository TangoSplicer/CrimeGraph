import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCaseStore } from '../stores/caseStore';
import { useAuthStore } from '../stores/authStore';
import { BottomTabBar } from '../components/layout/BottomTabBar';

export const SettingsScreen: React.FC = () => {
  const navigate = useNavigate();
  const { auditLogs, loadAuditLogs, wipeDatabase } = useCaseStore();
  const { lock, currentUser } = useAuthStore();

  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs]);

  const handleWipe = () => {
    const confirm1 = window.confirm("WARNING: You are about to initiate a forensic wipe. All intelligence data will be permanently overwritten. Proceed?");
    if (confirm1) {
      const confirm2 = window.prompt("Type 'WIPE' to confirm complete data destruction:");
      if (confirm2 === 'WIPE') {
        wipeDatabase();
        alert("All operational data has been destroyed.");
        navigate('/');
      } else {
        alert("Wipe aborted.");
      }
    }
  };

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}`;
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#0c0e14]">
      <div className="px-4 py-4 bg-[#14171f] border-b border-[#252a3a] pt-safe shadow-md z-10 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-mono text-[#dde1ec]">Administration</h1>
          <p className="text-[#7880a0] text-xs mt-1">Security & Audit Hub</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-[#7880a0] uppercase tracking-widest">Logged in as</p>
          <p className="text-sm font-bold text-[#3a7bd5]">{currentUser?.name || 'ADMIN'}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-8">
        
        {/* Security Controls */}
        <section>
          <h2 className="text-xs font-bold text-[#7880a0] uppercase tracking-widest mb-3 border-b border-[#252a3a] pb-1">Session Security</h2>
          <div className="space-y-3">
            <button 
              onClick={lock}
              className="w-full py-3 bg-[#1c2030] text-[#dde1ec] border border-[#454d66] rounded flex justify-between items-center px-4 hover:bg-[#252a3a]"
            >
              <span className="font-bold">Lock Application</span>
              <span>🔒</span>
            </button>
            
            <button 
              onClick={handleWipe}
              className="w-full py-3 bg-[#3d0000] text-[#e74c3c] border border-[#e74c3c] rounded flex justify-between items-center px-4 font-bold shadow-[0_0_15px_rgba(231,76,60,0.2)]"
            >
              <span>INITIATE KILL SWITCH (WIPE DATA)</span>
              <span>⚠️</span>
            </button>
          </div>
        </section>

        {/* Audit Ledger */}
        <section>
          <h2 className="text-xs font-bold text-[#7880a0] uppercase tracking-widest mb-3 border-b border-[#252a3a] pb-1 flex justify-between">
            <span>Immutable Audit Ledger</span>
            <span className="text-[#3a7bd5]">Latest 100</span>
          </h2>
          <div className="bg-[#14171f] border border-[#252a3a] rounded overflow-hidden">
            {auditLogs.length === 0 ? (
              <p className="p-4 text-center text-xs text-[#7880a0]">No audit records found.</p>
            ) : (
              <div className="divide-y divide-[#252a3a]">
                {auditLogs.map((log) => (
                  <div key={log.id} className="p-3">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[10px] font-mono text-[#3a7bd5]">{log.action}</span>
                      <span className="text-[9px] text-[#7880a0]">{formatDate(log.timestamp)}</span>
                    </div>
                    <p className="text-xs text-[#dde1ec] mb-1">{log.details}</p>
                    <p className="text-[9px] text-[#7880a0] font-mono">User ID: {log.user_id} | Target: {log.target_id?.substring(0,12)}...</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

      </div>
      <BottomTabBar />
    </div>
  );
};

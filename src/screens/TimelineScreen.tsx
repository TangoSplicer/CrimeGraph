import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCaseStore } from '../stores/caseStore';
import { BottomTabBar } from '../components/layout/BottomTabBar';

export const TimelineScreen: React.FC = () => {
  const navigate = useNavigate();
  const { graphElements, activeCaseId, cases } = useCaseStore();
  const activeCase = cases.find(c => c.id === activeCaseId);

  useEffect(() => {
    if (!activeCaseId) navigate('/');
  }, [activeCaseId, navigate]);

  // Sort elements chronologically
  const timelineEvents = [...graphElements].sort((a, b) => {
    const dateA = new Date(a.data.created_at || 0).getTime();
    const dateB = new Date(b.data.created_at || 0).getTime();
    return dateB - dateA; // Newest first
  });

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'Unknown Date';
    const d = new Date(isoString);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#0c0e14]">
      <div className="px-4 py-3 bg-[#14171f] border-b border-[#252a3a] pt-safe shadow-md">
        <h2 className="text-sm font-mono text-[#3a7bd5]">{activeCase?.reference_number}</h2>
        <p className="text-xs text-[#7880a0]">Intelligence Timeline</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {timelineEvents.map((el) => {
          const isEdge = !!el.data.source;
          return (
            <div key={el.data.id} className="relative pl-6 border-l-2 border-[#252a3a]">
              {/* Timeline dot */}
              <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-[#0c0e14] ${isEdge ? 'bg-[#7c4dbb]' : 'bg-[#1d9a6c]'}`} />
              
              <div className="bg-[#14171f] border border-[#252a3a] rounded p-3">
                <span className="text-[10px] font-mono text-[#7880a0] mb-1 block">
                  {formatDate(el.data.created_at)}
                </span>
                
                {isEdge ? (
                  <p className="text-[#dde1ec] text-sm">
                    Relationship established: <span className="font-bold text-[#3a7bd5]">{el.data.label}</span>
                  </p>
                ) : (
                  <div>
                    <p className="text-[#dde1ec] text-sm">
                      Entity added: <span className="font-bold">{el.data.label}</span>
                    </p>
                    <span className="text-[10px] uppercase text-[#7880a0] mt-1 block">
                      Type: {el.data.type?.replace('_', ' ')} • Conf: {el.data.confidence}/5
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        
        {timelineEvents.length === 0 && (
          <p className="text-center text-[#7880a0] mt-10 text-sm">No intelligence logged yet.</p>
        )}
      </div>
      <BottomTabBar />
    </div>
  );
};

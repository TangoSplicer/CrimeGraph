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

  const timelineTimestamp = (element: typeof graphElements[number]): { value?: string | null; basis: 'acquired' | 'observed' | 'recorded' } => {
    if (element.data.evidence?.acquiredAt) return { value: element.data.evidence.acquiredAt, basis: 'acquired' };
    if (element.data.occurred_at) return { value: element.data.occurred_at, basis: 'observed' };
    return { value: element.data.created_at, basis: 'recorded' };
  };

  // Prefer the time intelligence occurred or evidence was acquired over database insertion time.
  const timelineEvents = [...graphElements].sort((a, b) => {
    const dateA = new Date(timelineTimestamp(a).value || 0).getTime();
    const dateB = new Date(timelineTimestamp(b).value || 0).getTime();
    return dateB - dateA;
  });

  const formatDate = (isoString?: string | null) => {
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
          const timestamp = timelineTimestamp(el);
          return (
            <div key={el.data.id} className="relative pl-6 border-l-2 border-[#252a3a]">
              {/* Timeline dot */}
              <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-[#0c0e14] ${isEdge ? 'bg-[#7c4dbb]' : 'bg-[#1d9a6c]'}`} />
              
              <div className="bg-[#14171f] border border-[#252a3a] rounded p-3">
                <span className="text-[10px] font-mono text-[#7880a0] mb-1 block">
                  {formatDate(timestamp.value)} · {timestamp.basis}
                </span>
                
                {isEdge ? (
                  <p className="text-[#dde1ec] text-sm">
                    Relationship established: <span className="font-bold text-[#3a7bd5]">{el.data.label}</span>
                  </p>
                ) : (
                  <div>
                    <p className="text-[#dde1ec] text-sm">
                      {el.data.evidence ? 'Evidence registered:' : 'Entity recorded:'} <span className="font-bold">{el.data.label}</span>
                    </p>
                    <span className="text-[10px] uppercase text-[#7880a0] mt-1 block">
                      Type: {el.data.type?.replace('_', ' ')} • Conf: {el.data.confidence}/5{el.data.evidence ? ` • ${el.data.evidence.verificationStatus}` : ''}
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

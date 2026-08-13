import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomTabBar } from '../components/layout/BottomTabBar';
import { useAuthStore } from '../stores/authStore';
import { useCaseStore, type ReviewQueueItem } from '../stores/caseStore';
import { can } from '../utils/permissions';

export const SupervisorReviewScreen: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.currentUser);
  const { reviewQueue, loadReviewQueue, reviewNode, setActiveCase } = useCaseStore();
  const [notesByNode, setNotesByNode] = useState<Record<string, string>>({});
  const [savingNodeId, setSavingNodeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canReview = can(currentUser?.role, 'intelligence:review');

  useEffect(() => {
    if (!canReview) {
      navigate('/', { replace: true });
      return;
    }
    void loadReviewQueue().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'The review queue could not be loaded.'));
  }, [canReview, loadReviewQueue, navigate]);

  const openInWorkspace = (item: ReviewQueueItem) => {
    setActiveCase(item.caseId);
    navigate('/workspace');
  };

  const handleDecision = async (item: ReviewQueueItem, decision: 'approved' | 'returned') => {
    const notes = notesByNode[item.nodeId] || '';
    if (decision === 'returned' && !notes.trim()) {
      setError('A concise correction comment is required before returning an observation.');
      return;
    }
    setError(null);
    setSavingNodeId(item.nodeId);
    try {
      await reviewNode(item.nodeId, decision, notes);
      setNotesByNode((state) => {
        const next = { ...state };
        delete next[item.nodeId];
        return next;
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The supervisory decision could not be recorded.');
    } finally {
      setSavingNodeId(null);
    }
  };

  if (!canReview) return null;

  return (
    <div className="min-h-screen pb-20 bg-[#0c0e14] text-[#dde1ec]">
      <header className="px-4 py-4 bg-[#14171f] border-b border-[#252a3a] pt-safe">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#f39c12]">Supervisor console</p>
            <h1 className="mt-1 text-lg font-semibold">Intelligence review inbox</h1>
            <p className="mt-1 text-xs text-[#7880a0]">Review recorded observations; no automated person-level ranking is used.</p>
          </div>
          <div className="shrink-0 px-3 py-2 rounded border border-[#f39c12]/50 bg-[#f39c12]/10 text-center">
            <p className="text-[9px] uppercase font-bold text-[#f39c12]">Pending</p>
            <p className="text-xl leading-none font-mono text-[#dde1ec]">{reviewQueue.length}</p>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-3">
        {error && <div role="alert" className="border border-[#c0392b]/60 bg-[#c0392b]/10 text-[#ff9d95] text-xs rounded p-3">{error}</div>}
        {!error && reviewQueue.length === 0 && (
          <div className="mt-12 text-center border border-dashed border-[#454d66] rounded-lg p-6">
            <p className="text-sm font-medium text-[#dde1ec]">No pending intelligence requires review.</p>
            <p className="mt-2 text-xs text-[#7880a0]">New field observations and imported package records will appear here for an accountable decision.</p>
          </div>
        )}

        {reviewQueue.map((item) => {
          const isSaving = savingNodeId === item.nodeId;
          return (
            <article key={item.nodeId} className="bg-[#14171f] border border-[#252a3a] rounded-lg overflow-hidden">
              <div className="p-4 border-b border-[#252a3a]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button onClick={() => openInWorkspace(item)} className="text-left text-xs font-mono font-bold text-[#3a7bd5] hover:text-[#72a7f0]">{item.caseReference}</button>
                    <h2 className="mt-1 text-sm font-semibold break-words">{item.label}</h2>
                    <p className="mt-1 text-[10px] uppercase tracking-wider text-[#7880a0]">{item.nodeType.replace('_', ' ')}</p>
                  </div>
                  <button onClick={() => openInWorkspace(item)} className="shrink-0 px-2 py-1 text-[10px] font-bold uppercase rounded border border-[#454d66] text-[#dde1ec] hover:border-[#3a7bd5]">Inspect</button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                  <div className="rounded bg-[#0c0e14] p-2"><span className="block uppercase text-[#7880a0]">Submitted by</span><span className="font-mono text-[#dde1ec]">{item.submittedBy}</span></div>
                  <div className="rounded bg-[#0c0e14] p-2"><span className="block uppercase text-[#7880a0]">Submitted</span><span className="text-[#dde1ec]">{item.submittedAt ? new Date(item.submittedAt).toLocaleString() : 'Time unavailable'}</span></div>
                </div>
              </div>
              <div className="p-4">
                <label htmlFor={`review-note-${item.nodeId}`} className="block text-[10px] uppercase tracking-wider font-bold text-[#7880a0] mb-2">Decision note <span className="normal-case font-normal">(required for return)</span></label>
                <textarea
                  id={`review-note-${item.nodeId}`}
                  value={notesByNode[item.nodeId] || ''}
                  maxLength={2000}
                  disabled={isSaving}
                  onChange={(event) => setNotesByNode((state) => ({ ...state, [item.nodeId]: event.target.value }))}
                  placeholder="State the approval rationale or the precise correction required."
                  className="w-full min-h-20 bg-[#0c0e14] border border-[#454d66] rounded p-3 text-xs text-[#dde1ec] placeholder:text-[#5d657b] focus:outline-none focus:border-[#f39c12] disabled:opacity-50"
                />
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <button disabled={isSaving} onClick={() => void handleDecision(item, 'returned')} className="py-2.5 rounded border border-[#c0392b] text-[#ff9d95] text-xs font-bold uppercase disabled:opacity-40">Return for correction</button>
                  <button disabled={isSaving} onClick={() => void handleDecision(item, 'approved')} className="py-2.5 rounded bg-[#1d9a6c] text-white text-xs font-bold uppercase disabled:opacity-40">{isSaving ? 'Recording…' : 'Approve'}</button>
                </div>
              </div>
            </article>
          );
        })}
      </main>
      <BottomTabBar />
    </div>
  );
};

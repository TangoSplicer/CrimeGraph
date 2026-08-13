import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { GraphCanvas } from '../components/graph/GraphCanvas';
import { BottomTabBar } from '../components/layout/BottomTabBar';
import { BottomSheet } from '../components/shared/BottomSheet';
import { useCaseStore } from '../stores/caseStore';
import { useAuthStore } from '../stores/authStore';
import { can } from '../utils/permissions';
import { buildGraphInsights } from '../utils/graphInsights';
import { readEncryptedEvidenceMedia } from '../utils/secureMedia';

const entityTypes = ['person', 'vehicle', 'phone', 'location', 'event', 'digital_account', 'organisation', 'evidence'];

export const GraphWorkspaceScreen: React.FC = () => {
  const navigate = useNavigate();
  const { 
    graphElements, selectedNodeId, setSelectedNodeId, selectedEdgeId, setSelectedEdgeId,
    connectingFromId, setConnectingFromId, deleteNode, deleteEdge, updateNode, // 🚀 NEW updateNode
    activeCaseId, cases, exportActiveCase, hiddenNodeTypes, toggleFilter,
    notes, addNote, deleteNote
  } = useCaseStore();
  
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [taggedNodes, setTaggedNodes] = useState<string[]>([]);

  // 🚀 NEW: Edit Node State
  const [isEditingNode, setIsEditingNode] = useState(false);
  const [editLabel, setEditLabel] = useState('');
  const [editConfidence, setEditConfidence] = useState(3);
  const [editOccurredAt, setEditOccurredAt] = useState('');
  const [editAttributes, setEditAttributes] = useState<{key: string, value: string}[]>([]);
  const [selectedAttachmentPreview, setSelectedAttachmentPreview] = useState<string | null>(null);

  const currentUser = useAuthStore((state) => state.currentUser);
  const activeCase = cases.find(c => c.id === activeCaseId);
  const graphInsights = buildGraphInsights(graphElements, notes);
  const canCreateIntelligence = can(currentUser?.role, 'intelligence:create');
  const canUpdateIntelligence = can(currentUser?.role, 'intelligence:update');
  const canDeleteIntelligence = can(currentUser?.role, 'intelligence:delete');
  const canExportCase = can(currentUser?.role, 'case:export');

  useEffect(() => {
    if (!activeCaseId) navigate('/');
  }, [activeCaseId, navigate]);

  const selectedNode = graphElements.find(e => e.data.id === selectedNodeId);
  const selectedEdge = graphElements.find(e => e.data.id === selectedEdgeId);
  const canResubmitSelectedNode = Boolean(
    selectedNode?.data.review_status === 'returned'
    && selectedNode.data.submitted_by === currentUser?.badge
    && can(currentUser?.role, 'intelligence:resubmit'),
  );
  const canEditSelectedNode = canUpdateIntelligence || canResubmitSelectedNode;
  const getLabelForNode = (id: string) => graphElements.find(e => e.data.id === id)?.data.label || 'Unknown';

  useEffect(() => {
    const evidence = selectedNode?.data.evidence;
    if (!evidence?.attachmentUri || !evidence.attachmentMimeType.startsWith('image/')) {
      setSelectedAttachmentPreview(null);
      return;
    }
    let cancelled = false;
    readEncryptedEvidenceMedia(evidence.attachmentUri)
      .then((base64) => { if (!cancelled) setSelectedAttachmentPreview(`data:${evidence.attachmentMimeType};base64,${base64}`); })
      .catch(() => { if (!cancelled) setSelectedAttachmentPreview(Capacitor.convertFileSrc(evidence.attachmentUri)); });
    return () => { cancelled = true; };
  }, [selectedNode?.data.evidence?.attachmentMimeType, selectedNode?.data.evidence?.attachmentUri]);

  const handleStartConnection = () => { if (selectedNodeId) { setConnectingFromId(selectedNodeId); setSelectedNodeId(null); setIsEditingNode(false); } };
  const handleDeleteNode = () => { if (selectedNodeId && window.confirm('Permanently delete this intelligence node and connections?')) { deleteNode(selectedNodeId); setIsEditingNode(false); } };
  const handleDeleteEdge = () => { if (selectedEdgeId && window.confirm('Sever this relationship link?')) deleteEdge(selectedEdgeId); };
  const renderStars = (rating: number = 3) => '★'.repeat(rating) + '☆'.repeat(5 - rating);

  const handleAddNote = () => {
    if (!newNoteContent.trim()) return;
    addNote(newNoteContent, taggedNodes);
    setNewNoteContent(''); setTaggedNodes([]);
  };

  const toggleTagNode = (nodeId: string) => {
    setTaggedNodes(prev => prev.includes(nodeId) ? prev.filter(id => id !== nodeId) : [...prev, nodeId]);
  };

  // 🚀 NEW: Edit Handlers
  const handleStartEdit = () => {
    if (!selectedNode) return;
    setEditLabel(selectedNode.data.label);
    setEditConfidence(selectedNode.data.confidence || 3);
    setEditOccurredAt(selectedNode.data.occurred_at ? new Date(selectedNode.data.occurred_at).toISOString().slice(0, 16) : '');
    const attrs = selectedNode.data.attributes || {};
    setEditAttributes(Object.entries(attrs).map(([key, value]) => ({ key, value: String(value) })));
    setIsEditingNode(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedNodeId || !editLabel.trim()) return;
    const attrRecord: Record<string, string> = {};
    editAttributes.forEach(attr => {
      if (attr.key.trim() && attr.value.trim()) attrRecord[attr.key.trim()] = attr.value.trim();
    });
    await updateNode(selectedNodeId, editLabel.trim(), editConfidence, attrRecord, editOccurredAt);
    setIsEditingNode(false);
  };

  const handleAddEditAttribute = () => setEditAttributes([...editAttributes, { key: '', value: '' }]);
  const handleUpdateEditAttribute = (index: number, field: 'key'|'value', val: string) => {
    const newAttrs = [...editAttributes];
    newAttrs[index][field] = val;
    setEditAttributes(newAttrs);
  };
  const handleRemoveEditAttribute = (index: number) => setEditAttributes(editAttributes.filter((_, i) => i !== index));

  if (!activeCase) return null;

  return (
    <div className="flex flex-col w-full h-screen pb-16 bg-[#0c0e14] relative">
      <div className="px-4 py-3 bg-[#14171f] border-b border-[#252a3a] pt-safe z-20 flex justify-between items-center shadow-md">
        <div>
          <h2 className="text-sm font-mono text-[#3a7bd5]">{activeCase.reference_number}</h2>
          <p className="text-[10px] text-[#7880a0] truncate w-32">{activeCase.title}</p>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={() => { setIsAnalysisOpen(!isAnalysisOpen); setIsNotesOpen(false); setIsFilterOpen(false); }} className={`text-[10px] font-bold px-2 py-1 rounded border transition-colors ${isAnalysisOpen ? 'bg-[#2ecc71] text-[#0c0e14] border-[#2ecc71]' : 'border-[#454d66] text-[#dde1ec] bg-[#252a3a]'}`}>ANALYSIS</button>
          <button onClick={() => { setIsNotesOpen(!isNotesOpen); setIsFilterOpen(false); setIsAnalysisOpen(false); }} className={`text-[10px] font-bold px-2 py-1 rounded border transition-colors ${isNotesOpen ? 'bg-[#f39c12] text-white border-[#f39c12]' : 'border-[#454d66] text-[#dde1ec] bg-[#252a3a]'}`}>LOG ({notes.length})</button>
          <button onClick={() => { setIsFilterOpen(!isFilterOpen); setIsNotesOpen(false); setIsAnalysisOpen(false); }} className={`text-[10px] font-bold px-2 py-1 rounded border transition-colors ${hiddenNodeTypes.length > 0 ? 'bg-[#e74c3c] text-white border-[#e74c3c]' : 'border-[#454d66] text-[#dde1ec] bg-[#252a3a]'}`}>FILTERS {hiddenNodeTypes.length > 0 && `(${hiddenNodeTypes.length})`}</button>
          <button onClick={exportActiveCase} disabled={!canExportCase} className="text-[10px] font-bold px-2 py-1 rounded border border-[#3a7bd5] text-[#3a7bd5] hover:bg-[#3a7bd5] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed">EXPORT</button>
        </div>
      </div>

      {isFilterOpen && (
        <div className="absolute top-[60px] right-4 z-30 bg-[#1c2030] border border-[#252a3a] rounded-lg shadow-xl w-48 p-3 mt-safe">
          <h3 className="text-[10px] font-bold text-[#7880a0] uppercase tracking-widest mb-2 border-b border-[#252a3a] pb-1">Hide Entities</h3>
          <div className="space-y-2">
            {entityTypes.map(type => (
              <label key={type} className="flex items-center space-x-2 cursor-pointer">
                <input type="checkbox" checked={hiddenNodeTypes.includes(type)} onChange={() => toggleFilter(type)} className="rounded bg-[#0c0e14] border-[#454d66] text-[#e74c3c] focus:ring-[#e74c3c]" />
                <span className="text-xs text-[#dde1ec] capitalize">{type.replace('_', ' ')}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {isAnalysisOpen && (
        <div className="absolute top-[60px] right-4 z-30 bg-[#1c2030] border border-[#2ecc71]/60 rounded-lg shadow-xl w-72 p-3 mt-safe">
          <div className="flex justify-between items-center border-b border-[#252a3a] pb-2 mb-3">
            <h3 className="text-[10px] font-bold text-[#2ecc71] uppercase tracking-widest">Case Structure Analysis</h3>
            <span className="text-[9px] text-[#7880a0]">No person-level scoring</span>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-[#0c0e14] border border-[#252a3a] rounded p-2"><p className="text-[9px] text-[#7880a0] uppercase">Entities</p><p className="text-lg font-mono text-[#dde1ec]">{graphInsights.entityCount}</p></div>
            <div className="bg-[#0c0e14] border border-[#252a3a] rounded p-2"><p className="text-[9px] text-[#7880a0] uppercase">Links</p><p className="text-lg font-mono text-[#dde1ec]">{graphInsights.relationshipCount}</p></div>
            <div className="bg-[#0c0e14] border border-[#252a3a] rounded p-2"><p className="text-[9px] text-[#7880a0] uppercase">Evidence</p><p className="text-lg font-mono text-[#55c987]">{graphInsights.evidenceCount}</p></div>
            <div className="bg-[#0c0e14] border border-[#252a3a] rounded p-2"><p className="text-[9px] text-[#7880a0] uppercase">Review queue</p><p className="text-lg font-mono text-[#f39c12]">{graphInsights.evidenceRequiringReview}</p></div>
          </div>
          <div className="border-t border-[#252a3a] pt-2">
            <p className="text-[9px] text-[#7880a0] uppercase font-bold mb-1">Most connected entities</p>
            {graphInsights.mostConnected.length ? graphInsights.mostConnected.map(entity => <div key={entity.id} className="flex justify-between text-[10px] py-1"><span className="text-[#dde1ec] truncate max-w-[12rem]">{entity.label}</span><span className="text-[#2ecc71] font-mono">{entity.connections} links</span></div>) : <p className="text-[10px] text-[#7880a0] italic">No relationships recorded.</p>}
          </div>
          <div className="mt-3 border-t border-[#252a3a] pt-2 space-y-1 text-[9px] text-[#7880a0]">
            <p>Documentation cue: {graphInsights.notesWithoutLinks} note{graphInsights.notesWithoutLinks === 1 ? '' : 's'} without linked entities.</p>
            <p>Evidence cue: {graphInsights.evidenceWithoutCustody} evidence item{graphInsights.evidenceWithoutCustody === 1 ? '' : 's'} without custody notes.</p>
            <p>Chronology cue: {graphInsights.itemsWithoutObservedTime} entity or evidence item{graphInsights.itemsWithoutObservedTime === 1 ? '' : 's'} without an observed or acquired time.</p>
          </div>
        </div>
      )}

      {isNotesOpen && (
        <div className="absolute top-[50px] bottom-[60px] left-0 w-full md:w-96 z-30 bg-[#14171f] border-r border-[#252a3a] shadow-2xl flex flex-col mt-safe">
          <div className="p-4 border-b border-[#252a3a] bg-[#1a202c]">
            <h3 className="text-xs font-bold text-[#f39c12] uppercase tracking-widest mb-2">New Intelligence Note</h3>
            <textarea value={newNoteContent} onChange={e => setNewNoteContent(e.target.value)} placeholder="Draft narrative report..." className="w-full h-24 bg-[#0c0e14] border border-[#454d66] rounded p-2 text-xs text-[#dde1ec] focus:outline-none focus:border-[#f39c12] mb-2" />
            <div className="mb-2">
              <span className="text-[10px] text-[#7880a0] uppercase font-bold block mb-1">Tag Graph Entities:</span>
              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                {graphElements.filter(e => !e.data.source).map(node => (
                  <button key={node.data.id} onClick={() => toggleTagNode(node.data.id)} className={`text-[9px] px-2 py-1 rounded border ${taggedNodes.includes(node.data.id) ? 'bg-[#3a7bd5] text-white border-[#3a7bd5]' : 'bg-[#0c0e14] text-[#7880a0] border-[#454d66]'}`}>
                    {node.data.label}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={handleAddNote} disabled={!newNoteContent.trim() || !canCreateIntelligence} className="w-full bg-[#f39c12] hover:bg-[#e67e22] disabled:bg-[#252a3a] text-white font-bold py-2 rounded text-xs transition-colors">SUBMIT LOG ENTRY</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {notes.length === 0 && <p className="text-xs text-[#7880a0] italic text-center mt-4">No narrative logs recorded.</p>}
            {notes.map(note => (
              <div key={note.id} className="bg-[#1c2030] border border-[#252a3a] rounded p-3">
                <p className="text-xs text-[#dde1ec] mb-2 whitespace-pre-wrap">{note.content}</p>
                <div className="flex flex-wrap gap-1 mb-2">
                  {note.linked_nodes.map(nodeId => <span key={nodeId} className="text-[9px] px-1 py-0.5 bg-[#3a7bd5]/20 text-[#3a7bd5] border border-[#3a7bd5]/50 rounded">@{getLabelForNode(nodeId)}</span>)}
                </div>
                <div className="flex justify-between items-center border-t border-[#252a3a] pt-2">
                  <span className="text-[9px] text-[#7880a0] font-mono">{new Date(note.created_at).toLocaleString()}</span>
                  <button onClick={() => deleteNote(note.id)} className="text-[10px] text-[#c0392b] font-bold">DELETE</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {connectingFromId && (
        <div className="absolute top-[70px] left-4 right-4 z-20 bg-[#3a7bd5] text-white p-3 rounded shadow-lg flex justify-between items-center mt-safe">
          <span className="text-xs font-bold uppercase tracking-wide animate-pulse">Tap target node...</span>
          <button onClick={() => setConnectingFromId(null)} className="text-white border border-white/30 px-3 py-1 rounded text-xs">Cancel</button>
        </div>
      )}

      <div className="flex-1 relative overflow-hidden" onClick={() => { setIsFilterOpen(false); setIsNotesOpen(false); setIsAnalysisOpen(false); }}>
        <GraphCanvas />
        {!selectedNodeId && !selectedEdgeId && !connectingFromId && canCreateIntelligence && (
          <button onClick={() => navigate('/add')} className="absolute bottom-24 right-6 w-14 h-14 bg-[#3a7bd5] text-white rounded-full flex items-center justify-center text-3xl shadow-[0_4px_20px_rgba(58,123,213,0.6)] z-[100] active:scale-95 transition-all">
            +
          </button>
        )}
      </div>

      <BottomSheet isOpen={(!!selectedNodeId || !!selectedEdgeId) && !connectingFromId} onClose={() => { setSelectedNodeId(null); setSelectedEdgeId(null); setIsEditingNode(false); }} title={selectedNode ? (isEditingNode ? 'Edit Node' : selectedNode.data.label) : 'Relationship Details'}>
        
        {/* 🚀 NEW: Node Edit View */}
        {selectedNode && isEditingNode && (
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-[#7880a0] uppercase mb-1">Primary Identifier (Label)</label>
              <input type="text" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="w-full bg-[#0c0e14] border border-[#252a3a] rounded p-3 text-sm text-[#dde1ec] focus:outline-none focus:border-[#3a7bd5]" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#7880a0] uppercase mb-1">Confidence: {editConfidence}/5</label>
              <input type="range" min="1" max="5" value={editConfidence} onChange={(e) => setEditConfidence(parseInt(e.target.value))} className="w-full accent-[#3a7bd5]" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#7880a0] uppercase mb-1">Observed At</label>
              <input type="datetime-local" value={editOccurredAt} onChange={(e) => setEditOccurredAt(e.target.value)} className="w-full bg-[#0c0e14] border border-[#252a3a] rounded p-3 text-sm text-[#dde1ec] focus:outline-none focus:border-[#3a7bd5]" />
            </div>
            <div className="border-t border-[#252a3a] pt-4">
              <div className="flex justify-between items-center mb-3">
                <label className="text-[10px] font-bold text-[#7880a0] uppercase">Metadata</label>
                <button onClick={handleAddEditAttribute} className="text-[10px] font-bold text-[#3a7bd5]">+ ADD FIELD</button>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {editAttributes.map((attr, index) => (
                  <div key={index} className="flex space-x-2 items-center">
                    <input type="text" placeholder="Key" value={attr.key} onChange={(e) => handleUpdateEditAttribute(index, 'key', e.target.value)} className="w-1/3 bg-[#0c0e14] border border-[#252a3a] rounded p-2 text-xs text-[#dde1ec] focus:outline-none focus:border-[#3a7bd5]" />
                    <input type="text" placeholder="Value" value={attr.value} onChange={(e) => handleUpdateEditAttribute(index, 'value', e.target.value)} className="flex-1 bg-[#0c0e14] border border-[#252a3a] rounded p-2 text-xs text-[#dde1ec] focus:outline-none focus:border-[#3a7bd5]" />
                    <button onClick={() => handleRemoveEditAttribute(index)} className="text-[#c0392b] font-bold px-2">&times;</button>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex space-x-3 pt-4">
              <button onClick={() => setIsEditingNode(false)} className="flex-1 py-3 border border-[#454d66] text-[#dde1ec] rounded text-xs font-bold uppercase">Cancel</button>
              <button onClick={handleSaveEdit} disabled={!editLabel.trim()} className="flex-1 py-3 bg-[#3a7bd5] text-white rounded text-xs font-bold uppercase disabled:bg-[#252a3a]">Save Changes</button>
            </div>
          </div>
        )}

        {/* Standard Read-Only Node View */}
        {selectedNode && !isEditingNode && (
          <div className="space-y-6">
            <div className="flex justify-between items-center border-b border-[#252a3a] pb-4">
              <span className="text-[#7880a0] text-xs uppercase font-bold">Type</span>
              <span className="text-[#dde1ec] capitalize">{selectedNode.data.type?.replace('_', ' ')}</span>
            </div>
            <div className="flex justify-between items-center border-b border-[#252a3a] pb-4">
              <span className="text-[#7880a0] text-xs uppercase font-bold">Confidence</span>
              <span className="text-[#1d9a6c] font-mono text-lg">{renderStars(selectedNode.data.confidence)}</span>
            </div>
            {selectedNode.data.occurred_at && <div className="flex justify-between items-center border-b border-[#252a3a] py-4"><span className="text-[#7880a0] text-xs uppercase font-bold">Observed At</span><span className="text-[#dde1ec] text-xs text-right">{new Date(selectedNode.data.occurred_at).toLocaleString()}</span></div>}
            {selectedNode.data.review_status && selectedNode.data.review_status !== 'not_required' && (
              <section className="space-y-2 border-t border-[#f39c12]/40 pt-4 mb-4">
                <div className="flex justify-between items-center gap-3">
                  <h4 className="text-[10px] text-[#f39c12] uppercase font-bold tracking-widest">Submission review</h4>
                  <span className={`text-[9px] px-2 py-1 rounded uppercase font-bold ${selectedNode.data.review_status === 'approved' ? 'bg-[#1d9a6c]/20 text-[#55c987]' : selectedNode.data.review_status === 'returned' ? 'bg-[#c0392b]/20 text-[#ff9d95]' : 'bg-[#f39c12]/20 text-[#f7c86b]'}`}>{selectedNode.data.review_status}</span>
                </div>
                {selectedNode.data.submitted_by && <p className="text-[10px] text-[#9aa3bb]">Submitted by <span className="font-mono text-[#dde1ec]">{selectedNode.data.submitted_by}</span>{selectedNode.data.submitted_at ? ` · ${new Date(selectedNode.data.submitted_at).toLocaleString()}` : ''}</p>}
                {selectedNode.data.reviewed_by && <p className="text-[10px] text-[#9aa3bb]">Decision by <span className="font-mono text-[#dde1ec]">{selectedNode.data.reviewed_by}</span>{selectedNode.data.reviewed_at ? ` · ${new Date(selectedNode.data.reviewed_at).toLocaleString()}` : ''}</p>}
                {selectedNode.data.review_notes && <div className="rounded border border-[#454d66] bg-[#0c0e14] p-2"><p className="text-[9px] uppercase font-bold text-[#7880a0] mb-1">Supervisor feedback</p><p className="text-xs text-[#dde1ec] whitespace-pre-wrap">{selectedNode.data.review_notes}</p></div>}
                {canResubmitSelectedNode && <p className="text-[10px] text-[#f7c86b]">Correction is required. Use the edit action below to update and resubmit this observation.</p>}
              </section>
            )}
            {selectedNode.data.evidence && (
              <div className="space-y-2 border-t border-[#1a8a4a]/60 pt-4 mb-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-[10px] text-[#55c987] uppercase font-bold tracking-widest">Evidence Provenance</h4>
                  <span className="text-[9px] px-2 py-1 rounded bg-[#1a8a4a]/20 text-[#55c987] uppercase">{selectedNode.data.evidence.verificationStatus}</span>
                </div>
                {[
                  ['Exhibit', selectedNode.data.evidence.exhibitNumber],
                  ['Source', `${selectedNode.data.evidence.sourceType}: ${selectedNode.data.evidence.sourceReference}`],
                  ['Acquired', `${new Date(selectedNode.data.evidence.acquiredAt).toLocaleString()} · ${selectedNode.data.evidence.acquiredBy}`],
                  ['Handling', selectedNode.data.evidence.handlingStatus],
                  ['Recorded by', selectedNode.data.evidence.createdBy],
                ].map(([label, value]) => <div key={label} className="flex justify-between items-start border-b border-[#252a3a]/50 pb-2"><span className="text-xs text-[#7880a0] font-bold">{label}</span><span className="text-xs text-[#dde1ec] text-right ml-4 break-words max-w-[60%] capitalize">{value}</span></div>)}
                {selectedNode.data.evidence.chainOfCustody && <p className="text-[10px] text-[#9aa3bb] leading-relaxed pt-1">{selectedNode.data.evidence.chainOfCustody}</p>}
                {selectedNode.data.evidence.attachmentUri && <div className="border border-[#1a8a4a]/50 rounded p-2 mt-2"><p className="text-[9px] text-[#55c987] uppercase font-bold mb-2">Captured attachment</p>{selectedAttachmentPreview && <img src={selectedAttachmentPreview} alt={selectedNode.data.evidence.attachmentName} className="w-full max-h-44 object-cover rounded border border-[#252a3a] mb-2" />}<p className="text-[10px] text-[#dde1ec] break-all">{selectedNode.data.evidence.attachmentName}</p><p className="text-[9px] text-[#7880a0] break-all font-mono mt-1">SHA-256: {selectedNode.data.evidence.attachmentDigest}</p></div>}
                <p className="text-[9px] text-[#7880a0] font-mono break-all">Fingerprint: {selectedNode.data.evidence.fingerprint}</p>
              </div>
            )}
            <div className="space-y-2 border-t border-[#252a3a] pt-4 mb-4">
              <h4 className="text-[10px] text-[#3a7bd5] uppercase font-bold tracking-widest mb-3">Entity Metadata</h4>
              {selectedNode.data.attributes && Object.keys(selectedNode.data.attributes).length > 0 ? (
                Object.entries(selectedNode.data.attributes).map(([key, val]) => (
                  <div key={key} className="flex justify-between items-start border-b border-[#252a3a]/50 pb-2">
                    <span className="text-xs text-[#7880a0] capitalize font-bold">{key}</span>
                    <span className="text-xs font-mono text-[#dde1ec] text-right ml-4 break-words max-w-[60%]">{val as string}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-[#7880a0] italic">No metadata recorded.</p>
              )}
            </div>
            <div className="space-y-2 border-t border-[#252a3a] pt-4 mb-4">
              <h4 className="text-[10px] text-[#f39c12] uppercase font-bold tracking-widest mb-3">Linked Intelligence Logs</h4>
              {notes.filter(n => n.linked_nodes.includes(selectedNode.data.id)).length > 0 ? (
                notes.filter(n => n.linked_nodes.includes(selectedNode.data.id)).map(note => (
                   <div key={note.id} className="bg-[#1c2030] p-2 rounded border border-[#252a3a] text-xs text-[#dde1ec] mb-2 line-clamp-3">{note.content}</div>
                ))
              ) : (
                <p className="text-xs text-[#7880a0] italic">No logs associated.</p>
              )}
            </div>
            
            {/* 🚀 NEW: Edit Button Grid */}
            <div className="grid grid-cols-2 gap-3 pt-4 pb-4">
              <button onClick={handleStartConnection} disabled={!canCreateIntelligence} className="py-3 bg-[#3a7bd5] text-white text-xs font-bold rounded uppercase disabled:opacity-40">Connect</button>
              <button onClick={handleStartEdit} disabled={!canEditSelectedNode} className="py-3 bg-[#f39c12] text-white text-xs font-bold rounded uppercase disabled:opacity-40">{canResubmitSelectedNode ? 'Correct & resubmit' : 'Edit'}</button>
              <button onClick={handleDeleteNode} disabled={!canDeleteIntelligence} className="py-3 border border-[#c0392b] text-[#c0392b] text-xs font-bold rounded uppercase col-span-2 disabled:opacity-40">Delete Node</button>
            </div>
          </div>
        )}

        {selectedEdge && selectedEdge.data.source && selectedEdge.data.target && (
          <div className="space-y-6">
            <div className="bg-[#1c2030] border border-[#252a3a] rounded p-4 flex flex-col items-center space-y-3">
              <span className="text-[#dde1ec] font-mono text-xs text-center">{getLabelForNode(selectedEdge.data.source)}</span>
              <div className="flex flex-col items-center text-[#e74c3c]">
                <span className="text-[10px] font-bold uppercase mb-1">{selectedEdge.data.label}</span>
                <span>↓</span>
              </div>
              <span className="text-[#dde1ec] font-mono text-xs text-center">{getLabelForNode(selectedEdge.data.target)}</span>
            </div>
            <div className="pt-4 pb-4">
              <button onClick={handleDeleteEdge} disabled={!canDeleteIntelligence} className="w-full py-3 bg-[#c0392b] text-white font-bold rounded uppercase disabled:opacity-40">Sever Connection</button>
            </div>
          </div>
        )}
      </BottomSheet>
      <BottomTabBar />
    </div>
  );
};

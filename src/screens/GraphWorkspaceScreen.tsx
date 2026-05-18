import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraphCanvas } from '../components/graph/GraphCanvas';
import { BottomTabBar } from '../components/layout/BottomTabBar';
import { BottomSheet } from '../components/shared/BottomSheet';
import { useCaseStore } from '../stores/caseStore';

const entityTypes = ['person', 'vehicle', 'phone', 'location', 'event', 'digital_account', 'organisation', 'evidence'];

export const GraphWorkspaceScreen: React.FC = () => {
  const navigate = useNavigate();
  const { 
    graphElements, selectedNodeId, setSelectedNodeId, selectedEdgeId, setSelectedEdgeId,
    connectingFromId, setConnectingFromId, deleteNode, deleteEdge,
    activeCaseId, cases, exportActiveCase, hiddenNodeTypes, toggleFilter,
    notes, addNote, deleteNote // 🚀 NEW
  } = useCaseStore();
  
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false); // 🚀 NEW
  const [newNoteContent, setNewNoteContent] = useState(''); // 🚀 NEW
  const [taggedNodes, setTaggedNodes] = useState<string[]>([]); // 🚀 NEW

  const activeCase = cases.find(c => c.id === activeCaseId);

  useEffect(() => {
    if (!activeCaseId) navigate('/');
  }, [activeCaseId, navigate]);

  const selectedNode = graphElements.find(e => e.data.id === selectedNodeId);
  const selectedEdge = graphElements.find(e => e.data.id === selectedEdgeId);
  const getLabelForNode = (id: string) => graphElements.find(e => e.data.id === id)?.data.label || 'Unknown';

  const handleStartConnection = () => { if (selectedNodeId) { setConnectingFromId(selectedNodeId); setSelectedNodeId(null); } };
  const handleDeleteNode = () => { if (selectedNodeId && window.confirm('Permanently delete this intelligence node and connections?')) deleteNode(selectedNodeId); };
  const handleDeleteEdge = () => { if (selectedEdgeId && window.confirm('Sever this relationship link?')) deleteEdge(selectedEdgeId); };
  const renderStars = (rating: number = 3) => '★'.repeat(rating) + '☆'.repeat(5 - rating);

  // 🚀 NEW: Handle Note Submission
  const handleAddNote = () => {
    if (!newNoteContent.trim()) return;
    addNote(newNoteContent, taggedNodes);
    setNewNoteContent('');
    setTaggedNodes([]);
  };

  const toggleTagNode = (nodeId: string) => {
    setTaggedNodes(prev => prev.includes(nodeId) ? prev.filter(id => id !== nodeId) : [...prev, nodeId]);
  };

  if (!activeCase) return null;

  return (
    <div className="flex flex-col w-full h-screen pb-16 bg-[#0c0e14] relative">
      <div className="px-4 py-3 bg-[#14171f] border-b border-[#252a3a] pt-safe z-20 flex justify-between items-center shadow-md">
        <div>
          <h2 className="text-sm font-mono text-[#3a7bd5]">{activeCase.reference_number}</h2>
          <p className="text-[10px] text-[#7880a0] truncate w-32">{activeCase.title}</p>
        </div>
        <div className="flex items-center space-x-2">
          {/* 🚀 NEW: INTEL LOG BUTTON */}
          <button onClick={() => { setIsNotesOpen(!isNotesOpen); setIsFilterOpen(false); }} className={`text-[10px] font-bold px-2 py-1 rounded border transition-colors ${isNotesOpen ? 'bg-[#f39c12] text-white border-[#f39c12]' : 'border-[#454d66] text-[#dde1ec] bg-[#252a3a]'}`}>
            LOG ({notes.length})
          </button>
          
          <button onClick={() => { setIsFilterOpen(!isFilterOpen); setIsNotesOpen(false); }} className={`text-[10px] font-bold px-2 py-1 rounded border transition-colors ${hiddenNodeTypes.length > 0 ? 'bg-[#e74c3c] text-white border-[#e74c3c]' : 'border-[#454d66] text-[#dde1ec] bg-[#252a3a]'}`}>
            FILTERS {hiddenNodeTypes.length > 0 && `(${hiddenNodeTypes.length})`}
          </button>
          
          <button onClick={exportActiveCase} className="text-[10px] font-bold px-2 py-1 rounded border border-[#3a7bd5] text-[#3a7bd5] hover:bg-[#3a7bd5] hover:text-white transition-colors">EXPORT</button>
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

      {/* 🚀 NEW: Intelligence Log Slide-Over */}
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
            
            <button onClick={handleAddNote} disabled={!newNoteContent.trim()} className="w-full bg-[#f39c12] hover:bg-[#e67e22] disabled:bg-[#252a3a] text-white font-bold py-2 rounded text-xs transition-colors">
              SUBMIT LOG ENTRY
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {notes.length === 0 && <p className="text-xs text-[#7880a0] italic text-center mt-4">No narrative logs recorded.</p>}
            {notes.map(note => (
              <div key={note.id} className="bg-[#1c2030] border border-[#252a3a] rounded p-3">
                <p className="text-xs text-[#dde1ec] mb-2 whitespace-pre-wrap">{note.content}</p>
                <div className="flex flex-wrap gap-1 mb-2">
                  {note.linked_nodes.map(nodeId => (
                    <span key={nodeId} className="text-[9px] px-1 py-0.5 bg-[#3a7bd5]/20 text-[#3a7bd5] border border-[#3a7bd5]/50 rounded">@{getLabelForNode(nodeId)}</span>
                  ))}
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

      <div className="flex-1 relative overflow-hidden" onClick={() => { setIsFilterOpen(false); setIsNotesOpen(false); }}>
        <GraphCanvas />
        {!selectedNodeId && !selectedEdgeId && !connectingFromId && (
          <button onClick={() => navigate('/add')} className="absolute bottom-24 right-6 w-14 h-14 bg-[#3a7bd5] text-white rounded-full flex items-center justify-center text-3xl shadow-[0_4px_20px_rgba(58,123,213,0.6)] z-[100] active:scale-95 transition-all">
            +
          </button>
        )}
      </div>

      <BottomSheet isOpen={(!!selectedNodeId || !!selectedEdgeId) && !connectingFromId} onClose={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }} title={selectedNode ? selectedNode.data.label : 'Relationship Details'}>
        {selectedNode && (
          <div className="space-y-6">
            <div className="flex justify-between items-center border-b border-[#252a3a] pb-4">
              <span className="text-[#7880a0] text-xs uppercase font-bold">Type</span>
              <span className="text-[#dde1ec] capitalize">{selectedNode.data.type?.replace('_', ' ')}</span>
            </div>
            <div className="flex justify-between items-center border-b border-[#252a3a] pb-4">
              <span className="text-[#7880a0] text-xs uppercase font-bold">Confidence</span>
              <span className="text-[#1d9a6c] font-mono text-lg">{renderStars(selectedNode.data.confidence)}</span>
            </div>
            
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

            {/* 🚀 NEW: Show linked notes in the bottom sheet */}
            <div className="space-y-2 border-t border-[#252a3a] pt-4 mb-4">
              <h4 className="text-[10px] text-[#f39c12] uppercase font-bold tracking-widest mb-3">Linked Intelligence Logs</h4>
              {notes.filter(n => n.linked_nodes.includes(selectedNode.data.id)).length > 0 ? (
                notes.filter(n => n.linked_nodes.includes(selectedNode.data.id)).map(note => (
                   <div key={note.id} className="bg-[#1c2030] p-2 rounded border border-[#252a3a] text-xs text-[#dde1ec] mb-2 line-clamp-3">
                     {note.content}
                   </div>
                ))
              ) : (
                <p className="text-xs text-[#7880a0] italic">No logs associated.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 pb-4">
              <button onClick={handleStartConnection} className="py-3 bg-[#3a7bd5] text-white font-bold rounded hover:bg-[#4a8be5]">Draw Connection</button>
              <button onClick={handleDeleteNode} className="py-3 border border-[#c0392b] text-[#c0392b] font-bold rounded hover:bg-[#c0392b] hover:text-white">Delete Node</button>
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
              <button onClick={handleDeleteEdge} className="w-full py-3 bg-[#c0392b] text-white font-bold rounded hover:bg-[#a93226]">Sever Connection</button>
            </div>
          </div>
        )}
      </BottomSheet>
      <BottomTabBar />
    </div>
  );
};

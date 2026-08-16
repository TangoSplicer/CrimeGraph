import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { GraphCanvas } from '../components/graph/GraphCanvas';
import { BottomTabBar } from '../components/layout/BottomTabBar';
import { BottomSheet } from '../components/shared/BottomSheet';
import { useCaseStore } from '../stores/caseStore';
import { useAuthStore } from '../stores/authStore';
import { can } from '../utils/permissions';
import { buildGraphInsights, runExplainableLocalGraphQuery, searchCaseContent, type ExplainableGraphQueryResult } from '../utils/graphInsights';
import { readEncryptedEvidenceMedia } from '../utils/secureMedia';

const entityTypes = ['person', 'vehicle', 'phone', 'location', 'event', 'digital_account', 'organisation', 'evidence'];

export const GraphWorkspaceScreen: React.FC = () => {
  const navigate = useNavigate();
  const { 
    graphElements, selectedNodeId, setSelectedNodeId, selectedEdgeId, setSelectedEdgeId,
    connectingFromId, setConnectingFromId, deleteNode, deleteEdge, updateNode, // 🚀 NEW updateNode
    activeCaseId, cases, exportActiveCase, hiddenNodeTypes, toggleFilter,
    notes, addNote, deleteNote, dataMarkings, disclosureRecords, loadDataMarkings, addDataMarking, removeDataMarking, loadDisclosureRecords,
    playbookMilestones, loadPlaybookMilestones, createPlaybookMilestone, updatePlaybookMilestone,
    caseLeads, loadCaseLeads, createCaseLead, updateCaseLead, promoteCaseLead,
    evidenceDerivatives, loadEvidenceDerivatives, addEvidenceDerivative,
    savedGraphQueries, loadSavedGraphQueries, saveGraphQuery, deleteSavedGraphQuery
  } = useCaseStore();
  
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  const [isDossierOpen, setIsDossierOpen] = useState(false);
  const [newCaseMarking, setNewCaseMarking] = useState('');
  const [markingInstructions, setMarkingInstructions] = useState('');
  const [dossierMessage, setDossierMessage] = useState('');
  const [caseSearch, setCaseSearch] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [taggedNodes, setTaggedNodes] = useState<string[]>([]);
  const [isPlaybookOpen, setIsPlaybookOpen] = useState(false);
  const [isLeadRegisterOpen, setIsLeadRegisterOpen] = useState(false);
  const [workspaceMessage, setWorkspaceMessage] = useState('');
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [milestoneObjective, setMilestoneObjective] = useState('');
  const [milestoneCategory, setMilestoneCategory] = useState('Collection');
  const [milestoneOwnerRole, setMilestoneOwnerRole] = useState<'admin' | 'supervisor' | 'analyst' | 'field'>('analyst');
  const [milestoneDueAt, setMilestoneDueAt] = useState('');
  const [leadTitle, setLeadTitle] = useState('');
  const [leadSummary, setLeadSummary] = useState('');
  const [leadSourceType, setLeadSourceType] = useState('operator observation');
  const [leadSourceReference, setLeadSourceReference] = useState('');
  const [leadSensitivity, setLeadSensitivity] = useState('');
  const [leadReceivedAt, setLeadReceivedAt] = useState(new Date().toISOString().slice(0, 16));
  const [leadPromotionTypes, setLeadPromotionTypes] = useState<Record<string, string>>({});
  const [derivativeType, setDerivativeType] = useState<'annotation' | 'transcript_excerpt' | 'review_note' | 'redaction_instruction'>('annotation');
  const [derivativeLabel, setDerivativeLabel] = useState('');
  const [derivativeText, setDerivativeText] = useState('');
  const [derivativeStart, setDerivativeStart] = useState('');
  const [derivativeEnd, setDerivativeEnd] = useState('');
  const [derivativeMessage, setDerivativeMessage] = useState('');
  const [isSavedQueriesOpen, setIsSavedQueriesOpen] = useState(false);
  const [savedQueryName, setSavedQueryName] = useState('');
  const [savedQueryText, setSavedQueryText] = useState('');
  const [savedQueryTypes, setSavedQueryTypes] = useState<string[]>([]);
  const [savedQueryRelationships, setSavedQueryRelationships] = useState(true);
  const [savedQueryResults, setSavedQueryResults] = useState<ExplainableGraphQueryResult[]>([]);
  const [savedQueryMessage, setSavedQueryMessage] = useState('');

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
  const caseSearchResults = searchCaseContent(graphElements, notes, caseSearch);
  const canCreateIntelligence = can(currentUser?.role, 'intelligence:create');
  const canUpdateIntelligence = can(currentUser?.role, 'intelligence:update');
  const canDeleteIntelligence = can(currentUser?.role, 'intelligence:delete');
  const canExportCase = can(currentUser?.role, 'case:export');
  const canMarkCase = can(currentUser?.role, 'case:mark');
  const canPlanCase = can(currentUser?.role, 'case:plan');
  const canCreateLead = can(currentUser?.role, 'lead:create');
  const canManageLeads = can(currentUser?.role, 'lead:manage');
  const canRecordDerivatives = can(currentUser?.role, 'intelligence:update');

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
  const openQualityRecord = (id: string) => {
    const node = graphElements.find((element) => !element.data.source && element.data.id === id);
    const edge = graphElements.find((element) => element.data.source && element.data.id === id);
    if (node) { setSelectedNodeId(id); setIsAnalysisOpen(false); }
    else if (edge) { setSelectedEdgeId(id); setIsAnalysisOpen(false); }
    else if (notes.some((note) => note.id === id)) { setIsNotesOpen(true); setIsAnalysisOpen(false); }
  };

  useEffect(() => {
    const evidence = selectedNode?.data.evidence;
    if (evidence?.nodeId) loadEvidenceDerivatives(evidence.nodeId).catch((error) => setDerivativeMessage(error instanceof Error ? error.message : 'Derivative ledger is unavailable.'));
    else { setDerivativeMessage(''); }
  }, [selectedNode?.data.evidence?.nodeId, loadEvidenceDerivatives]);

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

  const handleAddCaseMarking = async () => {
    if (!activeCaseId || !newCaseMarking.trim()) return;
    try {
      await addDataMarking('case', activeCaseId, newCaseMarking, markingInstructions);
      setNewCaseMarking('');
      setMarkingInstructions('');
      setDossierMessage('Case marking applied and recorded in the audit ledger.');
    } catch (error) {
      setDossierMessage(error instanceof Error ? error.message : 'Marking could not be applied.');
    }
  };

  const handleRemoveCaseMarking = async (markingId: string) => {
    try {
      await removeDataMarking(markingId);
      setDossierMessage('Case marking removed and recorded in the audit ledger.');
    } catch (error) {
      setDossierMessage(error instanceof Error ? error.message : 'Marking could not be removed.');
    }
  };

  const openDossierControls = () => {
    if (!activeCaseId) return;
    setIsDossierOpen(true);
    setDossierMessage('');
    if (canMarkCase) loadDataMarkings(activeCaseId).catch((error) => setDossierMessage(error instanceof Error ? error.message : 'Markings are unavailable.'));
    if (canExportCase) loadDisclosureRecords(activeCaseId).catch((error) => setDossierMessage(error instanceof Error ? error.message : 'Disclosure history is unavailable.'));
  };

  const openPlaybook = () => {
    if (!activeCaseId) return;
    setWorkspaceMessage('');
    setIsPlaybookOpen(true);
    loadPlaybookMilestones(activeCaseId).catch((error) => setWorkspaceMessage(error instanceof Error ? error.message : 'Case playbook is unavailable.'));
  };

  const openLeadRegister = () => {
    if (!activeCaseId) return;
    setWorkspaceMessage('');
    setIsLeadRegisterOpen(true);
    loadCaseLeads(activeCaseId).catch((error) => setWorkspaceMessage(error instanceof Error ? error.message : 'Local lead register is unavailable.'));
  };

  const handleCreateMilestone = async () => {
    if (!activeCaseId) return;
    try {
      await createPlaybookMilestone(activeCaseId, milestoneTitle, milestoneObjective, milestoneCategory, milestoneOwnerRole, milestoneDueAt);
      setMilestoneTitle(''); setMilestoneObjective(''); setMilestoneDueAt('');
      setWorkspaceMessage('Case playbook milestone recorded locally.');
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : 'Milestone could not be created.');
    }
  };

  const handleMilestoneStatus = async (milestoneId: string, status: 'in_progress' | 'blocked' | 'complete') => {
    const note = status === 'in_progress' ? '' : window.prompt(status === 'blocked' ? 'State the blocker (5+ characters):' : 'Record the completion note (5+ characters):') || '';
    try {
      await updatePlaybookMilestone(milestoneId, status, note);
      setWorkspaceMessage(`Milestone ${status.replace('_', ' ')} and audited.`);
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : 'Milestone state could not be updated.');
    }
  };

  const handleCreateLead = async () => {
    if (!activeCaseId) return;
    try {
      await createCaseLead(activeCaseId, leadTitle, leadSummary, leadSourceType, leadSourceReference, leadSensitivity, leadReceivedAt);
      setLeadTitle(''); setLeadSummary(''); setLeadSourceReference(''); setLeadSensitivity(''); setLeadReceivedAt(new Date().toISOString().slice(0, 16));
      setWorkspaceMessage('Local lead recorded with its stated source.');
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : 'Lead could not be recorded.');
    }
  };

  const handleLeadDisposition = async (leadId: string, status: 'under_review' | 'actioned' | 'closed') => {
    const note = status === 'under_review' ? '' : window.prompt(status === 'actioned' ? 'Record the action taken (5+ characters):' : 'Record the closure disposition (5+ characters):') || '';
    try {
      await updateCaseLead(leadId, status, note);
      setWorkspaceMessage(`Lead marked ${status.replace('_', ' ')} and audited.`);
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : 'Lead disposition could not be updated.');
    }
  };

  const handlePromoteLead = async (leadId: string) => {
    const type = leadPromotionTypes[leadId] || 'event';
    try {
      await promoteCaseLead(leadId, type, 3);
      setWorkspaceMessage('Lead promoted to a linked intelligence record. Review the source metadata before relying on it.');
    } catch (error) {
      setWorkspaceMessage(error instanceof Error ? error.message : 'Lead could not be promoted.');
    }
  };

  const openSavedQueries = () => {
    if (!activeCaseId) return;
    setSavedQueryMessage(''); setSavedQueryResults([]); setIsSavedQueriesOpen(true);
    loadSavedGraphQueries(activeCaseId).catch((error) => setSavedQueryMessage(error instanceof Error ? error.message : 'Saved local queries are unavailable.'));
  };

  const toggleSavedQueryType = (nodeType: string) => setSavedQueryTypes((current) => current.includes(nodeType) ? current.filter((type) => type !== nodeType) : [...current, nodeType]);

  const handleSaveGraphQuery = async () => {
    if (!activeCaseId) return;
    try {
      await saveGraphQuery(activeCaseId, savedQueryName, savedQueryText, savedQueryTypes, savedQueryRelationships);
      setSavedQueryName(''); setSavedQueryText(''); setSavedQueryTypes([]); setSavedQueryRelationships(true);
      setSavedQueryMessage('Saved local query recorded with its exact filters.');
    } catch (error) {
      setSavedQueryMessage(error instanceof Error ? error.message : 'Saved local query could not be recorded.');
    }
  };

  const handleRunSavedQuery = (query: { name: string; queryText: string; nodeTypes: string[]; includeRelationships: boolean }) => {
    try {
      setSavedQueryResults(runExplainableLocalGraphQuery(graphElements, { queryText: query.queryText, nodeTypes: query.nodeTypes, includeRelationships: query.includeRelationships }));
      setSavedQueryMessage(`Ran “${query.name}” locally. Each result explains its match.`);
    } catch (error) {
      setSavedQueryResults([]);
      setSavedQueryMessage(error instanceof Error ? error.message : 'Saved local query could not run.');
    }
  };

  const handleAddEvidenceDerivative = async () => {
    const evidenceNodeId = selectedNode?.data.evidence?.nodeId;
    if (!evidenceNodeId) return;
    try {
      await addEvidenceDerivative(evidenceNodeId, derivativeType, derivativeLabel, derivativeText, derivativeStart, derivativeEnd);
      setDerivativeLabel(''); setDerivativeText(''); setDerivativeStart(''); setDerivativeEnd('');
      setDerivativeMessage('Operator-authored ledger record added. The source evidence was not changed.');
    } catch (error) {
      setDerivativeMessage(error instanceof Error ? error.message : 'Derivative ledger record could not be added.');
    }
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
    <div className="flex flex-col w-full h-screen pb-safe-nav bg-[#0c0e14] relative">
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
        <div className="absolute top-[60px] right-4 z-30 max-h-[calc(100vh-9rem)] overflow-y-auto bg-[#1c2030] border border-[#2ecc71]/60 rounded-lg shadow-xl w-72 p-3 mt-safe">
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
          <div className="mt-3 border-t border-[#252a3a] pt-2">
            <p className="mb-2 text-[9px] font-bold uppercase text-[#55c987]">Explainable quality workbench</p>
            <div className="space-y-2">{graphInsights.qualityFindings.length === 0 ? <p className="text-[10px] italic text-[#7880a0]">No configured quality cues are present.</p> : graphInsights.qualityFindings.map((finding) => <button key={finding.id} onClick={() => openQualityRecord(finding.affectedIds[0])} className="w-full rounded border border-[#454d66] bg-[#0c0e14] p-2 text-left"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold text-[#dde1ec]">{finding.title}</span><span className={`text-[9px] font-bold uppercase ${finding.severity === 'attention' ? 'text-[#f7c86b]' : 'text-[#72a7f0]'}`}>{finding.severity}</span></div><p className="mt-1 text-[9px] leading-relaxed text-[#9aa3bb]">{finding.explanation}</p></button>)}</div>
          </div>
          <div className="mt-3 border-t border-[#252a3a] pt-2">
            <label className="mb-1 block text-[9px] font-bold uppercase text-[#55c987]">Local case search</label>
            <input value={caseSearch} onChange={(event) => setCaseSearch(event.target.value)} placeholder="Search entities, notes, evidence…" className="w-full rounded border border-[#454d66] bg-[#0c0e14] p-2 text-[10px] text-white focus:border-[#55c987] focus:outline-none" />
            {caseSearch.trim().length > 0 && <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">{caseSearch.trim().length < 2 ? <p className="text-[9px] text-[#7880a0]">Enter at least two characters.</p> : caseSearchResults.length === 0 ? <p className="text-[9px] italic text-[#7880a0]">No local records match this query.</p> : caseSearchResults.map((result) => <button key={`${result.kind}:${result.id}`} onClick={() => openQualityRecord(result.id)} className="w-full rounded border border-[#454d66] bg-[#0c0e14] p-2 text-left"><p className="text-[10px] font-bold text-[#dde1ec]">{result.title}</p><p className="mt-1 text-[9px] text-[#7880a0]">{result.kind} · {result.summary}</p></button>)}</div>}
          </div>
          {canUpdateIntelligence && <button onClick={openSavedQueries} className="mt-3 w-full rounded border border-[#55c987] py-2 text-[10px] font-bold uppercase text-[#55c987]">Saved local queries</button>}
          {canPlanCase && <button onClick={openPlaybook} className="mt-2 w-full rounded border border-[#3a7bd5] py-2 text-[10px] font-bold uppercase text-[#72a7f0]">Case playbook</button>}
          {(canCreateLead || canManageLeads) && <button onClick={openLeadRegister} className="mt-2 w-full rounded border border-[#f39c12] py-2 text-[10px] font-bold uppercase text-[#f7c86b]">Local lead register</button>}
          {(canMarkCase || canExportCase) && <button onClick={openDossierControls} className="mt-2 w-full rounded border border-[#b893e6] py-2 text-[10px] font-bold uppercase text-[#d8c8ff]">Dossier and marking controls</button>}
        </div>
      )}

      {isPlaybookOpen && (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/80 p-4">
          <section role="dialog" aria-modal="true" aria-label="Case playbook" className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-lg border border-[#3a7bd5] bg-[#14171f] p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3 border-b border-[#252a3a] pb-3"><div><h2 className="text-sm font-bold uppercase tracking-widest text-[#72a7f0]">Case playbook</h2><p className="mt-1 text-[10px] leading-relaxed text-[#7880a0]">Milestones record accountable work, evidence links, and blockers. They are not productivity or outcome scores.</p></div><button onClick={() => setIsPlaybookOpen(false)} className="text-xs font-bold uppercase text-[#7880a0]">Close</button></div>
            <div className="space-y-3">{canPlanCase && <section className="space-y-2 rounded border border-[#3a7bd5]/50 bg-[#0c0e14] p-3"><p className="text-[10px] font-bold uppercase tracking-widest text-[#72a7f0]">New milestone</p><input value={milestoneTitle} onChange={(event) => setMilestoneTitle(event.target.value)} maxLength={160} placeholder="Milestone title" className="w-full rounded border border-[#454d66] bg-[#14171f] p-2 text-xs text-white focus:border-[#3a7bd5] focus:outline-none" /><textarea value={milestoneObjective} onChange={(event) => setMilestoneObjective(event.target.value)} maxLength={1000} placeholder="Objective and verifiable outcome" className="min-h-20 w-full rounded border border-[#454d66] bg-[#14171f] p-2 text-xs text-white focus:border-[#3a7bd5] focus:outline-none" /><div className="grid grid-cols-2 gap-2"><input value={milestoneCategory} onChange={(event) => setMilestoneCategory(event.target.value)} maxLength={80} placeholder="Category" className="rounded border border-[#454d66] bg-[#14171f] p-2 text-xs text-white focus:border-[#3a7bd5] focus:outline-none" /><select value={milestoneOwnerRole} onChange={(event) => setMilestoneOwnerRole(event.target.value as typeof milestoneOwnerRole)} className="rounded border border-[#454d66] bg-[#14171f] p-2 text-xs text-white focus:border-[#3a7bd5] focus:outline-none"><option value="analyst">Analyst</option><option value="supervisor">Supervisor</option><option value="field">Field</option><option value="admin">Admin</option></select></div><label className="block text-[10px] font-bold uppercase text-[#7880a0]">Due window <span className="normal-case font-normal">(optional)</span><input type="datetime-local" value={milestoneDueAt} onChange={(event) => setMilestoneDueAt(event.target.value)} className="mt-1 w-full rounded border border-[#454d66] bg-[#14171f] p-2 text-xs text-white focus:border-[#3a7bd5] focus:outline-none" /></label><button onClick={handleCreateMilestone} disabled={milestoneTitle.trim().length < 3 || milestoneObjective.trim().length < 5 || milestoneCategory.trim().length < 2} className="w-full rounded bg-[#3a7bd5] py-2 text-[10px] font-bold uppercase text-white disabled:opacity-40">Add milestone</button></section>}{playbookMilestones.length === 0 ? <p className="py-3 text-center text-xs italic text-[#7880a0]">No playbook milestones are recorded for this case.</p> : playbookMilestones.map((milestone) => <article key={milestone.id} className="rounded border border-[#252a3a] bg-[#0c0e14] p-3"><div className="flex justify-between gap-3"><div><h3 className="text-xs font-bold text-[#dde1ec]">{milestone.title}</h3><p className="mt-1 text-[9px] uppercase text-[#72a7f0]">{milestone.category} · {milestone.ownerRole} · {milestone.status.replace('_', ' ')}</p></div>{milestone.dueAt && <span className="text-[9px] text-[#f7c86b]">Due {new Date(milestone.dueAt).toLocaleString()}</span>}</div><p className="mt-2 text-[10px] leading-relaxed text-[#9aa3bb]">{milestone.objective}</p>{milestone.status === 'blocked' && <p className="mt-2 rounded border border-[#c0392b]/60 bg-[#c0392b]/10 p-2 text-[10px] text-[#ff9d95]">Blocker: {milestone.blockerReason}</p>}{milestone.status === 'complete' && <p className="mt-2 rounded border border-[#1d9a6c]/60 bg-[#1d9a6c]/10 p-2 text-[10px] text-[#55c987]">Completion: {milestone.completionNote}</p>}{canPlanCase && milestone.status !== 'complete' && <div className="mt-3 grid grid-cols-3 gap-2"><button onClick={() => handleMilestoneStatus(milestone.id, 'in_progress')} className="rounded border border-[#3a7bd5] py-2 text-[9px] font-bold uppercase text-[#72a7f0]">Start</button><button onClick={() => handleMilestoneStatus(milestone.id, 'blocked')} className="rounded border border-[#c0392b] py-2 text-[9px] font-bold uppercase text-[#ff9d95]">Block</button><button onClick={() => handleMilestoneStatus(milestone.id, 'complete')} className="rounded bg-[#1d9a6c] py-2 text-[9px] font-bold uppercase text-white">Complete</button></div>}</article>)}</div>
            {workspaceMessage && <p role="status" className="mt-4 text-[10px] font-bold text-[#72a7f0]">{workspaceMessage}</p>}
          </section>
        </div>
      )}

      {isLeadRegisterOpen && (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/80 p-4">
          <section role="dialog" aria-modal="true" aria-label="Local lead register" className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-lg border border-[#f39c12] bg-[#14171f] p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3 border-b border-[#252a3a] pb-3"><div><h2 className="text-sm font-bold uppercase tracking-widest text-[#f7c86b]">Local lead register</h2><p className="mt-1 text-[10px] leading-relaxed text-[#7880a0]">Local leads retain their stated source and are promoted only by an authorized operator’s deliberate action.</p></div><button onClick={() => setIsLeadRegisterOpen(false)} className="text-xs font-bold uppercase text-[#7880a0]">Close</button></div>
            <div className="space-y-3">{canCreateLead && <section className="space-y-2 rounded border border-[#f39c12]/50 bg-[#0c0e14] p-3"><p className="text-[10px] font-bold uppercase tracking-widest text-[#f7c86b]">Record local lead</p><input value={leadTitle} onChange={(event) => setLeadTitle(event.target.value)} maxLength={160} placeholder="Lead title" className="w-full rounded border border-[#454d66] bg-[#14171f] p-2 text-xs text-white focus:border-[#f39c12] focus:outline-none" /><textarea value={leadSummary} onChange={(event) => setLeadSummary(event.target.value)} maxLength={3000} placeholder="Factual summary; distinguish observation from interpretation" className="min-h-20 w-full rounded border border-[#454d66] bg-[#14171f] p-2 text-xs text-white focus:border-[#f39c12] focus:outline-none" /><div className="grid grid-cols-2 gap-2"><input value={leadSourceType} onChange={(event) => setLeadSourceType(event.target.value)} maxLength={80} placeholder="Source type" className="rounded border border-[#454d66] bg-[#14171f] p-2 text-xs text-white focus:border-[#f39c12] focus:outline-none" /><input value={leadSourceReference} onChange={(event) => setLeadSourceReference(event.target.value)} maxLength={240} placeholder="Source reference" className="rounded border border-[#454d66] bg-[#14171f] p-2 text-xs text-white focus:border-[#f39c12] focus:outline-none" /></div><div className="grid grid-cols-2 gap-2"><input value={leadSensitivity} onChange={(event) => setLeadSensitivity(event.target.value.toUpperCase())} maxLength={80} placeholder="Sensitivity marking (optional)" className="rounded border border-[#454d66] bg-[#14171f] p-2 text-xs text-white focus:border-[#f39c12] focus:outline-none" /><input type="datetime-local" value={leadReceivedAt} onChange={(event) => setLeadReceivedAt(event.target.value)} className="rounded border border-[#454d66] bg-[#14171f] p-2 text-xs text-white focus:border-[#f39c12] focus:outline-none" /></div><button onClick={handleCreateLead} disabled={leadTitle.trim().length < 3 || leadSummary.trim().length < 5 || !leadSourceType.trim() || !leadSourceReference.trim()} className="w-full rounded bg-[#f39c12] py-2 text-[10px] font-bold uppercase text-white disabled:opacity-40">Record lead</button></section>}{caseLeads.length === 0 ? <p className="py-3 text-center text-xs italic text-[#7880a0]">No local leads are recorded for this case.</p> : caseLeads.map((lead) => <article key={lead.id} className="rounded border border-[#252a3a] bg-[#0c0e14] p-3"><div className="flex justify-between gap-3"><div><h3 className="text-xs font-bold text-[#dde1ec]">{lead.title}</h3><p className="mt-1 text-[9px] uppercase text-[#f7c86b]">{lead.status.replace('_', ' ')} · {lead.sourceType}</p></div><span className="text-[9px] text-[#7880a0]">{new Date(lead.receivedAt).toLocaleString()}</span></div><p className="mt-2 whitespace-pre-wrap text-[10px] leading-relaxed text-[#9aa3bb]">{lead.summary}</p><p className="mt-2 text-[9px] text-[#7880a0]">Source: {lead.sourceReference}{lead.sensitivityMarking ? ` · ${lead.sensitivityMarking}` : ''}</p>{lead.dispositionNote && <p className="mt-2 rounded border border-[#454d66] bg-[#14171f] p-2 text-[10px] text-[#dde1ec]">{lead.dispositionNote}</p>}{canManageLeads && lead.status !== 'promoted' && <div className="mt-3 space-y-2"><div className="grid grid-cols-3 gap-2"><button onClick={() => handleLeadDisposition(lead.id, 'under_review')} className="rounded border border-[#3a7bd5] py-2 text-[9px] font-bold uppercase text-[#72a7f0]">Review</button><button onClick={() => handleLeadDisposition(lead.id, 'actioned')} className="rounded border border-[#1d9a6c] py-2 text-[9px] font-bold uppercase text-[#55c987]">Actioned</button><button onClick={() => handleLeadDisposition(lead.id, 'closed')} className="rounded border border-[#c0392b] py-2 text-[9px] font-bold uppercase text-[#ff9d95]">Close</button></div><div className="grid grid-cols-[1fr_auto] gap-2"><select value={leadPromotionTypes[lead.id] || 'event'} onChange={(event) => setLeadPromotionTypes((current) => ({ ...current, [lead.id]: event.target.value }))} className="rounded border border-[#454d66] bg-[#14171f] p-2 text-xs text-white focus:border-[#f39c12] focus:outline-none">{entityTypes.filter((type) => type !== 'evidence').map((type) => <option key={type} value={type}>{type.replace('_', ' ')}</option>)}</select><button onClick={() => handlePromoteLead(lead.id)} className="rounded bg-[#f39c12] px-3 py-2 text-[9px] font-bold uppercase text-white">Promote</button></div></div>}{lead.status === 'promoted' && <p className="mt-3 text-[10px] font-bold text-[#55c987]">Promoted to local intelligence record {lead.promotedNodeId}.</p>}</article>)}</div>
            {workspaceMessage && <p role="status" className="mt-4 text-[10px] font-bold text-[#f7c86b]">{workspaceMessage}</p>}
          </section>
        </div>
      )}

      {isSavedQueriesOpen && (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/80 p-4">
          <section role="dialog" aria-modal="true" aria-label="Saved local graph queries" className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-lg border border-[#55c987] bg-[#14171f] p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3 border-b border-[#252a3a] pb-3"><div><h2 className="text-sm font-bold uppercase tracking-widest text-[#55c987]">Saved local queries</h2><p className="mt-1 text-[10px] leading-relaxed text-[#7880a0]">Saved queries preserve only explicit local filters. Results explain their match; there is no hidden ranking, prediction, or person-level score.</p></div><button onClick={() => setIsSavedQueriesOpen(false)} className="text-xs font-bold uppercase text-[#7880a0]">Close</button></div>
            <section className="space-y-2 rounded border border-[#55c987]/50 bg-[#0c0e14] p-3"><p className="text-[10px] font-bold uppercase tracking-widest text-[#55c987]">New local query</p><input value={savedQueryName} onChange={(event) => setSavedQueryName(event.target.value)} maxLength={120} placeholder="Query name" className="w-full rounded border border-[#454d66] bg-[#14171f] p-2 text-xs text-white focus:border-[#55c987] focus:outline-none" /><input value={savedQueryText} onChange={(event) => setSavedQueryText(event.target.value)} maxLength={240} placeholder="Optional text filter (two or more characters)" className="w-full rounded border border-[#454d66] bg-[#14171f] p-2 text-xs text-white focus:border-[#55c987] focus:outline-none" /><div><p className="mb-1 text-[9px] font-bold uppercase text-[#7880a0]">Entity-type filters <span className="normal-case font-normal">(optional when text is present)</span></p><div className="flex flex-wrap gap-1">{entityTypes.map((type) => <button key={type} onClick={() => toggleSavedQueryType(type)} className={`rounded border px-2 py-1 text-[9px] ${savedQueryTypes.includes(type) ? 'border-[#55c987] bg-[#1d9a6c]/20 text-[#55c987]' : 'border-[#454d66] text-[#7880a0]'}`}>{type.replace('_', ' ')}</button>)}</div></div><label className="flex items-center gap-2 text-[10px] text-[#dde1ec]"><input type="checkbox" checked={savedQueryRelationships} onChange={(event) => setSavedQueryRelationships(event.target.checked)} className="rounded border-[#454d66] bg-[#14171f] text-[#55c987]" /> Include directly connected relationships</label><button onClick={handleSaveGraphQuery} disabled={savedQueryName.trim().length < 3 || (savedQueryText.trim().length === 0 && savedQueryTypes.length === 0) || (savedQueryText.trim().length > 0 && savedQueryText.trim().length < 2)} className="w-full rounded bg-[#1d9a6c] py-2 text-[10px] font-bold uppercase text-white disabled:opacity-40">Save explicit local query</button></section>
            <section className="mt-4 space-y-2"><p className="text-[10px] font-bold uppercase tracking-widest text-[#55c987]">Saved filters</p>{savedGraphQueries.length === 0 ? <p className="text-xs italic text-[#7880a0]">No local graph queries are saved for this case.</p> : savedGraphQueries.map((query) => <article key={query.id} className="rounded border border-[#252a3a] bg-[#0c0e14] p-3"><div className="flex justify-between gap-3"><div><h3 className="text-xs font-bold text-[#dde1ec]">{query.name}</h3><p className="mt-1 text-[9px] text-[#7880a0]">Text: {query.queryText || 'none'} · Types: {query.nodeTypes.length ? query.nodeTypes.join(', ') : 'all'} · Relationships: {query.includeRelationships ? 'included' : 'excluded'}</p></div><button onClick={() => deleteSavedGraphQuery(query.id).then(() => { setSavedQueryResults([]); setSavedQueryMessage('Saved local query deleted and audited.'); }).catch((error) => setSavedQueryMessage(error instanceof Error ? error.message : 'Saved local query could not be deleted.'))} className="text-[9px] font-bold uppercase text-[#ff9d95]">Delete</button></div><button onClick={() => handleRunSavedQuery(query)} className="mt-3 w-full rounded border border-[#55c987] py-2 text-[9px] font-bold uppercase text-[#55c987]">Run locally</button></article>)}</section>
            {savedQueryResults.length > 0 && <section className="mt-4 space-y-2 border-t border-[#252a3a] pt-3"><p className="text-[10px] font-bold uppercase tracking-widest text-[#55c987]">Explainable results ({savedQueryResults.length})</p>{savedQueryResults.map((result) => <button key={`${result.kind}:${result.id}`} onClick={() => openQualityRecord(result.id)} className="w-full rounded border border-[#454d66] bg-[#0c0e14] p-3 text-left"><p className="text-[10px] font-bold text-[#dde1ec]">{result.title}</p><p className="mt-1 text-[9px] text-[#7880a0]">{result.kind} · {result.summary}</p><ul className="mt-2 list-disc pl-4 text-[9px] leading-relaxed text-[#55c987]">{result.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></button>)}</section>}
            {savedQueryMessage && <p role="status" className="mt-4 text-[10px] font-bold text-[#55c987]">{savedQueryMessage}</p>}
          </section>
        </div>
      )}

      {isNotesOpen && (
        <div className="absolute top-[50px] bottom-safe-nav left-0 w-full md:w-96 z-30 bg-[#14171f] border-r border-[#252a3a] shadow-2xl flex flex-col mt-safe">
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
          <button onClick={() => navigate('/add')} className="absolute bottom-safe-nav mb-4 right-6 w-14 h-14 bg-[#3a7bd5] text-white rounded-full flex items-center justify-center text-3xl shadow-[0_4px_20px_rgba(58,123,213,0.6)] z-[100] active:scale-95 transition-all">
            +
          </button>
        )}
      </div>

      <BottomSheet isOpen={isDossierOpen} onClose={() => setIsDossierOpen(false)} title="Dossier and disclosure controls">
        <div className="space-y-5">
          <section className="rounded border border-[#b893e6]/60 bg-[#1c2030] p-3">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#d8c8ff]">Case markings</h4>
            <p className="mt-1 text-[10px] leading-relaxed text-[#7880a0]">Markings are retained on the source case and copied into each forensic dossier manifest. Redactions apply only to the exported projection.</p>
            {canMarkCase && <div className="mt-3 space-y-2"><input value={newCaseMarking} onChange={(event) => setNewCaseMarking(event.target.value.toUpperCase())} maxLength={64} placeholder="MARKING (e.g. PERSONAL_DATA)" className="w-full rounded border border-[#454d66] bg-[#0c0e14] p-3 text-xs text-white focus:border-[#b893e6] focus:outline-none" /><textarea value={markingInstructions} onChange={(event) => setMarkingInstructions(event.target.value)} maxLength={500} placeholder="Handling instructions (optional)" className="w-full min-h-20 rounded border border-[#454d66] bg-[#0c0e14] p-3 text-xs text-white focus:border-[#b893e6] focus:outline-none" /><button onClick={handleAddCaseMarking} disabled={!newCaseMarking.trim()} className="w-full rounded bg-[#b893e6] py-2.5 text-xs font-bold uppercase text-[#0c0e14] disabled:opacity-40">Apply case marking</button></div>}
            <div className="mt-3 space-y-2">{dataMarkings.length === 0 ? <p className="text-[10px] italic text-[#7880a0]">No markings are recorded for this operation.</p> : dataMarkings.filter((marking) => marking.objectType === 'case').map((marking) => <div key={marking.id} className="rounded border border-[#454d66] bg-[#0c0e14] p-2"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[10px] font-bold text-[#dde1ec]">{marking.marking}</p>{marking.handlingInstructions && <p className="mt-1 text-[10px] text-[#9aa3bb]">{marking.handlingInstructions}</p>}</div>{canMarkCase && <button onClick={() => handleRemoveCaseMarking(marking.id)} className="text-[9px] font-bold uppercase text-[#ff9d95]">Remove</button>}</div><p className="mt-1 text-[9px] text-[#7880a0]">{marking.createdBy} · {new Date(marking.createdAt).toLocaleString()}</p></div>)}</div>
          </section>
          <section className="rounded border border-[#3a7bd5]/60 bg-[#1c2030] p-3">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#72a7f0]">Disclosure register</h4>
            <p className="mt-1 text-[10px] leading-relaxed text-[#7880a0]">A dossier is created from the EXPORT control after integrity verification and is recorded here with its recipient purpose and manifest fingerprint.</p>
            <div className="mt-3 space-y-2">{disclosureRecords.length === 0 ? <p className="text-[10px] italic text-[#7880a0]">No forensic dossiers have been recorded for this operation.</p> : disclosureRecords.map((record) => <div key={record.id} className="rounded border border-[#454d66] bg-[#0c0e14] p-2"><div className="flex justify-between gap-3"><p className="text-[10px] font-bold text-[#dde1ec]">{record.recipientDescription}</p><span className={`text-[9px] font-bold uppercase ${record.status === 'shared' ? 'text-[#55c987]' : 'text-[#f7c86b]'}`}>{record.status}</span></div><p className="mt-1 text-[10px] text-[#9aa3bb]">{record.purpose}</p><p className="mt-1 break-all font-mono text-[9px] text-[#7880a0]">Manifest: {record.manifestDigest}</p><p className="mt-1 text-[9px] text-[#7880a0]">{record.disclosedBy} · {new Date(record.disclosedAt).toLocaleString()}{record.authorizationReference ? ` · ${record.authorizationReference}` : ''}</p></div>)}</div>
          </section>
          {dossierMessage && <p role="status" className="text-[10px] font-bold text-[#d8c8ff]">{dossierMessage}</p>}
        </div>
      </BottomSheet>

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
                <section className="mt-3 space-y-2 rounded border border-[#b893e6]/50 bg-[#0c0e14] p-3">
                  <div className="flex items-start justify-between gap-3"><div><h5 className="text-[9px] font-bold uppercase tracking-widest text-[#d8c8ff]">Derivative and annotation ledger</h5><p className="mt-1 text-[9px] leading-relaxed text-[#7880a0]">Operator-authored context only. These entries never modify the source evidence, attachment, provenance, or source digest.</p></div><span className="rounded border border-[#b893e6]/50 px-2 py-1 text-[9px] font-mono text-[#d8c8ff]">{evidenceDerivatives.filter((entry) => entry.parentNodeId === selectedNode.data.evidence?.nodeId).length}</span></div>
                  {evidenceDerivatives.filter((entry) => entry.parentNodeId === selectedNode.data.evidence?.nodeId).length === 0 ? <p className="text-[10px] italic text-[#7880a0]">No operator-authored derivative or annotation records.</p> : <div className="max-h-48 space-y-2 overflow-y-auto">{evidenceDerivatives.filter((entry) => entry.parentNodeId === selectedNode.data.evidence?.nodeId).map((entry) => <article key={entry.id} className="rounded border border-[#454d66] bg-[#14171f] p-2"><div className="flex justify-between gap-2"><span className="text-[10px] font-bold text-[#dde1ec]">{entry.label}</span><span className="text-[9px] uppercase text-[#d8c8ff]">{entry.recordType.replace('_', ' ')}</span></div><p className="mt-1 whitespace-pre-wrap text-[10px] leading-relaxed text-[#9aa3bb]">{entry.annotationText}</p>{(entry.timecodeStartSeconds !== null || entry.timecodeEndSeconds !== null) && <p className="mt-1 text-[9px] font-mono text-[#7880a0]">Timecode: {entry.timecodeStartSeconds ?? '–'}s to {entry.timecodeEndSeconds ?? '–'}s</p>}<p className="mt-1 text-[9px] text-[#7880a0]">{entry.createdBy} · {new Date(entry.createdAt).toLocaleString()}</p><p className="mt-1 break-all text-[8px] font-mono text-[#5d6682]">Record SHA-256: {entry.recordDigest}</p></article>)}</div>}
                  {canRecordDerivatives && <div className="mt-3 space-y-2 border-t border-[#454d66] pt-3"><select value={derivativeType} onChange={(event) => setDerivativeType(event.target.value as typeof derivativeType)} className="w-full rounded border border-[#454d66] bg-[#14171f] p-2 text-xs text-white focus:border-[#b893e6] focus:outline-none"><option value="annotation">Annotation</option><option value="transcript_excerpt">Transcript excerpt</option><option value="review_note">Review note</option><option value="redaction_instruction">Redaction instruction</option></select><input value={derivativeLabel} onChange={(event) => setDerivativeLabel(event.target.value)} maxLength={160} placeholder="Record label" className="w-full rounded border border-[#454d66] bg-[#14171f] p-2 text-xs text-white focus:border-[#b893e6] focus:outline-none" /><textarea value={derivativeText} onChange={(event) => setDerivativeText(event.target.value)} maxLength={8000} placeholder="Operator-authored context; do not state a conclusion as a source fact" className="min-h-20 w-full rounded border border-[#454d66] bg-[#14171f] p-2 text-xs text-white focus:border-[#b893e6] focus:outline-none" /><div className="grid grid-cols-2 gap-2"><label className="text-[9px] font-bold uppercase text-[#7880a0]">Start seconds<input type="number" min="0" max="604800" step="0.001" value={derivativeStart} onChange={(event) => setDerivativeStart(event.target.value)} placeholder="Optional" className="mt-1 w-full rounded border border-[#454d66] bg-[#14171f] p-2 text-xs text-white focus:border-[#b893e6] focus:outline-none" /></label><label className="text-[9px] font-bold uppercase text-[#7880a0]">End seconds<input type="number" min="0" max="604800" step="0.001" value={derivativeEnd} onChange={(event) => setDerivativeEnd(event.target.value)} placeholder="Optional" className="mt-1 w-full rounded border border-[#454d66] bg-[#14171f] p-2 text-xs text-white focus:border-[#b893e6] focus:outline-none" /></label></div><button onClick={handleAddEvidenceDerivative} disabled={derivativeLabel.trim().length < 3 || derivativeText.trim().length < 3} className="w-full rounded border border-[#b893e6] py-2 text-[10px] font-bold uppercase text-[#d8c8ff] disabled:opacity-40">Add immutable ledger record</button></div>}
                  {derivativeMessage && <p role="status" className="text-[10px] font-bold text-[#d8c8ff]">{derivativeMessage}</p>}
                </section>
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

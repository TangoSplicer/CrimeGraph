import { sha256Hex } from './forensicDossier';
import type { GraphElement, IntelNote } from '../stores/caseStore';

export interface BriefingBuildInput {
  caseReference: string;
  caseTitle: string;
  classification: string;
  title: string;
  purpose: string;
  nodeIds: string[];
  noteIds: string[];
  createdBy: string;
  createdAt: string;
  graphElements: GraphElement[];
  notes: IntelNote[];
}

export interface ReproducibleBriefing {
  markdown: string;
  contentDigest: string;
  selectedNodeIds: string[];
  selectedNoteIds: string[];
}

const clean = (value: string, limit: number): string => value.replace(/[\r\n]+/g, ' ').trim().slice(0, limit);

export const buildReproducibleBriefing = async (input: BriefingBuildInput): Promise<ReproducibleBriefing> => {
  const title = clean(input.title, 160);
  const purpose = clean(input.purpose, 500);
  if (title.length < 3) throw new Error('Briefing title must contain at least three characters.');
  if (purpose.length < 5) throw new Error('Briefing purpose must contain at least five characters.');
  const nodesById = new Map(input.graphElements.filter((element) => !element.data.source && !element.data.target).map((node) => [node.data.id, node]));
  const notesById = new Map(input.notes.map((note) => [note.id, note]));
  const selectedNodeIds = [...new Set(input.nodeIds)].filter((id) => nodesById.has(id)).sort();
  const selectedNoteIds = [...new Set(input.noteIds)].filter((id) => notesById.has(id)).sort();
  if (!selectedNodeIds.length && !selectedNoteIds.length) throw new Error('Select at least one local intelligence record or note for the briefing.');
  const selectedNodes = selectedNodeIds.map((id) => nodesById.get(id)!);
  const selectedNotes = selectedNoteIds.map((id) => notesById.get(id)!);
  const canonical = {
    version: 'crimegraph-briefing-v1', case_reference: clean(input.caseReference, 80), case_title: clean(input.caseTitle, 160), classification: clean(input.classification, 80),
    title, purpose, created_by: clean(input.createdBy, 120), created_at: input.createdAt,
    nodes: selectedNodes.map((node) => ({ id: node.data.id, label: node.data.label, type: node.data.type || 'entity', occurred_at: node.data.occurred_at || null, attributes: node.data.attributes || {}, evidence: node.data.evidence ? { exhibit_number: node.data.evidence.exhibitNumber, source_reference: node.data.evidence.sourceReference, fingerprint: node.data.evidence.fingerprint, attachment_digest: node.data.evidence.attachmentDigest || null } : null })),
    notes: selectedNotes.map((note) => ({ id: note.id, content: note.content, linked_nodes: [...note.linked_nodes].sort(), created_at: note.created_at })),
  };
  const contentDigest = await sha256Hex(canonical);
  const lines = [
    `# ${canonical.title}`,
    '',
    `**Case:** ${canonical.case_reference} — ${canonical.case_title}`,
    `**Classification:** ${canonical.classification}`,
    `**Purpose:** ${canonical.purpose}`,
    `**Prepared by:** ${canonical.created_by}`,
    `**Prepared at:** ${canonical.created_at}`,
    `**Content SHA-256:** ${contentDigest}`,
    '',
    '## Selected intelligence records',
    '',
    ...selectedNodes.flatMap((node) => [`### ${node.data.label}`, `- **Record ID:** ${node.data.id}`, `- **Type:** ${node.data.type || 'entity'}`, `- **Observed time:** ${node.data.occurred_at || 'Not recorded'}`, ...(node.data.evidence ? [`- **Exhibit:** ${node.data.evidence.exhibitNumber}`, `- **Source reference:** ${node.data.evidence.sourceReference}`, `- **Provenance fingerprint:** ${node.data.evidence.fingerprint}`, `- **Attachment digest:** ${node.data.evidence.attachmentDigest || 'Not recorded'}`] : []), '']),
    '## Selected intelligence notes',
    '',
    ...selectedNotes.flatMap((note) => [`### Note ${note.id}`, note.content, `Linked record IDs: ${note.linked_nodes.join(', ') || 'None'}`, '']),
    '> This briefing is a deterministic presentation of explicitly selected local records. It does not validate sources, infer conclusions, rank people, or authorize dissemination.',
  ];
  return { markdown: lines.join('\n'), contentDigest, selectedNodeIds, selectedNoteIds };
};

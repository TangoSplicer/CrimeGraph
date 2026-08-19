import type { CaseLead, CasePlaybookMilestone, FieldTask, GraphElement, IntelNote } from '../stores/caseStore';

export type CaseReadinessSeverity = 'attention' | 'information';
export type CaseReadinessCategory = 'review' | 'evidence' | 'playbook' | 'lead' | 'field-task' | 'documentation';

export interface CaseReadinessFinding {
  id: string;
  severity: CaseReadinessSeverity;
  category: CaseReadinessCategory;
  title: string;
  explanation: string;
  affectedIds: string[];
}

export interface CaseReadinessReport {
  generatedAt: string;
  findings: CaseReadinessFinding[];
  attentionCount: number;
  informationCount: number;
}

export interface CaseReadinessInput {
  graphElements: GraphElement[];
  notes: IntelNote[];
  milestones: CasePlaybookMilestone[];
  leads: CaseLead[];
  fieldTasks: FieldTask[];
  now?: Date;
}

const isPastDue = (value: string | null, now: Date): boolean => {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed < now.getTime();
};

const uniqueSorted = (ids: string[]): string[] => [...new Set(ids)].sort();

/**
 * Produces local, explainable workflow cues. It deliberately contains no
 * weights, aggregate score, prioritisation, prediction, or person-level logic.
 */
export const buildCaseReadiness = (input: CaseReadinessInput): CaseReadinessReport => {
  const now = input.now || new Date();
  const findings: CaseReadinessFinding[] = [];
  const nodes = input.graphElements.filter((element) => !element.data.source && !element.data.target);

  const pendingReview = nodes.filter((node) => node.data.review_status === 'pending');
  if (pendingReview.length) {
    findings.push({
      id: 'pending-review', severity: 'attention', category: 'review',
      title: 'Submitted intelligence awaits review',
      explanation: `${pendingReview.length} local record${pendingReview.length === 1 ? ' is' : 's are'} awaiting an authorized review decision.`,
      affectedIds: uniqueSorted(pendingReview.map((node) => node.data.id)),
    });
  }

  const returnedReview = nodes.filter((node) => node.data.review_status === 'returned');
  if (returnedReview.length) {
    findings.push({
      id: 'returned-review', severity: 'attention', category: 'review',
      title: 'Returned intelligence requires correction or resubmission',
      explanation: `${returnedReview.length} local record${returnedReview.length === 1 ? ' has' : 's have'} been returned with a review decision.`,
      affectedIds: uniqueSorted(returnedReview.map((node) => node.data.id)),
    });
  }

  const evidenceWithoutProvenance = nodes.filter((node) => node.data.type === 'evidence' && !node.data.evidence);
  if (evidenceWithoutProvenance.length) {
    findings.push({
      id: 'evidence-without-provenance', severity: 'attention', category: 'evidence',
      title: 'Evidence records lack provenance details',
      explanation: `${evidenceWithoutProvenance.length} evidence node${evidenceWithoutProvenance.length === 1 ? ' does' : 's do'} not contain a registered provenance record.`,
      affectedIds: uniqueSorted(evidenceWithoutProvenance.map((node) => node.data.id)),
    });
  }

  const unlinkedNotes = input.notes.filter((note) => note.linked_nodes.length === 0);
  if (unlinkedNotes.length) {
    findings.push({
      id: 'unlinked-notes', severity: 'information', category: 'documentation',
      title: 'Notes are not linked to intelligence records',
      explanation: `${unlinkedNotes.length} local note${unlinkedNotes.length === 1 ? ' has' : 's have'} no linked node. Linkage can make later review easier but is not required.`,
      affectedIds: uniqueSorted(unlinkedNotes.map((note) => note.id)),
    });
  }

  input.milestones.filter((milestone) => milestone.status === 'blocked').forEach((milestone) => {
    findings.push({
      id: `blocked-milestone:${milestone.id}`, severity: 'attention', category: 'playbook',
      title: `Blocked milestone: ${milestone.title}`,
      explanation: milestone.blockerReason ? `Recorded blocker: ${milestone.blockerReason}` : 'This milestone is marked blocked and needs a recorded resolution path.',
      affectedIds: [milestone.id],
    });
  });

  input.milestones.filter((milestone) => milestone.status !== 'complete' && isPastDue(milestone.dueAt, now)).forEach((milestone) => {
    findings.push({
      id: `overdue-milestone:${milestone.id}`, severity: 'attention', category: 'playbook',
      title: `Due window elapsed: ${milestone.title}`,
      explanation: `The recorded due window (${new Date(milestone.dueAt!).toLocaleString()}) has passed while this milestone remains ${milestone.status.replace('_', ' ')}.`,
      affectedIds: [milestone.id],
    });
  });

  const openLeads = input.leads.filter((lead) => lead.status === 'new' || lead.status === 'under_review');
  if (openLeads.length) {
    findings.push({
      id: 'open-leads', severity: 'information', category: 'lead',
      title: 'Local leads remain open',
      explanation: `${openLeads.length} local lead${openLeads.length === 1 ? ' remains' : 's remain'} new or under review. This is a record of state, not a priority recommendation.`,
      affectedIds: uniqueSorted(openLeads.map((lead) => lead.id)),
    });
  }

  input.fieldTasks.filter((task) => task.status === 'unable').forEach((task) => {
    findings.push({
      id: `unable-field-task:${task.id}`, severity: 'attention', category: 'field-task',
      title: `Field task returned: ${task.title}`,
      explanation: task.inabilityReason ? `Recorded reason: ${task.inabilityReason}` : 'The assigned field task is recorded as unable to complete.',
      affectedIds: [task.id],
    });
  });

  input.fieldTasks.filter((task) => task.status === 'assigned' && isPastDue(task.dueAt, now)).forEach((task) => {
    findings.push({
      id: `overdue-field-task:${task.id}`, severity: 'information', category: 'field-task',
      title: `Field task due window elapsed: ${task.title}`,
      explanation: `The recorded due window (${new Date(task.dueAt!).toLocaleString()}) has passed while this task remains assigned.`,
      affectedIds: [task.id],
    });
  });

  const orderedFindings = findings.sort((left, right) =>
    left.severity.localeCompare(right.severity) || left.category.localeCompare(right.category) || left.title.localeCompare(right.title),
  );
  return {
    generatedAt: now.toISOString(),
    findings: orderedFindings,
    attentionCount: orderedFindings.filter((finding) => finding.severity === 'attention').length,
    informationCount: orderedFindings.filter((finding) => finding.severity === 'information').length,
  };
};

import { describe, expect, it } from 'vitest';
import { buildCaseReadiness } from './caseReadiness';
import type { CaseLead, CasePlaybookMilestone, FieldTask, GraphElement, IntelNote } from '../stores/caseStore';

const node = (id: string, type: string, reviewStatus = 'not_required'): GraphElement => ({
  data: { id, label: id, type, review_status: reviewStatus as GraphElement['data']['review_status'], created_at: '2026-08-19T10:00:00.000Z' },
});

const milestone = (overrides: Partial<CasePlaybookMilestone> = {}): CasePlaybookMilestone => ({
  id: 'milestone-1', caseId: 'case-1', title: 'Verify collection source', objective: 'Record the stated source.', category: 'Collection', ownerRole: 'analyst', status: 'blocked', dueAt: null, linkedObjectIds: [], blockerReason: 'Source contact unavailable.', completionNote: '', createdBy: 'ANALYST-1', createdAt: '2026-08-18T10:00:00.000Z', updatedBy: 'ANALYST-1', updatedAt: '2026-08-18T10:00:00.000Z', completedBy: null, completedAt: null,
  ...overrides,
});

const lead = (overrides: Partial<CaseLead> = {}): CaseLead => ({
  id: 'lead-1', caseId: 'case-1', title: 'Local observation', summary: 'A stated observation requiring review.', sourceType: 'operator observation', sourceReference: 'NOTE-1', receivedAt: '2026-08-18T10:00:00.000Z', sensitivityMarking: '', status: 'new', dispositionNote: '', promotedNodeId: null, promotedBy: null, promotedAt: null, createdBy: 'FIELD-1', createdAt: '2026-08-18T10:00:00.000Z', updatedBy: 'FIELD-1', updatedAt: '2026-08-18T10:00:00.000Z',
  ...overrides,
});

const task = (overrides: Partial<FieldTask> = {}): FieldTask => ({
  id: 'task-1', caseId: 'case-1', assigneeId: 'field-1', assigneeBadge: 'FIELD-1', assigneeName: 'Field Operator', title: 'Recover exhibit', objective: 'Recover the sealed exhibit.', checklist: [], contextNote: '', dueAt: null, status: 'unable', createdBy: 'ANALYST-1', createdAt: '2026-08-18T10:00:00.000Z', completedBy: 'FIELD-1', completedAt: '2026-08-18T12:00:00.000Z', completionNote: '', inabilityReason: 'Location was inaccessible.',
  ...overrides,
});

describe('explainable case readiness', () => {
  it('surfaces exact local workflow causes without a score or recommendation', () => {
    const notes: IntelNote[] = [{ id: 'note-1', case_id: 'case-1', content: 'Unlinked note', linked_nodes: [], created_at: '2026-08-19T10:00:00.000Z' }];
    const report = buildCaseReadiness({
      graphElements: [node('pending-1', 'event', 'pending'), node('returned-1', 'event', 'returned'), node('evidence-1', 'evidence')],
      notes,
      milestones: [milestone()],
      leads: [lead()],
      fieldTasks: [task()],
      now: new Date('2026-08-19T12:00:00.000Z'),
    });

    expect(report.attentionCount).toBe(5);
    expect(report.informationCount).toBe(2);
    expect(report.findings.map((finding) => finding.id)).toEqual(expect.arrayContaining([
      'pending-review', 'returned-review', 'evidence-without-provenance', 'blocked-milestone:milestone-1', 'open-leads', 'unable-field-task:task-1', 'unlinked-notes',
    ]));
    expect(report).not.toHaveProperty('score');
    expect(report).not.toHaveProperty('ranking');
    expect(report.findings.every((finding) => finding.category && finding.affectedIds.length > 0)).toBe(true);
    expect(report.findings.find((finding) => finding.id === 'blocked-milestone:milestone-1')?.explanation).toContain('Source contact unavailable.');
  });

  it('reports elapsed due windows deterministically while completed milestones stay out of the cue set', () => {
    const report = buildCaseReadiness({
      graphElements: [], notes: [], leads: [],
      milestones: [
        milestone({ id: 'overdue-milestone', status: 'in_progress', dueAt: '2026-08-19T11:00:00.000Z', blockerReason: '' }),
        milestone({ id: 'complete-milestone', status: 'complete', dueAt: '2026-08-19T11:00:00.000Z', blockerReason: '', completionNote: 'Completed.' }),
      ],
      fieldTasks: [task({ id: 'overdue-task', status: 'assigned', dueAt: '2026-08-19T11:00:00.000Z', inabilityReason: '' })],
      now: new Date('2026-08-19T12:00:00.000Z'),
    });

    expect(report.findings.map((finding) => finding.id)).toEqual(expect.arrayContaining(['overdue-milestone:overdue-milestone', 'overdue-field-task:overdue-task']));
    expect(report.findings.map((finding) => finding.id)).not.toContain('overdue-milestone:complete-milestone');
  });
});

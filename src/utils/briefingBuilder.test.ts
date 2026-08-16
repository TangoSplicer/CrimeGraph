import { beforeEach, describe, expect, it } from 'vitest';
import { buildReproducibleBriefing } from './briefingBuilder';

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true });
});

const input = {
  caseReference: 'CASE-001', caseTitle: 'Test operation', classification: 'OFFICIAL', title: 'Disclosure summary', purpose: 'Authorized review of selected local records.', createdBy: 'SUP-001', createdAt: '2026-08-16T10:00:00.000Z',
  graphElements: [{ data: { id: 'node-1', label: 'Recovered handset', type: 'evidence', occurred_at: '2026-08-15T09:00:00.000Z', attributes: { IMEI: '123' } } }],
  notes: [{ id: 'note-1', case_id: 'case-1', content: 'Operator note.', linked_nodes: ['node-1'], created_at: '2026-08-15T10:00:00.000Z' }],
};

describe('reproducible briefing builder', () => {
  it('builds a deterministic selected-record briefing with a content digest', async () => {
    const first = await buildReproducibleBriefing({ ...input, nodeIds: ['node-1'], noteIds: ['note-1'] });
    const second = await buildReproducibleBriefing({ ...input, nodeIds: ['node-1'], noteIds: ['note-1'] });

    expect(first.contentDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(first.contentDigest).toBe(second.contentDigest);
    expect(first.markdown).toContain('Recovered handset');
    expect(first.markdown).toContain('does not validate sources, infer conclusions, rank people');
  });

  it('rejects an empty selection rather than creating a generalised case narrative', async () => {
    await expect(buildReproducibleBriefing({ ...input, nodeIds: [], noteIds: [] })).rejects.toThrow('Select at least one');
  });
});

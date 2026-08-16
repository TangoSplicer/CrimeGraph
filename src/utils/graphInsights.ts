import type { GraphElement, IntelNote } from '../stores/caseStore';

export interface ConnectedEntity {
  id: string;
  label: string;
  type: string;
  connections: number;
}

export type QualityFindingKind = 'missing_observed_time' | 'missing_custody' | 'unlinked_note' | 'isolated_entity' | 'duplicate_candidate' | 'pending_review';
export type QualityFindingSeverity = 'review' | 'attention';

export interface QualityFinding {
  id: string;
  kind: QualityFindingKind;
  severity: QualityFindingSeverity;
  title: string;
  explanation: string;
  affectedIds: string[];
}

export interface CaseSearchResult {
  id: string;
  kind: 'node' | 'note' | 'relationship';
  title: string;
  summary: string;
}

export interface GraphInsights {
  entityCount: number;
  relationshipCount: number;
  isolatedEntities: number;
  entitiesWithoutMetadata: number;
  notesWithoutLinks: number;
  evidenceCount: number;
  evidenceRequiringReview: number;
  evidenceWithoutCustody: number;
  itemsWithoutObservedTime: number;
  mostConnected: ConnectedEntity[];
  qualityFindings: QualityFinding[];
}

const normaliseSearch = (value: unknown): string => String(value ?? '').trim().toLocaleLowerCase();

const nodeSearchText = (node: GraphElement): string => {
  const data = node.data;
  return [
    data.label,
    data.type,
    data.occurred_at,
    ...Object.entries(data.attributes || {}).flatMap(([key, value]) => [key, value]),
    data.evidence?.exhibitNumber,
    data.evidence?.sourceReference,
    data.evidence?.sourceType,
    data.evidence?.handlingStatus,
    data.evidence?.verificationStatus,
    data.evidence?.attachmentName,
  ].map(normaliseSearch).join(' ');
};

export function searchCaseContent(elements: GraphElement[], notes: IntelNote[], query: string): CaseSearchResult[] {
  const needle = normaliseSearch(query);
  if (needle.length < 2) return [];
  const nodes = elements.filter((element) => !element.data.source && !element.data.target);
  const edges = elements.filter((element) => Boolean(element.data.source && element.data.target));
  const nodeById = new Map(nodes.map((node) => [node.data.id, node]));
  const results: CaseSearchResult[] = [];

  nodes.forEach((node) => {
    if (nodeSearchText(node).includes(needle)) results.push({ id: node.data.id, kind: 'node', title: node.data.label, summary: `${node.data.type || 'entity'} · ${node.data.occurred_at ? new Date(node.data.occurred_at).toLocaleString() : 'no observed time'}` });
  });
  notes.forEach((note) => {
    if (normaliseSearch(note.content).includes(needle)) results.push({ id: note.id, kind: 'note', title: 'Intelligence note', summary: note.content.slice(0, 180) });
  });
  edges.forEach((edge) => {
    const source = edge.data.source ? nodeById.get(edge.data.source)?.data.label || edge.data.source : 'Unknown';
    const target = edge.data.target ? nodeById.get(edge.data.target)?.data.label || edge.data.target : 'Unknown';
    const searchable = normaliseSearch(`${edge.data.label} ${source} ${target}`);
    if (searchable.includes(needle)) results.push({ id: edge.data.id, kind: 'relationship', title: edge.data.label || 'Relationship', summary: `${source} → ${target}` });
  });
  return results.sort((left, right) => left.kind.localeCompare(right.kind) || left.title.localeCompare(right.title));
}

export function buildGraphInsights(elements: GraphElement[], notes: IntelNote[]): GraphInsights {
  const nodes = elements.filter((element) => !element.data.source && !element.data.target);
  const edges = elements.filter((element) => Boolean(element.data.source && element.data.target));
  const degreeById = new Map<string, number>();

  nodes.forEach((node) => degreeById.set(node.data.id, 0));
  edges.forEach((edge) => {
    if (edge.data.source) degreeById.set(edge.data.source, (degreeById.get(edge.data.source) || 0) + 1);
    if (edge.data.target) degreeById.set(edge.data.target, (degreeById.get(edge.data.target) || 0) + 1);
  });

  const rankedEntities = nodes
    .map((node) => ({
      id: node.data.id,
      label: node.data.label,
      type: node.data.type || 'entity',
      connections: degreeById.get(node.data.id) || 0,
    }))
    .sort((left, right) => right.connections - left.connections || left.label.localeCompare(right.label));

  const evidenceNodes = nodes.filter((node) => node.data.type === 'evidence');
  const evidenceRequiringReview = nodes.filter((node) => node.data.review_status === 'pending').length;
  const evidenceWithoutCustody = evidenceNodes.filter((node) => !node.data.evidence?.chainOfCustody).length;
  const missingObservedTime = nodes.filter((node) => !node.data.occurred_at && !node.data.evidence?.acquiredAt);
  const isolatedEntities = rankedEntities.filter((entity) => entity.connections === 0);
  const notesWithoutLinks = notes.filter((note) => note.linked_nodes.length === 0);
  const duplicateGroups = new Map<string, GraphElement[]>();
  nodes.forEach((node) => {
    const key = normaliseSearch(node.data.label).replace(/\s+/g, ' ');
    if (!key) return;
    duplicateGroups.set(key, [...(duplicateGroups.get(key) || []), node]);
  });

  const qualityFindings: QualityFinding[] = [];
  if (missingObservedTime.length) qualityFindings.push({
    id: 'missing_observed_time', kind: 'missing_observed_time', severity: 'attention', title: 'Observed time is missing',
    explanation: `${missingObservedTime.length} record${missingObservedTime.length === 1 ? '' : 's'} cannot be placed reliably on the chronology until an observed or acquired time is recorded.`,
    affectedIds: missingObservedTime.map((node) => node.data.id),
  });
  if (evidenceWithoutCustody) {
    const affected = evidenceNodes.filter((node) => !node.data.evidence?.chainOfCustody).map((node) => node.data.id);
    qualityFindings.push({ id: 'missing_custody', kind: 'missing_custody', severity: 'attention', title: 'Evidence custody notes are missing', explanation: `${affected.length} evidence record${affected.length === 1 ? '' : 's'} has no chain-of-custody narrative.`, affectedIds: affected });
  }
  if (notesWithoutLinks.length) qualityFindings.push({ id: 'unlinked_note', kind: 'unlinked_note', severity: 'review', title: 'Intelligence notes are unlinked', explanation: `${notesWithoutLinks.length} note${notesWithoutLinks.length === 1 ? '' : 's'} is not linked to a graph entity, limiting traceability within the case graph.`, affectedIds: notesWithoutLinks.map((note) => note.id) });
  if (isolatedEntities.length) qualityFindings.push({ id: 'isolated_entity', kind: 'isolated_entity', severity: 'review', title: 'Entities have no graph relationship', explanation: `${isolatedEntities.length} entity record${isolatedEntities.length === 1 ? '' : 's'} has no relationship edge. This is a structural cue, not a judgment about relevance.`, affectedIds: isolatedEntities.map((entity) => entity.id) });
  [...duplicateGroups.values()].filter((group) => group.length > 1).forEach((group) => qualityFindings.push({ id: `duplicate_candidate:${group.map((node) => node.data.id).sort().join(':')}`, kind: 'duplicate_candidate', severity: 'review', title: 'Possible duplicate label', explanation: `${group.length} records share the normalized label “${group[0].data.label}”. Analyst confirmation is required before any merge or deletion.`, affectedIds: group.map((node) => node.data.id) }));
  if (evidenceRequiringReview) {
    const affected = nodes.filter((node) => node.data.review_status === 'pending').map((node) => node.data.id);
    qualityFindings.push({ id: 'pending_review', kind: 'pending_review', severity: 'review', title: 'Supervisor review remains pending', explanation: `${affected.length} field submission${affected.length === 1 ? '' : 's'} awaits an explicit supervisor decision.`, affectedIds: affected });
  }

  return {
    entityCount: nodes.length,
    relationshipCount: edges.length,
    isolatedEntities: isolatedEntities.length,
    entitiesWithoutMetadata: nodes.filter((node) => Object.keys(node.data.attributes || {}).length === 0).length,
    notesWithoutLinks: notesWithoutLinks.length,
    evidenceCount: evidenceNodes.length,
    evidenceRequiringReview,
    evidenceWithoutCustody,
    itemsWithoutObservedTime: missingObservedTime.length,
    mostConnected: rankedEntities.filter((entity) => entity.connections > 0).slice(0, 3),
    qualityFindings,
  };
}

export interface LocalGraphQueryDefinition {
  queryText: string;
  nodeTypes: string[];
  includeRelationships: boolean;
}

export interface ExplainableGraphQueryResult extends CaseSearchResult {
  reasons: string[];
}

const nodeQueryReasons = (node: GraphElement, needle: string): string[] => {
  if (!needle) return [];
  const data = node.data;
  const reasons: string[] = [];
  if (normaliseSearch(data.label).includes(needle)) reasons.push('entity label contains the saved text filter');
  if (normaliseSearch(data.type).includes(needle)) reasons.push('entity type contains the saved text filter');
  if (normaliseSearch(data.occurred_at).includes(needle)) reasons.push('observed time contains the saved text filter');
  if (Object.entries(data.attributes || {}).some(([key, value]) => normaliseSearch(`${key} ${value}`).includes(needle))) reasons.push('entity metadata contains the saved text filter');
  const evidence = data.evidence;
  if (evidence && normaliseSearch([evidence.exhibitNumber, evidence.sourceReference, evidence.sourceType, evidence.handlingStatus, evidence.verificationStatus, evidence.attachmentName].join(' ')).includes(needle)) {
    reasons.push('evidence provenance contains the saved text filter');
  }
  return reasons;
};

export const runExplainableLocalGraphQuery = (elements: GraphElement[], definition: LocalGraphQueryDefinition): ExplainableGraphQueryResult[] => {
  const needle = normaliseSearch(definition.queryText);
  const nodeTypes = [...new Set(definition.nodeTypes.map(normaliseSearch).filter(Boolean))];
  if (needle.length > 0 && needle.length < 2) throw new Error('Saved query text must contain at least two characters.');
  if (!needle && nodeTypes.length === 0) throw new Error('Saved query requires text or at least one entity type filter.');
  const nodes = elements.filter((element) => !element.data.source && !element.data.target);
  const edges = elements.filter((element) => Boolean(element.data.source && element.data.target));
  const nodeById = new Map(nodes.map((node) => [node.data.id, node]));
  const matchingNodes = nodes.filter((node) => {
    const typeMatches = nodeTypes.length === 0 || nodeTypes.includes(normaliseSearch(node.data.type));
    const textMatches = !needle || nodeQueryReasons(node, needle).length > 0;
    return typeMatches && textMatches;
  });
  const matchingNodeIds = new Set(matchingNodes.map((node) => node.data.id));
  const results: ExplainableGraphQueryResult[] = matchingNodes.map((node) => {
    const reasons = [
      ...(nodeTypes.length ? [`entity type is within saved filter: ${nodeTypes.join(', ')}`] : []),
      ...nodeQueryReasons(node, needle),
    ];
    return {
      id: node.data.id,
      kind: 'node',
      title: node.data.label,
      summary: `${node.data.type || 'entity'} · ${node.data.occurred_at ? new Date(node.data.occurred_at).toLocaleString() : 'no observed time'}`,
      reasons: reasons.length ? reasons : ['entity type satisfies the saved filter'],
    };
  });

  if (definition.includeRelationships) {
    edges.forEach((edge) => {
      const sourceId = edge.data.source || '';
      const targetId = edge.data.target || '';
      const source = nodeById.get(sourceId)?.data.label || sourceId || 'Unknown';
      const target = nodeById.get(targetId)?.data.label || targetId || 'Unknown';
      const labelMatches = Boolean(needle && normaliseSearch(`${edge.data.label} ${source} ${target}`).includes(needle));
      const joinsMatch = matchingNodeIds.has(sourceId) || matchingNodeIds.has(targetId);
      if (!labelMatches && !joinsMatch) return;
      const reasons = [
        ...(joinsMatch ? ['relationship is directly connected to an entity matched by this saved query'] : []),
        ...(labelMatches ? ['relationship label or endpoint contains the saved text filter'] : []),
      ];
      results.push({ id: edge.data.id, kind: 'relationship', title: edge.data.label || 'Relationship', summary: `${source} → ${target}`, reasons });
    });
  }
  return results.sort((left, right) => left.kind.localeCompare(right.kind) || left.title.localeCompare(right.title) || left.id.localeCompare(right.id));
};


export interface ObservationCorroborationSummary {
  totalContexts: number;
  exactSpatial: number;
  approximateSpatial: number;
  areaSpatial: number;
  unknownSpatial: number;
  exactTemporal: number;
  approximateTemporal: number;
  windowTemporal: number;
  unknownTemporal: number;
  findings: string[];
}

export function buildObservationCorroborationSummary(contexts: any[]): ObservationCorroborationSummary {
  let exactSpatial = 0;
  let approximateSpatial = 0;
  let areaSpatial = 0;
  let unknownSpatial = 0;
  let exactTemporal = 0;
  let approximateTemporal = 0;
  let windowTemporal = 0;
  let unknownTemporal = 0;
  const findings: string[] = [];

  for (const ctx of contexts) {
    if (ctx.location_precision === 'exact') exactSpatial++;
    else if (ctx.location_precision === 'approximate') approximateSpatial++;
    else if (ctx.location_precision === 'area') areaSpatial++;
    else unknownSpatial++;

    if (ctx.temporal_precision === 'exact') exactTemporal++;
    else if (ctx.temporal_precision === 'approximate') approximateTemporal++;
    else if (ctx.temporal_precision === 'window') windowTemporal++;
    else unknownTemporal++;
  }

  if (areaSpatial > 0) {
    findings.push(`${areaSpatial} observation context(s) rely on broad area boundaries rather than exact coordinates.`);
  }
  if (windowTemporal > 0) {
    findings.push(`${windowTemporal} observation context(s) use a temporal window rather than an exact timestamp.`);
  }
  if (unknownSpatial > 0 || unknownTemporal > 0) {
    findings.push(`${unknownSpatial + unknownTemporal} observation context(s) have unstated spatial or temporal precision limits.`);
  }

  return {
    totalContexts: contexts.length,
    exactSpatial,
    approximateSpatial,
    areaSpatial,
    unknownSpatial,
    exactTemporal,
    approximateTemporal,
    windowTemporal,
    unknownTemporal,
    findings,
  };
}

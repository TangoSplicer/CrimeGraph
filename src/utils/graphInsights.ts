import type { GraphElement, IntelNote } from '../stores/caseStore';

export interface ConnectedEntity {
  id: string;
  label: string;
  type: string;
  connections: number;
}

export interface GraphInsights {
  entityCount: number;
  relationshipCount: number;
  isolatedEntities: number;
  entitiesWithoutMetadata: number;
  notesWithoutLinks: number;
  mostConnected: ConnectedEntity[];
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

  return {
    entityCount: nodes.length,
    relationshipCount: edges.length,
    isolatedEntities: rankedEntities.filter((entity) => entity.connections === 0).length,
    entitiesWithoutMetadata: nodes.filter((node) => Object.keys(node.data.attributes || {}).length === 0).length,
    notesWithoutLinks: notes.filter((note) => note.linked_nodes.length === 0).length,
    mostConnected: rankedEntities.filter((entity) => entity.connections > 0).slice(0, 3),
  };
}

export interface TemporalSpan {
  id: string;
  label: string;
  type: string;
  startTime: number;
  endTime: number;
  precision: 'exact' | 'approximate' | 'window' | 'unknown';
  uncertaintyMinutes: number;
  corroboratedCount: number;
}

export function computeTemporalCorroboration(nodes: any[]): {
  spans: TemporalSpan[];
  overlappingClusters: Array<{ startTime: number; endTime: number; count: number; nodeIds: string[] }>;
} {
  const spans: TemporalSpan[] = [];
  const validNodes = nodes.filter((n) => n.occurred_at || n.created_at);

  validNodes.forEach((node) => {
    const rawTime = node.occurred_at || node.created_at;
    const start = new Date(rawTime).getTime();
    if (isNaN(start)) return;

    let uncertaintyMinutes = 15; // default exact precision window
    let precision = node.precision || 'exact';
    if (precision === 'approximate') uncertaintyMinutes = 120;
    if (precision === 'window') uncertaintyMinutes = 360;
    if (precision === 'unknown') uncertaintyMinutes = 1440;

    const startTime = start - uncertaintyMinutes * 60 * 1000;
    const endTime = start + uncertaintyMinutes * 60 * 1000;

    spans.push({
      id: node.id,
      label: node.label || 'Unnamed Entity',
      type: node.type || 'entity',
      startTime,
      endTime,
      precision,
      uncertaintyMinutes,
      corroboratedCount: 0,
    });
  });

  // Calculate overlaps (corroboration count)
  spans.forEach((span, index) => {
    let count = 0;
    spans.forEach((other, otherIndex) => {
      if (index === otherIndex) return;
      if (!(span.endTime < other.startTime || span.startTime > other.endTime)) {
        count++;
      }
    });
    span.corroboratedCount = count;
  });

  // Identify overlapping clusters
  const clusters: Array<{ startTime: number; endTime: number; count: number; nodeIds: string[] }> = [];
  const sorted = [...spans].sort((a, b) => a.startTime - b.startTime);

  sorted.forEach((span) => {
    const existingCluster = clusters.find((c) => !(span.endTime < c.startTime || span.startTime > c.endTime));
    if (existingCluster) {
      existingCluster.startTime = Math.min(existingCluster.startTime, span.startTime);
      existingCluster.endTime = Math.max(existingCluster.endTime, span.endTime);
      existingCluster.count++;
      existingCluster.nodeIds.push(span.id);
    } else {
      clusters.push({
        startTime: span.startTime,
        endTime: span.endTime,
        count: 1,
        nodeIds: [span.id],
      });
    }
  });

  return { spans, overlappingClusters: clusters.filter((c) => c.count > 1) };
}

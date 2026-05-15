#!/bin/bash

echo "Patching GraphCanvas.tsx for strict TS compliance..."
cat << 'EOF' > src/components/graph/GraphCanvas.tsx
import React, { useEffect, useRef } from 'react';
import cytoscape, { Core } from 'cytoscape';

// Intelligence Color Scheme mapping
const nodeColors: Record<string, string> = {
  person: '#3a7bd5',
  vehicle: '#7c4dbb',
  phone: '#1a9a8a',
  location: '#c0680a',
  event: '#c0392b',
  digital_account: '#2776b8',
  organisation: '#b07d0a',
  evidence: '#1a8a4a',
};

// Default Mock Data for the Workspace
const mockElements = [
  { data: { id: 'n1', label: 'John DOE', type: 'person' } },
  { data: { id: 'n2', label: '07700 900123', type: 'phone' } },
  { data: { id: 'n3', label: 'Ford Transit (Blue)', type: 'vehicle' } },
  { data: { id: 'n4', label: 'Safehouse A', type: 'location' } },
  { data: { id: 'e1', source: 'n1', target: 'n2', label: 'OWNS' } },
  { data: { id: 'e2', source: 'n1', target: 'n3', label: 'DRIVES' } },
  { data: { id: 'e3', source: 'n3', target: 'n4', label: 'SEEN AT' } }
];

export const GraphCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Use any[] to bypass strict TS definitions for the stylesheet
    const style: any[] = [
      {
        selector: 'node',
        style: {
          'label': 'data(label)',
          // Explicitly type 'ele' as any to satisfy TS7006 (noImplicitAny)
          'background-color': (ele: any) => nodeColors[ele.data('type')] || '#7880a0',
          'color': '#dde1ec',
          'text-valign': 'bottom',
          'text-halign': 'center',
          'text-margin-y': 6,
          'font-family': 'Space Mono, monospace',
          'font-size': '10px',
          'width': 48,
          'height': 48,
          'border-width': 2,
          'border-color': '#252a3a'
        }
      },
      {
        selector: 'node:selected',
        style: {
          'border-width': 4,
          'border-color': '#ffffff',
          'shadow-blur': 15,
          'shadow-color': '#ffffff',
          'shadow-opacity': 0.8
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 2,
          'line-color': '#454d66',
          'target-arrow-color': '#454d66',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'label': 'data(label)',
          'color': '#7880a0',
          'font-size': '8px',
          'text-background-opacity': 1,
          'text-background-color': '#0c0e14',
          'text-background-padding': 2
        }
      }
    ];

    // Initialize Cytoscape Instance
    cyRef.current = cytoscape({
      container: containerRef.current,
      elements: mockElements,
      style: style,
      layout: {
        name: 'cose',
        padding: 50,
        animate: true
      },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
      minZoom: 0.1,
      maxZoom: 4,
      touchTapThreshold: 8,
      desktopTapThreshold: 4,
    });

    // Cleanup on unmount
    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
      }
    };
  }, []);

  return <div ref={containerRef} className="w-full h-full bg-[#0c0e14]" />;
};
EOF

echo "Staging files..."
git add src/components/graph/GraphCanvas.tsx

echo "Committing..."
git commit -m "fix: resolve Cytoscape typescript errors (TS2724, TS7006)"

echo "Pushing to GitHub..."
git push origin main

echo "Graph patch deployed!"

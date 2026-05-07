import React, { useEffect, useRef } from 'react';
import cytoscape, { Core } from 'cytoscape';
import { useCaseStore } from '../../stores/caseStore';

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

export const GraphCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const { graphElements } = useCaseStore();

  // Initialization Effect
  useEffect(() => {
    if (!containerRef.current) return;

    const style: any[] = [
      {
        selector: 'node',
        style: {
          'label': 'data(label)',
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

    cyRef.current = cytoscape({
      container: containerRef.current,
      elements: graphElements,
      style: style,
      layout: { name: 'cose', padding: 50, animate: false },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
      minZoom: 0.1,
      maxZoom: 4,
    });

    return () => {
      if (cyRef.current) cyRef.current.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Reactivity Effect: Diff new elements and inject them smoothly
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;

    // Get current IDs in the cytoscape instance
    const currentIds = new Set();
    cy.elements().forEach((ele: any) => currentIds.add(ele.id()));

    // Find elements in our global store that aren't on the canvas yet
    const newElements = graphElements.filter(e => !currentIds.has(e.data.id));

    if (newElements.length > 0) {
      cy.add(newElements);
      // Run a gentle layout animation to place the new nodes naturally
      cy.layout({ 
        name: 'cose', 
        padding: 50,
        animate: true,
        animationDuration: 500,
        randomize: false // Keep existing nodes roughly where they are
      }).run();
    }
  }, [graphElements]);

  return <div ref={containerRef} className="w-full h-full bg-[#0c0e14]" />;
};

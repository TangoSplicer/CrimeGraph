import React, { useEffect, useRef } from 'react';
import cytoscape, { Core } from 'cytoscape';
import { useCaseStore } from '../../stores/caseStore';

const nodeColors: Record<string, string> = {
  person: '#3a7bd5', vehicle: '#7c4dbb', phone: '#1a9a8a', location: '#c0680a',
  event: '#c0392b', digital_account: '#2776b8', organisation: '#b07d0a', evidence: '#1a8a4a',
};

export const GraphCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const { graphElements } = useCaseStore();

  useEffect(() => {
    if (!containerRef.current) return;

    const style: any[] = [
      { selector: 'node', style: {
          'label': 'data(label)', 'background-color': (ele: any) => nodeColors[ele.data('type')] || '#7880a0',
          'color': '#dde1ec', 'text-valign': 'bottom', 'text-halign': 'center', 'text-margin-y': 6,
          'font-family': 'Space Mono, monospace', 'font-size': '10px', 'width': 48, 'height': 48,
          'border-width': 2, 'border-color': '#252a3a'
      }},
      { selector: 'node:selected', style: { 'border-width': 4, 'border-color': '#ffffff', 'shadow-blur': 15, 'shadow-color': '#ffffff' }},
      { selector: 'edge', style: {
          'width': 2, 'line-color': '#454d66', 'target-arrow-color': '#454d66', 'target-arrow-shape': 'triangle',
          'curve-style': 'bezier', 'label': 'data(label)', 'color': '#7880a0', 'font-size': '8px',
          'text-background-opacity': 1, 'text-background-color': '#0c0e14', 'text-background-padding': 2
      }}
    ];

    const cy = cytoscape({
      container: containerRef.current, elements: graphElements, style: style,
      layout: { name: 'cose', padding: 50, animate: false },
      userZoomingEnabled: true, userPanningEnabled: true, boxSelectionEnabled: false,
      minZoom: 0.1, maxZoom: 4, touchTapThreshold: 8,
    });
    
    cyRef.current = cy;

    cy.on('tap', (evt) => {
      const target = evt.target;
      const state = useCaseStore.getState();
      
      if (target === cy) { state.setSelectedNodeId(null); return; }
      if (target.isNode()) {
        const targetId = target.id();
        if (state.connectingFromId) {
          state.addEdge(state.connectingFromId, targetId, 'LINKED_TO');
          state.setConnectingFromId(null);
        } else {
          state.setSelectedNodeId(targetId);
        }
      }
    });

    return () => cy.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 🚀 FIXED: The reactivity engine now handles both additions AND deletions
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    
    // 1. Add new elements
    const currentIds = new Set();
    cy.elements().forEach((ele: any) => { currentIds.add(ele.id()); });
    const newElements = graphElements.filter(e => !currentIds.has(e.data.id));

    if (newElements.length > 0) {
      cy.add(newElements);
      cy.layout({ name: 'cose', padding: 50, animate: true, animationDuration: 300, randomize: false }).run();
    }

    // 2. Remove deleted elements
    const stateIds = new Set(graphElements.map(e => e.data.id));
    const elementsToRemove = cy.elements().filter((ele: any) => !stateIds.has(ele.id()));
    
    if (elementsToRemove.length > 0) {
      cy.remove(elementsToRemove);
    }
  }, [graphElements]);

  return <div ref={containerRef} className="w-full h-full bg-[#0c0e14]" />;
};

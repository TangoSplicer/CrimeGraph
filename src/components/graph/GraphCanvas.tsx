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
  const { graphElements, hiddenNodeTypes } = useCaseStore();

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
          'width': 3, 'line-color': '#454d66', 'target-arrow-color': '#454d66', 'target-arrow-shape': 'triangle',
          'curve-style': 'bezier', 'label': 'data(label)', 'color': '#7880a0', 'font-size': '8px',
          'text-background-opacity': 1, 'text-background-color': '#0c0e14', 'text-background-padding': 2
      }},
      { selector: 'edge:selected', style: {
          'width': 4, 'line-color': '#e74c3c', 'target-arrow-color': '#e74c3c', 'color': '#e74c3c'
      }},
      // 🚀 NEW: The invisible class
      { selector: '.filtered-out', style: { 'display': 'none' } }
    ];

    const cy = cytoscape({
      container: containerRef.current, elements: graphElements, style: style,
      layout: { name: 'cose', padding: 50, animate: false },
      userZoomingEnabled: true, userPanningEnabled: true, boxSelectionEnabled: false,
      minZoom: 0.1, maxZoom: 4, touchTapThreshold: 40,
    });
    
    cyRef.current = cy;

    cy.on('tap', (evt) => {
      const target = evt.target;
      const state = useCaseStore.getState();
      
      if (target === cy) { 
        state.setSelectedNodeId(null); 
        state.setSelectedEdgeId(null);
        return; 
      }
      
      if (target.isNode()) {
        const targetId = target.id();
        if (state.connectingFromId) {
          state.addEdge(state.connectingFromId, targetId, 'LINKED_TO');
          state.setConnectingFromId(null);
        } else {
          state.setSelectedNodeId(targetId);
        }
      }

      if (target.isEdge() && !state.connectingFromId) {
        state.setSelectedEdgeId(target.id());
      }
    });

    return () => cy.destroy();
  }, []);

  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    
    const currentIds = new Set();
    cy.elements().forEach((ele: any) => { currentIds.add(ele.id()); });
    const newElements = graphElements.filter(e => !currentIds.has(e.data.id));

    if (newElements.length > 0) {
      cy.add(newElements);
      cy.layout({ name: 'cose', padding: 50, animate: true, animationDuration: 300, randomize: false }).run();
    }

    const stateIds = new Set(graphElements.map(e => e.data.id));
    const elementsToRemove = cy.elements().filter((ele: any) => !stateIds.has(ele.id()));
    
    if (elementsToRemove.length > 0) {
      cy.remove(elementsToRemove);
    }
    
    // 🚀 NEW: Apply filtering dynamically based on the global state
    cy.batch(() => {
      cy.nodes().removeClass('filtered-out');
      const hiddenTypes = useCaseStore.getState().hiddenNodeTypes;
      if (hiddenTypes.length > 0) {
        hiddenTypes.forEach(type => {
          cy.nodes(`[type = "${type}"]`).addClass('filtered-out');
        });
      }
    });
    
  }, [graphElements, hiddenNodeTypes]);

  return <div ref={containerRef} className="w-full h-full bg-[#0c0e14]" />;
};

#!/bin/bash

echo "Patching AddEntityScreen.tsx (removing unused variable)..."
cat << 'EOF' > src/screens/AddEntityScreen.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCaseStore } from '../stores/caseStore';
import { BottomTabBar } from '../components/layout/BottomTabBar';

export const AddEntityScreen: React.FC = () => {
  const navigate = useNavigate();
  // FIXED: Removed the unused activeCaseId extraction
  const { addNode } = useCaseStore();
  
  const [nodeType, setNodeType] = useState('person');
  const [label, setLabel] = useState('');

  const nodeTypes = [
    { id: 'person', label: 'Person' },
    { id: 'vehicle', label: 'Vehicle' },
    { id: 'phone', label: 'Phone Number' },
    { id: 'location', label: 'Location' },
    { id: 'digital_account', label: 'Digital Account' },
    { id: 'evidence', label: 'Evidence Item' }
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    
    addNode(nodeType, label.trim());
    navigate('/graph');
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#0c0e14]">
      <div className="px-4 py-4 bg-[#14171f] border-b border-[#252a3a] pt-safe">
        <h1 className="text-xl font-mono text-[#dde1ec]">Add Entity</h1>
        <p className="text-[#7880a0] text-xs">Create a new intelligence node</p>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-[#7880a0] mb-2 uppercase">Entity Type</label>
            <div className="grid grid-cols-2 gap-2">
              {nodeTypes.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setNodeType(t.id)}
                  className={`py-2 px-2 rounded text-xs font-bold border transition-colors ${
                    nodeType === t.id 
                      ? 'bg-[#3a7bd5] text-white border-[#3a7bd5]' 
                      : 'bg-[#0f1219] text-[#7880a0] border-[#252a3a] hover:border-[#454d66]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#7880a0] mb-2 uppercase">Label / Identifier</label>
            <input 
              type="text" 
              className="w-full px-3 py-3 bg-[#0f1219] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5]"
              placeholder="e.g. John SMITH, 07700 900123"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
            />
          </div>

          <button 
            type="submit" 
            className="w-full py-3 bg-[#1d9a6c] hover:bg-[#157a55] text-white font-bold rounded shadow-lg transition-colors mt-8"
          >
            Create Node
          </button>
        </form>
      </div>

      <BottomTabBar />
    </div>
  );
};
EOF

echo "Patching GraphCanvas.tsx (fixing implicit return type)..."
cat << 'EOF' > src/components/graph/GraphCanvas.tsx
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
  }, []);

  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;

    const currentIds = new Set();
    // FIXED: Added {} to prevent implicit return of the Set, satisfying TS void requirement
    cy.elements().forEach((ele: any) => {
      currentIds.add(ele.id());
    });

    const newElements = graphElements.filter(e => !currentIds.has(e.data.id));

    if (newElements.length > 0) {
      cy.add(newElements);
      cy.layout({ 
        name: 'cose', 
        padding: 50,
        animate: true,
        animationDuration: 500,
        randomize: false
      }).run();
    }
  }, [graphElements]);

  return <div ref={containerRef} className="w-full h-full bg-[#0c0e14]" />;
};
EOF

echo "Staging files..."
git add src/screens/AddEntityScreen.tsx src/components/graph/GraphCanvas.tsx

echo "Committing..."
git commit -m "fix: resolve TS2769 and TS6133 by fixing implicit returns and removing unused vars"

echo "Pushing to GitHub..."
git push origin main

echo "Type patch deployed!"

#!/bin/bash

echo "Creating graph directories..."
mkdir -p src/components/graph src/screens

echo "Creating GraphCanvas.tsx..."
cat << 'EOF' > src/components/graph/GraphCanvas.tsx
import React, { useEffect, useRef } from 'react';
import cytoscape, { Core, Stylesheet } from 'cytoscape';

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

    // Cytoscape Stylesheet matching the dark aesthetic
    const style: Stylesheet[] = [
      {
        selector: 'node',
        style: {
          'label': 'data(label)',
          'background-color': (ele) => nodeColors[ele.data('type')] || '#7880a0',
          'color': '#dde1ec',
          'text-valign': 'bottom',
          'text-halign': 'center',
          'text-margin-y': 6,
          'font-family': 'Space Mono, monospace',
          'font-size': '10px',
          'width': 48, // Minimum 44px touch target per Apple HIG
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
        name: 'cose', // Force-directed layout
        padding: 50,
        animate: true
      },
      // Touch and Mobile Optimizations
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false, // Prevents accidental boxes while swiping
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

echo "Creating GraphWorkspaceScreen.tsx..."
cat << 'EOF' > src/screens/GraphWorkspaceScreen.tsx
import React from 'react';
import { GraphCanvas } from '../components/graph/GraphCanvas';
import { BottomTabBar } from '../components/layout/BottomTabBar';
import { useCaseStore } from '../stores/caseStore';

export const GraphWorkspaceScreen: React.FC = () => {
  const { activeCaseId, cases } = useCaseStore();
  
  // Find active case details, fallback to placeholder if none selected
  const activeCase = cases.find(c => c.id === activeCaseId) || { reference_number: 'NO CASE SELECTED', classification: 'OFFICIAL' };

  return (
    <div className="flex flex-col w-full h-full bg-[#0c0e14]">
      {/* Classification & Case Header */}
      <div className="px-4 py-3 bg-[#14171f] border-b border-[#252a3a] pt-safe z-10 flex justify-between items-center shadow-md">
        <div>
          <h2 className="text-sm font-mono text-[#3a7bd5]">{activeCase.reference_number}</h2>
          <p className="text-xs text-[#7880a0]">Graph Workspace</p>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#454d66] text-[#dde1ec] bg-[#252a3a]">
          {activeCase.classification}
        </span>
      </div>

      {/* The Interactive Graph Canvas */}
      <div className="flex-1 relative overflow-hidden">
        <GraphCanvas />
      </div>

      <BottomTabBar />
    </div>
  );
};
EOF

echo "Updating App.tsx to include the Graph Route..."
cat << 'EOF' > src/App.tsx
import React, { useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { initDatabase } from './capacitor/db';
import { LoginScreen } from './screens/LoginScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { GraphWorkspaceScreen } from './screens/GraphWorkspaceScreen';

const PrivacyScreen = registerPlugin<any>('PrivacyScreen');

const App: React.FC = () => {
  const { isLocked, recordActivity, lock, lockTimeoutMs, lastActivityAt } = useAuthStore();

  useEffect(() => {
    initDatabase().catch(console.error);

    if (Capacitor.isNativePlatform()) {
      PrivacyScreen.enable().catch(console.error);
      CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) lock();
      });
    }

    const timer = setInterval(() => {
      if (!isLocked && Date.now() - lastActivityAt > lockTimeoutMs) lock();
    }, 5000);

    return () => clearInterval(timer);
  }, [isLocked, lastActivityAt, lockTimeoutMs, lock]);

  return (
    <div 
      className="w-full h-screen relative flex flex-col items-center justify-center bg-[#0c0e14] text-[#dde1ec]"
      onClick={recordActivity}
      onTouchStart={recordActivity}
    >
      {isLocked ? (
        <LoginScreen />
      ) : (
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<DashboardScreen />} />
            <Route path="/graph" element={<GraphWorkspaceScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      )}
    </div>
  );
};

export default App;
EOF

echo "Staging files..."
git add src/

echo "Committing..."
git commit -m "feat: implement Cytoscape graph canvas and Graph Workspace screen"

echo "Pushing to GitHub..."
git push origin main

echo "Phase 3 deployed!"

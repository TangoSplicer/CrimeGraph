import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { DashboardScreen } from './screens/DashboardScreen';
import { GraphWorkspaceScreen } from './screens/GraphWorkspaceScreen';
import { AddNodeScreen } from './screens/AddNodeScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { AuthScreen } from './screens/AuthScreen';
import { useAuthStore } from './stores/authStore';

export const App: React.FC = () => {
  const { currentUser, isAppReady, initializeAuth } = useAuthStore();

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  if (!isAppReady) {
    return <div className="min-h-screen bg-[#0c0e14] flex items-center justify-center text-[#3a7bd5] font-mono">INITIALISING HARDWARE...</div>;
  }

  // Security Gate
  if (!currentUser) {
    return <AuthScreen />;
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<DashboardScreen />} />
        <Route path="/workspace" element={<GraphWorkspaceScreen />} />
        <Route path="/add" element={<AddNodeScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
};

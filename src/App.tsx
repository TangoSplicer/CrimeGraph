import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { DashboardScreen } from './screens/DashboardScreen';
import { GraphWorkspaceScreen } from './screens/GraphWorkspaceScreen';
import { AddNodeScreen } from './screens/AddNodeScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SupervisorReviewScreen } from './screens/SupervisorReviewScreen';
import { AuthScreen } from './screens/AuthScreen';
import { useAuthStore } from './stores/authStore';

const SESSION_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export const App: React.FC = () => {
  const { currentUser, isAppReady, initializeAuth, logout, intentionalBackground, setIntentionalBackground } = useAuthStore();

  useEffect(() => {
    initializeAuth();

    // The Background Lockdown Listener
    const appStateListener = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive && !intentionalBackground) {
        logout(); // Force re-authentication if pushed to background
      }
      if (isActive && intentionalBackground) {
        setIntentionalBackground(false); // Reset intent once back
      }
    });

    return () => { appStateListener.then(l => l.remove()); };
  }, [initializeAuth, logout, intentionalBackground, setIntentionalBackground]);

  useEffect(() => {
    if (!currentUser) return;
    let timeoutId: number | undefined;
    const resetIdleTimeout = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(logout, SESSION_IDLE_TIMEOUT_MS);
    };
    const activityEvents: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart'];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, resetIdleTimeout, { passive: true }));
    resetIdleTimeout();
    return () => {
      window.clearTimeout(timeoutId);
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, resetIdleTimeout));
    };
  }, [currentUser, logout]);

  if (!isAppReady) return <div className="min-h-screen bg-[#0c0e14] flex items-center justify-center text-[#3a7bd5] font-mono">INITIALISING HARDWARE...</div>;
  if (!currentUser) return <AuthScreen />;

  return (
    <Router>
      <Routes>
        <Route path="/" element={<DashboardScreen />} />
        <Route path="/workspace" element={<GraphWorkspaceScreen />} />
        <Route path="/add" element={<AddNodeScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/review" element={<SupervisorReviewScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
};

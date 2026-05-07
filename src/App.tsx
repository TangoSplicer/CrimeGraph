import React, { useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { useAuthStore } from './stores/authStore';
import { initDatabase } from './capacitor/db';
import { LoginScreen } from './screens/LoginScreen';

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
        <div className="text-center">
          <h1 className="text-2xl font-mono text-[#1d9a6c] mb-4">Workspace Active</h1>
          <p className="text-[#7880a0]">Database connected successfully.</p>
          <button 
            onClick={lock}
            className="mt-4 px-4 py-2 border border-[#252a3a] text-[#7880a0] hover:text-white rounded"
          >
            Lock Session
          </button>
        </div>
      )}
    </div>
  );
};

export default App;

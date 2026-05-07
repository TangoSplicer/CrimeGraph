import React, { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { PrivacyScreen } from '@capacitor-community/privacy-screen';
import { useAuthStore } from './stores/authStore';
import { initDatabase } from './capacitor/db';

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
        <div className="text-center">
          <h1 className="text-2xl font-mono text-[#3a7bd5] mb-4">CrimeGraph Locked</h1>
          <p className="text-[#7880a0]">Authentication module pending...</p>
        </div>
      ) : (
        <div className="text-center">
          <h1 className="text-2xl font-mono text-[#1d9a6c] mb-4">Workspace Active</h1>
          <p className="text-[#7880a0]">Database connected successfully.</p>
        </div>
      )}
    </div>
  );
};

export default App;

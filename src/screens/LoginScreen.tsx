import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { isBiometricAvailable, authenticateWithBiometrics } from '../capacitor/biometrics';

export const LoginScreen: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [hasBiometrics, setHasBiometrics] = useState(false);
  const { unlock, currentUser } = useAuthStore();

  useEffect(() => {
    isBiometricAvailable().then(setHasBiometrics);
  }, []);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Wire up to SQLite user verification here in Phase 2
    if (username === 'admin' && password === 'CrimeGraph2024!') {
      unlock('password', { id: '1', username: 'admin', role: 'admin', display_name: 'System Admin' }, 'session_123');
    } else {
      setError('Invalid credentials');
    }
  };

  const handleBiometricLogin = async () => {
    // Only allow biometric unlock if we know who was previously logged in (session lock)
    if (!currentUser) {
      setError('Biometric login unavailable. Please log in with a password first.');
      return;
    }
    const success = await authenticateWithBiometrics('Unlock CrimeGraph');
    if (success) {
      unlock('biometric', currentUser, 'session_123');
    } else {
      setError('Biometric authentication failed.');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-sm p-6 bg-[#14171f] border border-[#252a3a] rounded-lg shadow-2xl">
      <h1 className="text-3xl font-mono text-[#dde1ec] mb-2 tracking-widest">CrimeGraph</h1>
      <p className="text-[#7880a0] mb-8 text-sm">Secure Investigation Node</p>

      <form onSubmit={handlePasswordLogin} className="w-full">
        <div className="mb-4">
          <label className="block text-xs font-bold text-[#7880a0] mb-2 uppercase">Username</label>
          <input 
            type="text" 
            className="w-full px-3 py-2 bg-[#0f1219] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5]"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="mb-6">
          <label className="block text-xs font-bold text-[#7880a0] mb-2 uppercase">Password</label>
          <input 
            type="password" 
            className="w-full px-3 py-2 bg-[#0f1219] text-[#dde1ec] border border-[#252a3a] rounded focus:outline-none focus:border-[#3a7bd5]"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <p className="text-[#c0392b] text-sm mb-4 text-center">{error}</p>}

        <button 
          type="submit" 
          className="w-full py-2 bg-[#3a7bd5] hover:bg-[#4a8be5] text-white font-bold rounded transition-colors"
        >
          Authenticate
        </button>
      </form>

      {hasBiometrics && (
        <button 
          onClick={handleBiometricLogin}
          className="w-full mt-4 py-2 border border-[#3a7bd5] text-[#3a7bd5] hover:bg-[#3a7bd5] hover:text-white font-bold rounded transition-colors"
        >
          Use Biometrics
        </button>
      )}
    </div>
  );
};

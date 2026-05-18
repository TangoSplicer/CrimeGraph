import React, { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { NativeBiometric } from 'capacitor-native-biometric';

const ShieldIcon = ({ className }: { className: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 00.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 00-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08zm3.094 8.016a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
  </svg>
);

export const AuthScreen: React.FC = () => {
  const { isFirstBoot, setupMasterAdmin, login, adminLogin, biometricLogin } = useAuthStore();
  const [badge, setBadge] = useState('');
  const [pin, setPin] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'standard' | 'admin'>('standard');
  const [isLoading, setIsLoading] = useState(false);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);

  // 🚀 REINSTATED BIOMETRICS
  useEffect(() => {
    const triggerBiometrics = async () => {
      if (isFirstBoot || mode === 'admin') return;
      try {
        const available = await NativeBiometric.isAvailable();
        if (available.isAvailable) {
          await NativeBiometric.verifyIdentity({ reason: "Authenticate to access CrimeGraph", title: "Operator Login" });
          const success = await biometricLogin();
          if (!success) setError('Biometric verified, but no active operator profile found. Use PIN.');
        }
      } catch (err) {
        // Biometric failed or cancelled, fallback silently to PIN pad
      }
    };
    triggerBiometrics();
  }, [isFirstBoot, mode, biometricLogin]);

  const handlePressStart = () => {
    pressTimer.current = setTimeout(() => {
      if(navigator.vibrate) navigator.vibrate(50);
      setMode('admin'); setError(''); setBadge(''); setPin('');
    }, 3000);
  };
  const handlePressEnd = () => { if (pressTimer.current) clearTimeout(pressTimer.current); };

  const handleFirstBoot = async () => {
    if (adminPass.length < 8) return setError('Master password must be 8+ characters.');
    setIsLoading(true); setError('');
    try { await setupMasterAdmin(adminPass); setAdminPass(''); } 
    catch (err: any) { setError(`SYS ERROR: ${err.message}`); } 
    finally { setIsLoading(false); }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setIsLoading(true);
    try {
      if (mode === 'admin') {
        const success = await adminLogin(adminPass);
        if (success) setAdminPass(''); else setError('Unauthorised Access.');
      } else {
        const success = await login(badge, pin);
        if (success) { setBadge(''); setPin(''); } else setError('Invalid Badge or PIN.');
      }
    } catch (err: any) { setError(`SYS ERROR: ${err.message}`); } 
    finally { setIsLoading(false); }
  };

  if (isFirstBoot) {
    return (
      <div className="min-h-screen bg-[#0c0e14] flex flex-col items-center justify-center p-6 text-[#dde1ec]">
        <ShieldIcon className="w-16 h-16 text-[#e74c3c] mb-6" />
        <h1 className="text-xl font-bold tracking-widest text-[#e74c3c] mb-2 uppercase">System Commissioning</h1>
        <p className="text-xs text-[#7880a0] text-center mb-8">No Master Admin detected. Establish primary password.</p>
        <input type="password" value={adminPass} onChange={e => setAdminPass(e.target.value)} placeholder="Master Password" disabled={isLoading} autoComplete="off" autoCorrect="off" className="w-full max-w-sm bg-[#14171f] border border-[#e74c3c] p-4 rounded text-center text-lg tracking-widest focus:outline-none mb-4 disabled:opacity-50" />
        <button onClick={handleFirstBoot} disabled={isLoading} className="w-full max-w-sm bg-[#e74c3c] text-white font-bold py-4 rounded disabled:opacity-50">INITIALISE HARDWARE</button>
        {error && <p className="text-[#e74c3c] text-xs mt-4 font-bold">{error}</p>}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0c0e14] flex flex-col items-center justify-center p-6 text-[#dde1ec] relative pt-safe">
      <div className="mb-8 p-4 cursor-pointer select-none" onTouchStart={handlePressStart} onTouchEnd={handlePressEnd} onTouchCancel={handlePressEnd} onMouseDown={handlePressStart} onMouseUp={handlePressEnd} onMouseLeave={handlePressEnd}>
        <ShieldIcon className={`w-20 h-20 transition-colors duration-1000 ${mode === 'admin' ? 'text-[#e74c3c]' : 'text-[#3a7bd5]'}`} />
      </div>
      <h1 className="text-2xl font-bold tracking-widest mb-8 uppercase text-center">
        {mode === 'admin' ? <span className="text-[#e74c3c]">COMMAND DECK</span> : 'CRIMEGRAPH'}
      </h1>
      <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4">
        {mode === 'standard' ? (
          <>
            <input type="text" value={badge} onChange={e => setBadge(e.target.value.toUpperCase())} placeholder="BADGE (e.g. TEST-99)" disabled={isLoading} autoComplete="off" autoCorrect="off" className="w-full bg-[#14171f] border border-[#252a3a] p-4 rounded text-center font-mono focus:outline-none focus:border-[#3a7bd5] disabled:opacity-50" />
            <input type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="6-DIGIT PIN" maxLength={6} disabled={isLoading} autoComplete="off" autoCorrect="off" className="w-full bg-[#14171f] border border-[#252a3a] p-4 rounded text-center tracking-[1em] font-mono focus:outline-none focus:border-[#3a7bd5] disabled:opacity-50" />
          </>
        ) : (
          <input type="password" value={adminPass} onChange={e => setAdminPass(e.target.value)} placeholder="MASTER PASSWORD" disabled={isLoading} autoComplete="off" autoCorrect="off" className="w-full bg-[#14171f] border border-[#e74c3c] p-4 rounded text-center tracking-widest font-mono focus:outline-none focus:border-[#e74c3c] disabled:opacity-50" />
        )}
        <button type="submit" disabled={isLoading} className={`w-full font-bold py-4 rounded uppercase tracking-wider transition-colors disabled:opacity-50 ${mode === 'admin' ? 'bg-[#e74c3c] hover:bg-[#c0392b] text-white' : 'bg-[#3a7bd5] hover:bg-[#4a8be5] text-white'}`}>
          {mode === 'admin' ? 'AUTHORISE OVERRIDE' : 'AUTHENTICATE'}
        </button>
      </form>
      {error && <p className="text-[#e74c3c] text-xs mt-6 font-bold uppercase tracking-widest">{error}</p>}
      {mode === 'admin' && <button onClick={() => { setMode('standard'); setAdminPass(''); setError(''); }} className="mt-8 text-xs text-[#7880a0] font-bold">ABORT OVERRIDE</button>}
    </div>
  );
};

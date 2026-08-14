import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useCaseStore } from '../stores/caseStore';
import { useSyncStore } from '../stores/syncStore';
import { can, USER_ROLES, type UserRole } from '../utils/permissions';
import { usePairingStore } from '../stores/pairingStore';
import { BottomTabBar } from '../components/layout/BottomTabBar';
import { requireHighRiskReauthentication } from '../utils/highRiskAuth';

export const SettingsScreen: React.FC = () => {
  const { currentUser, logout, addOperator, operators, loadOperators, disableOperator, reinstateOperator, resetOperatorPin, changeOperatorRole } = useAuthStore();
  const { wipeDatabase, auditLogs, auditVerification, loadAuditLogs } = useCaseStore();
  
  const {
    deviceIdentity,
    peers: trustedPeers,
    pendingVerification,
    loadIdentity,
    loadPeers,
    createInvitation,
    importInvitation,
    confirmPeerVerification,
    revokePeer,
    clearPendingVerification,
  } = usePairingStore();
  const canManagePairing = can(currentUser?.role, 'pairing:manage');

  const { 
    isScanning, 
    isHardwareReady, 
    discoveredPeers,
    transferStatus,
    initializeMesh,
    startDiscovery,
    stopDiscovery
  } = useSyncStore();

  const [newBadge, setNewBadge] = useState('');
  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newRole, setNewRole] = useState<Exclude<UserRole, 'admin'>>('analyst');
  const [adminMsg, setAdminMsg] = useState('');
  const [selectedOperatorId, setSelectedOperatorId] = useState<string | null>(null);
  const [lifecyclePin, setLifecyclePin] = useState('');
  const [lifecycleRole, setLifecycleRole] = useState<Exclude<UserRole, 'admin'>>('analyst');
  const [lifecycleReason, setLifecycleReason] = useState('');
  const [lifecycleMsg, setLifecycleMsg] = useState('');
  const [isManagingOperator, setIsManagingOperator] = useState(false);
  const [auditFilter, setAuditFilter] = useState('');
  const [pairingDeviceName, setPairingDeviceName] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [receivedPairingCode, setReceivedPairingCode] = useState('');
  const [pairingMsg, setPairingMsg] = useState('');

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      loadAuditLogs();
      loadOperators().catch((error) => setLifecycleMsg(error instanceof Error ? error.message : 'Operator registry is unavailable.'));
    }
  }, [currentUser, loadAuditLogs, loadOperators]);

  useEffect(() => {
    if (!canManagePairing) return;
    loadPeers().catch((error) => setPairingMsg(error instanceof Error ? error.message : 'Peer trust registry is unavailable.'));
    loadIdentity().catch((error) => setPairingMsg(error instanceof Error ? error.message : 'Secure device identity is unavailable.'));
  }, [canManagePairing, loadIdentity, loadPeers]);

  const handleWipe = async () => {
    if (window.confirm("CRITICAL WARNING: This will permanently destroy all local intelligence. Proceed?")) {
      await wipeDatabase();
      logout();
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanBadge = newBadge.trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,32}$/.test(cleanBadge)) return setAdminMsg('Badge must contain 3–32 letters, numbers, or hyphens.');
    if (!/^\d{6}$/.test(newPin)) return setAdminMsg('PIN must contain exactly six digits.');
    try {
      await addOperator(cleanBadge, newName, newPin, newRole);
      await loadAuditLogs();
      setAdminMsg(`${newRole} ${cleanBadge} successfully provisioned. Sign out, then use this badge and PIN on the operator screen.`);
      setNewBadge(''); setNewName(''); setNewPin(''); setNewRole('analyst');
    } catch (err) {
      setAdminMsg(err instanceof Error ? err.message : 'Operator provisioning failed.');
    }
  };

  const selectOperator = (operatorId: string, role: Exclude<UserRole, 'admin'>) => {
    setSelectedOperatorId(operatorId);
    setLifecycleRole(role);
    setLifecyclePin('');
    setLifecycleReason('');
    setLifecycleMsg('');
  };

  const runLifecycleAction = async (reason: string, action: () => Promise<void>, successMessage: string) => {
    setIsManagingOperator(true);
    setLifecycleMsg('');
    try {
      await requireHighRiskReauthentication(reason);
      await action();
      await Promise.all([loadOperators(), loadAuditLogs()]);
      setLifecycleMsg(successMessage);
      setLifecyclePin('');
      setLifecycleReason('');
    } catch (error) {
      setLifecycleMsg(error instanceof Error ? error.message : 'Operator lifecycle action failed.');
    } finally {
      setIsManagingOperator(false);
    }
  };

  const handleResetOperatorPin = () => {
    if (!selectedOperatorId) return;
    void runLifecycleAction('Confirm operator PIN reset', () => resetOperatorPin(selectedOperatorId, lifecyclePin), 'Operator PIN reset. Existing biometric access was revoked.');
  };

  const handleChangeOperatorRole = () => {
    if (!selectedOperatorId) return;
    void runLifecycleAction('Confirm operator role change', () => changeOperatorRole(selectedOperatorId, lifecycleRole), 'Operator role updated. Existing biometric access was revoked.');
  };

  const handleOperatorStatus = (isDisabled: boolean) => {
    if (!selectedOperatorId) return;
    const action = isDisabled
      ? () => reinstateOperator(selectedOperatorId, lifecycleReason)
      : () => disableOperator(selectedOperatorId, lifecycleReason);
    const confirmation = isDisabled ? 'Confirm operator reinstatement' : 'Confirm operator disablement';
    const success = isDisabled ? 'Operator reinstated. A new PIN or biometric enrolment may be required.' : 'Operator disabled. PIN and biometric sign-in are now blocked.';
    void runLifecycleAction(confirmation, action, success);
  };

  const handleCreatePairingCode = async () => {
    try {
      const invitation = await createInvitation(pairingDeviceName || `${currentUser?.name || 'CrimeGraph'} device`);
      setPairingCode(invitation.code);
      setPairingMsg(`Pairing code created. It expires at ${new Date(invitation.expiresAt).toLocaleTimeString()}. Share it only with the intended device.`);
    } catch (error) {
      setPairingMsg(error instanceof Error ? error.message : 'Could not create a pairing code.');
    }
  };

  const handleImportPairingCode = async () => {
    try {
      const pending = await importInvitation(receivedPairingCode);
      setReceivedPairingCode('');
      setPairingMsg(`Signature verified. Compare the displayed short authentication code in person before confirming ${pending.peer.display_name}.`);
      await loadPeers();
    } catch (error) {
      setPairingMsg(error instanceof Error ? error.message : 'Could not import the pairing code.');
    }
  };

  const handleConfirmPeer = async (peerId: string) => {
    try {
      await confirmPeerVerification(peerId);
      await loadPeers();
      setPairingMsg('Peer verified. Case transfer remains disabled until a separately approved secure session protocol is implemented.');
    } catch (error) {
      setPairingMsg(error instanceof Error ? error.message : 'Could not verify the peer.');
    }
  };

  const handleRevokePeer = async (peerId: string) => {
    if (!window.confirm('Revoke local trust for this device? This prevents it from being used by a future secure session.')) return;
    try {
      await revokePeer(peerId);
      await loadPeers();
      setPairingMsg('Peer trust revoked locally.');
    } catch (error) {
      setPairingMsg(error instanceof Error ? error.message : 'Could not revoke the peer.');
    }
  };

  const filteredLogs = auditLogs.filter(log => log.user_id.toLowerCase().includes(auditFilter.toLowerCase()));

  return (
    <div className="h-screen w-full bg-[#0c0e14] text-[#dde1ec] flex flex-col pt-safe pb-safe-nav relative">
      <div className="p-4 bg-[#14171f] border-b border-[#252a3a] shrink-0">
        <h1 className="text-xl font-bold tracking-widest text-white uppercase">System Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">

        {/* User Profile */}
        <section className="bg-[#1c2030] border border-[#252a3a] rounded-lg p-4">
          <h2 className="text-xs font-bold text-[#7880a0] uppercase tracking-widest mb-4 border-b border-[#252a3a] pb-2">Active Operator</h2>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-bold uppercase">{currentUser?.name}</span>
            <span className="text-[10px] bg-[#3a7bd5] text-white px-2 py-1 rounded font-mono">{currentUser?.badge}</span>
          </div>
          <p className="text-[10px] text-[#7880a0] uppercase tracking-widest mb-4">Clearance: {currentUser?.role}</p>
          <button onClick={logout} className="w-full py-3 border border-[#454d66] text-[#dde1ec] rounded text-xs font-bold uppercase hover:bg-[#252a3a]">Terminate Session</button>
        </section>

        {/* TACTICAL MESH NETWORK (DARK SYNC) - AVAILABLE TO ALL OPERATORS */}
        <section className="bg-[#1c2030] border border-[#2ecc71] rounded-lg p-4">
          <div className="flex justify-between items-end border-b border-[#2ecc71]/30 pb-2 mb-4">
            <h2 className="text-xs font-bold text-[#2ecc71] uppercase tracking-widest">Tactical Mesh Discovery</h2>
            <span className={`text-[9px] px-2 py-1 rounded ${isHardwareReady ? 'bg-[#2ecc71]/20 text-[#2ecc71]' : 'bg-[#7880a0]/20 text-[#7880a0]'}`}>
              {isHardwareReady ? 'HARDWARE ONLINE' : 'OFFLINE'}
            </span>
          </div>

          {!isHardwareReady ? (
            <button onClick={initializeMesh} className="w-full py-3 bg-[#2ecc71]/10 border border-[#2ecc71] text-[#2ecc71] rounded text-xs font-bold uppercase hover:bg-[#2ecc71]/20 transition-colors">
              Initialize Radio Hardware
            </button>
          ) : (
            <div className="space-y-4">
              <div className="flex space-x-2">
                {!isScanning ? (
                  <button onClick={startDiscovery} className="flex-1 py-3 bg-[#2ecc71] text-[#0c0e14] rounded text-xs font-bold uppercase hover:bg-[#27ae60] transition-colors">
                    Start Tactical Scan
                  </button>
                ) : (
                  <button onClick={stopDiscovery} className="flex-1 py-3 bg-[#e74c3c] text-white rounded text-xs font-bold uppercase hover:bg-[#c0392b] transition-colors">
                    Stop Scanning
                  </button>
                )}
              </div>

              {discoveredPeers.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-[10px] text-[#7880a0] uppercase tracking-widest">Nearby Operators</p>
                  {discoveredPeers.map(peer => (
                    <div key={peer.deviceId} className="flex justify-between items-center bg-[#0c0e14] p-2 rounded border border-[#252a3a]">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-[#dde1ec]">{peer.name}</span>
                        <span className="text-[9px] text-[#7880a0] font-mono">{peer.deviceId}</span>
                      </div>
                      <span className="text-[9px] text-[#2ecc71]">RSSI: {peer.rssi}</span>
                    </div>
                  ))}
                </div>
              )}
              {isScanning && discoveredPeers.length === 0 && (
                <p className="text-[10px] text-[#2ecc71] italic text-center animate-pulse mt-2">Scanning for nearby radio devices. No intelligence is transferred.</p>
              )}
              {transferStatus && <p className="text-[10px] text-[#7880a0] mt-3 leading-relaxed">{transferStatus}</p>}
            </div>
          )}
        </section>

        {canManagePairing && (
          <section className="bg-[#1c2030] border border-[#7c4dbb] rounded-lg p-4">
            <div className="flex justify-between items-end border-b border-[#7c4dbb]/30 pb-2 mb-4">
              <h2 className="text-xs font-bold text-[#b893e6] uppercase tracking-widest">Verified Offline Pairing</h2>
              <span className="text-[9px] px-2 py-1 rounded bg-[#7c4dbb]/20 text-[#b893e6]">NO TRANSFER</span>
            </div>
            <p className="text-[10px] text-[#7880a0] leading-relaxed mb-3">Pairing stores a verified device identity locally. It does not send or receive intelligence. Compare the short authentication code in person before confirming a peer.</p>
            {deviceIdentity ? (
              <div className="bg-[#0c0e14] border border-[#252a3a] rounded p-3 mb-4">
                <p className="text-[9px] uppercase text-[#7880a0]">This device fingerprint</p>
                <p className="font-mono text-[10px] text-[#dde1ec] break-all mt-1">{deviceIdentity.fingerprint.match(/.{1,4}/g)?.join('-')}</p>
              </div>
            ) : <p className="text-[10px] text-[#f39c12] mb-4">A secure device identity is available only in the installed Android app.</p>}

            <div className="space-y-2 border-t border-[#252a3a] pt-4">
              <p className="text-[10px] font-bold text-[#dde1ec] uppercase">1. Create a pairing code</p>
              <input value={pairingDeviceName} onChange={(e) => setPairingDeviceName(e.target.value)} maxLength={64} placeholder="DEVICE NAME (e.g. Field handset A)" className="w-full bg-[#0c0e14] border border-[#252a3a] rounded p-3 text-xs text-white focus:border-[#7c4dbb] focus:outline-none" />
              <button onClick={handleCreatePairingCode} disabled={!deviceIdentity} className="w-full py-3 bg-[#7c4dbb] text-white rounded text-xs font-bold uppercase disabled:opacity-40">Create 10-minute pairing code</button>
              {pairingCode && <textarea readOnly value={pairingCode} className="w-full h-20 bg-[#0c0e14] border border-[#252a3a] rounded p-2 text-[9px] text-[#dde1ec] font-mono break-all" aria-label="Generated pairing code" />}
            </div>

            <div className="space-y-2 border-t border-[#252a3a] pt-4 mt-4">
              <p className="text-[10px] font-bold text-[#dde1ec] uppercase">2. Inspect a peer pairing code</p>
              <textarea value={receivedPairingCode} onChange={(e) => setReceivedPairingCode(e.target.value)} placeholder="PASTE PEER PAIRING CODE" className="w-full h-20 bg-[#0c0e14] border border-[#252a3a] rounded p-2 text-[9px] text-white font-mono focus:border-[#7c4dbb] focus:outline-none" />
              <button onClick={handleImportPairingCode} disabled={!deviceIdentity || !receivedPairingCode.trim()} className="w-full py-3 border border-[#b893e6] text-[#b893e6] rounded text-xs font-bold uppercase disabled:opacity-40">Verify signed invitation</button>
            </div>

            {pendingVerification && (
              <div className="mt-4 bg-[#7c4dbb]/10 border border-[#7c4dbb] rounded p-3">
                <p className="text-[10px] text-[#b893e6] uppercase font-bold">3. Compare in person before trust</p>
                <p className="text-xs text-[#dde1ec] mt-2">Peer: <strong>{pendingVerification.peer.display_name}</strong></p>
                <p className="font-mono text-lg tracking-widest text-white mt-2">{pendingVerification.shortAuthenticationCode}</p>
                <p className="text-[10px] text-[#7880a0] mt-2">Only mark verified if this exact code appears on both devices while the responsible operators are present.</p>
                <div className="flex space-x-2 mt-3">
                  <button onClick={() => handleConfirmPeer(pendingVerification.peer.peer_id)} disabled={pendingVerification.peer.status === 'revoked'} className="flex-1 py-2 bg-[#2ecc71] text-[#0c0e14] rounded text-[10px] font-bold uppercase disabled:opacity-40">Mark verified</button>
                  <button onClick={clearPendingVerification} className="flex-1 py-2 border border-[#454d66] text-[#dde1ec] rounded text-[10px] font-bold uppercase">Cancel</button>
                </div>
              </div>
            )}

            {trustedPeers.length > 0 && (
              <div className="mt-4 border-t border-[#252a3a] pt-4 space-y-2">
                <p className="text-[10px] font-bold text-[#7880a0] uppercase">Local peer trust registry</p>
                {trustedPeers.map((peer) => (
                  <div key={peer.peer_id} className="bg-[#0c0e14] border border-[#252a3a] rounded p-3">
                    <div className="flex justify-between gap-3"><span className="text-xs text-[#dde1ec] font-bold truncate">{peer.display_name}</span><span className={`text-[9px] uppercase ${peer.status === 'verified' ? 'text-[#2ecc71]' : peer.status === 'revoked' ? 'text-[#e74c3c]' : 'text-[#f39c12]'}`}>{peer.status}</span></div>
                    <p className="font-mono text-[9px] text-[#7880a0] break-all mt-1">{peer.fingerprint.match(/.{1,4}/g)?.join('-')}</p>
                    {peer.status !== 'revoked' && <button onClick={() => handleRevokePeer(peer.peer_id)} className="mt-2 text-[9px] text-[#e74c3c] uppercase font-bold">Revoke local trust</button>}
                  </div>
                ))}
              </div>
            )}
            {pairingMsg && <p className="text-[10px] text-[#b893e6] mt-4 leading-relaxed">{pairingMsg}</p>}
          </section>
        )}

        {/* Master Admin Controls */}
        {currentUser?.role === 'admin' && (
          <>
            <section className="bg-[#1c2030] border border-[#f39c12] rounded-lg p-4">
              <h2 className="text-xs font-bold text-[#f39c12] uppercase tracking-widest mb-4 border-b border-[#f39c12]/30 pb-2">Admin Command Deck</h2>
              <p className="text-[10px] text-[#7880a0] mb-4">Provision new operator access to local hardware.</p>
              <form onSubmit={handleAddUser} className="space-y-3">
                <input type="text" value={newBadge} onChange={e => setNewBadge(e.target.value.toUpperCase())} required placeholder="BADGE (e.g. WYP-112)" autoCapitalize="characters" autoCorrect="off" className="w-full bg-[#0c0e14] border border-[#252a3a] rounded p-3 text-xs text-white focus:border-[#f39c12] focus:outline-none uppercase" />
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)} required placeholder="OPERATOR NAME" className="w-full bg-[#0c0e14] border border-[#252a3a] rounded p-3 text-xs text-white focus:border-[#f39c12] focus:outline-none" />
                <select value={newRole} onChange={e => setNewRole(e.target.value as Exclude<UserRole, 'admin'>)} className="w-full bg-[#0c0e14] border border-[#252a3a] rounded p-3 text-xs text-white focus:border-[#f39c12] focus:outline-none uppercase">
                  {USER_ROLES.filter((role): role is Exclude<UserRole, 'admin'> => role !== 'admin').map(role => <option key={role} value={role}>{role}</option>)}
                </select>
                <input type="password" value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))} required placeholder="6-DIGIT PIN" maxLength={6} inputMode="numeric" pattern="[0-9]*" autoComplete="new-password" className="w-full bg-[#0c0e14] border border-[#252a3a] rounded p-3 text-xs tracking-widest text-white focus:border-[#f39c12] focus:outline-none font-mono" />
                <button type="submit" className="w-full py-3 bg-[#f39c12] text-white rounded text-xs font-bold uppercase hover:bg-[#e67e22]">Provision Operator</button>
              </form>
              {adminMsg && <p className="text-[10px] text-[#f39c12] mt-3 font-bold uppercase">{adminMsg}</p>}
            </section>

            <section className="bg-[#1c2030] border border-[#b893e6] rounded-lg p-4">
              <div className="flex justify-between items-end border-b border-[#b893e6]/30 pb-2 mb-3">
                <div>
                  <h2 className="text-xs font-bold text-[#b893e6] uppercase tracking-widest">Operator lifecycle</h2>
                  <p className="mt-1 text-[10px] text-[#7880a0]">PIN resets, role changes, and account status changes require re-authentication and are written to the audit ledger.</p>
                </div>
                <span className="text-[9px] px-2 py-1 rounded bg-[#b893e6]/20 text-[#b893e6]">{operators.length} local</span>
              </div>

              <div className="space-y-3">
                {operators.length === 0 && <p className="text-xs text-[#7880a0] text-center py-3">No non-administrator operators have been provisioned on this device.</p>}
                {operators.map((operator) => {
                  const isSelected = selectedOperatorId === operator.id;
                  const isDisabled = operator.status === 'disabled';
                  return (
                    <article key={operator.id} className={`rounded border ${isDisabled ? 'border-[#c0392b]/60 bg-[#c0392b]/5' : 'border-[#252a3a] bg-[#0c0e14]'}`}>
                      <button onClick={() => selectOperator(operator.id, operator.role)} className="w-full p-3 text-left">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-mono text-xs font-bold text-[#dde1ec] truncate">{operator.badge}</p>
                            <p className="mt-1 text-[10px] text-[#7880a0] truncate">{operator.name} · {operator.role}</p>
                          </div>
                          <span className={`shrink-0 text-[9px] px-2 py-1 rounded font-bold uppercase ${isDisabled ? 'bg-[#c0392b]/20 text-[#ff9d95]' : 'bg-[#1d9a6c]/20 text-[#55c987]'}`}>{operator.status}</span>
                        </div>
                        <p className="mt-2 text-[9px] text-[#7880a0]">Last sign-in: {operator.lastLogin ? new Date(operator.lastLogin).toLocaleString() : 'Never'}{operator.biometricEnabled ? ' · biometric enrolled' : ''}</p>
                        {isDisabled && <p className="mt-1 text-[9px] text-[#ff9d95]">Disabled: {operator.disabledReason || 'No reason recorded'}</p>}
                      </button>

                      {isSelected && (
                        <div className="border-t border-[#252a3a] p-3 space-y-3">
                          <div className="flex justify-between items-center">
                            <p className="text-[10px] uppercase tracking-widest font-bold text-[#b893e6]">Manage {operator.badge}</p>
                            <button onClick={() => setSelectedOperatorId(null)} className="text-[10px] text-[#7880a0] font-bold uppercase">Close</button>
                          </div>

                          {!isDisabled && (
                            <>
                              <label className="block text-[10px] uppercase font-bold text-[#7880a0]">New six-digit PIN
                                <input type="password" value={lifecyclePin} onChange={(event) => setLifecyclePin(event.target.value.replace(/\D/g, ''))} maxLength={6} inputMode="numeric" pattern="[0-9]*" autoComplete="new-password" placeholder="PIN" className="mt-1 w-full bg-[#14171f] border border-[#454d66] rounded p-3 text-xs tracking-widest text-white focus:border-[#b893e6] focus:outline-none font-mono" />
                              </label>
                              <button onClick={handleResetOperatorPin} disabled={isManagingOperator || lifecyclePin.length !== 6} className="w-full py-2.5 rounded border border-[#b893e6] text-[#d8c8ff] text-xs font-bold uppercase disabled:opacity-40">Reset PIN and revoke biometrics</button>

                              <label className="block text-[10px] uppercase font-bold text-[#7880a0]">Operational role
                                <select value={lifecycleRole} onChange={(event) => setLifecycleRole(event.target.value as Exclude<UserRole, 'admin'>)} className="mt-1 w-full bg-[#14171f] border border-[#454d66] rounded p-3 text-xs text-white focus:border-[#b893e6] focus:outline-none uppercase">
                                  {USER_ROLES.filter((role): role is Exclude<UserRole, 'admin'> => role !== 'admin').map(role => <option key={role} value={role}>{role}</option>)}
                                </select>
                              </label>
                              <button onClick={handleChangeOperatorRole} disabled={isManagingOperator || lifecycleRole === operator.role} className="w-full py-2.5 rounded border border-[#3a7bd5] text-[#72a7f0] text-xs font-bold uppercase disabled:opacity-40">Change role and revoke biometrics</button>
                            </>
                          )}

                          <label className="block text-[10px] uppercase font-bold text-[#7880a0]">{isDisabled ? 'Reinstatement reason' : 'Disablement reason'}
                            <textarea value={lifecycleReason} onChange={(event) => setLifecycleReason(event.target.value)} maxLength={500} placeholder={isDisabled ? 'Why is this account being reinstated?' : 'Why is this account being disabled?'} className="mt-1 w-full min-h-20 bg-[#14171f] border border-[#454d66] rounded p-3 text-xs text-white focus:border-[#b893e6] focus:outline-none" />
                          </label>
                          <button onClick={() => handleOperatorStatus(isDisabled)} disabled={isManagingOperator || lifecycleReason.trim().length < 5} className={`w-full py-2.5 rounded text-xs font-bold uppercase disabled:opacity-40 ${isDisabled ? 'bg-[#1d9a6c] text-white' : 'bg-[#c0392b] text-white'}`}>{isDisabled ? 'Reinstate account' : 'Disable account'}</button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
              {lifecycleMsg && <p role="status" className="mt-3 text-[10px] text-[#d8c8ff] font-bold leading-relaxed">{lifecycleMsg}</p>}
            </section>

            {/* THE IMMUTABLE AUDIT LEDGER */}
            <section className="bg-[#1c2030] border border-[#3a7bd5] rounded-lg p-4">
              <div className="flex justify-between items-end border-b border-[#3a7bd5]/30 pb-2 mb-4">
                <h2 className="text-xs font-bold text-[#3a7bd5] uppercase tracking-widest">Immutable Audit Ledger</h2>
                <span className={`text-[9px] px-2 py-1 rounded ${auditVerification?.valid ? 'bg-[#2ecc71]/20 text-[#2ecc71]' : 'bg-[#f39c12]/20 text-[#f39c12]'}`}>{auditVerification?.valid ? 'CHAIN VERIFIED' : 'VERIFYING'}</span>
              </div>

              <p className={`text-[10px] mb-3 ${auditVerification?.valid ? 'text-[#2ecc71]' : 'text-[#f39c12]'}`}>{auditVerification?.valid ? `${auditVerification.verifiedEntries} hash-linked entries verified${auditVerification.legacyEntries ? `; ${auditVerification.legacyEntries} legacy entries retained` : ''}.` : 'The audit chain has not yet been verified.'}</p>
              <input type="text" value={auditFilter} onChange={e => setAuditFilter(e.target.value)} placeholder="Filter by Badge ID..." className="w-full bg-[#0c0e14] border border-[#252a3a] rounded p-2 text-xs text-white focus:border-[#3a7bd5] focus:outline-none uppercase mb-4" />

              <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                {filteredLogs.length === 0 ? (
                  <p className="text-[10px] text-[#7880a0] italic text-center">No logs found.</p>
                ) : (
                  filteredLogs.map(log => (
                    <div key={log.id} className="bg-[#0c0e14] p-2 rounded border border-[#252a3a]">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-[9px] text-[#e74c3c] font-bold">{log.action}</span>
                        <span className="text-[8px] text-[#7880a0] font-mono">{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="text-[10px] text-[#dde1ec] mb-1">{log.details}</p>
                      <div className="flex justify-between items-center mt-2 border-t border-[#252a3a] pt-1">
                        <span className="text-[8px] text-[#7880a0]">User: <strong className="text-[#3a7bd5]">{log.user_id}</strong></span>
                        <span className="text-[8px] text-[#7880a0] truncate w-24 text-right" title={log.target_id}>{log.target_id}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        )}

        <section className="bg-[#1c2030] border border-[#c0392b] rounded-lg p-4 mt-8">
          <h2 className="text-xs font-bold text-[#c0392b] uppercase tracking-widest mb-4 border-b border-[#c0392b]/30 pb-2">Emergency Protocols</h2>
          <p className="text-xs text-[#7880a0] mb-4">Engaging this protocol permanently sanitises local intelligence, audit history, and operator profiles. Only a fresh reset record remains.</p>
          <button onClick={handleWipe} className="w-full py-4 bg-[#c0392b] text-white rounded text-sm font-bold uppercase tracking-widest shadow-[0_0_15px_rgba(192,57,43,0.4)] hover:bg-[#a93226]">WIPE ALL DATA</button>
        </section>
      </div>

      <BottomTabBar />
    </div>
  );
};

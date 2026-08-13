import { create } from 'zustand';
import { getDb } from '../capacitor/db';
import { useAuthStore } from './authStore';
import { assertPermission } from '../utils/permissions';
import { appendAuditEntry } from '../utils/auditLedger';
import { requireHighRiskReauthentication } from '../utils/highRiskAuth';
import {
  createPairingInvitation,
  getPairingIdentity,
  parseAndVerifyPairingCode,
  type PreparedPairingInvitation,
} from '../utils/offlinePairing';
import type { DeviceIdentity } from '../capacitor/deviceIdentity';

export type TrustedPeerStatus = 'pending' | 'verified' | 'revoked';

export interface TrustedPeer {
  peer_id: string;
  display_name: string;
  public_key: string;
  fingerprint: string;
  status: TrustedPeerStatus;
  invitation_expires_at: string;
  paired_at: string;
  verified_at: string | null;
  last_seen_at: string | null;
  notes: string | null;
}

export interface PendingPeerVerification {
  peer: TrustedPeer;
  shortAuthenticationCode: string;
}

interface PairingState {
  deviceIdentity: DeviceIdentity | null;
  peers: TrustedPeer[];
  pendingVerification: PendingPeerVerification | null;
  isLoading: boolean;
  loadIdentity: () => Promise<void>;
  loadPeers: () => Promise<void>;
  createInvitation: (displayName: string) => Promise<PreparedPairingInvitation>;
  importInvitation: (code: string) => Promise<PendingPeerVerification>;
  confirmPeerVerification: (peerId: string) => Promise<void>;
  revokePeer: (peerId: string) => Promise<void>;
  clearPendingVerification: () => void;
}

const createPeerId = (): string => {
  if (window.crypto?.randomUUID) return `peer_${window.crypto.randomUUID()}`;
  return `peer_${Date.now()}_${Math.random().toString(16).slice(2, 12)}`;
};

const currentOperator = (): string => useAuthStore.getState().currentUser?.badge || 'SYSTEM_UNKNOWN';
const assertPairingManager = (): void => assertPermission(useAuthStore.getState().currentUser?.role, 'pairing:manage');

export const usePairingStore = create<PairingState>((set, get) => ({
  deviceIdentity: null,
  peers: [],
  pendingVerification: null,
  isLoading: false,

  loadIdentity: async () => {
    assertPairingManager();
    set({ isLoading: true });
    try {
      set({ deviceIdentity: await getPairingIdentity() });
    } finally {
      set({ isLoading: false });
    }
  },

  loadPeers: async () => {
    assertPairingManager();
    set({ isLoading: true });
    try {
      const db = await getDb();
      const result = await db.query('SELECT * FROM trusted_peers ORDER BY CASE status WHEN \'pending\' THEN 0 WHEN \'verified\' THEN 1 ELSE 2 END, display_name COLLATE NOCASE');
      set({ peers: (result.values || []) as TrustedPeer[] });
    } finally {
      set({ isLoading: false });
    }
  },

  createInvitation: async (displayName) => {
    assertPairingManager();
    const invitation = await createPairingInvitation(displayName);
    const db = await getDb();
    await appendAuditEntry(db, 'CREATE_PAIRING_INVITATION', invitation.deviceId, `Created expiring offline pairing invitation for ${invitation.displayName}`, currentOperator());
    return invitation;
  },

  importInvitation: async (code) => {
    assertPairingManager();
    const { invitation, shortAuthenticationCode } = await parseAndVerifyPairingCode(code);
    const db = await getDb();
    const existing = await db.query('SELECT peer_id, status, paired_at, verified_at FROM trusted_peers WHERE fingerprint = ? LIMIT 1', [invitation.fingerprint]);
    const existingPeer = existing.values?.[0];
    const status: TrustedPeerStatus = existingPeer?.status === 'verified' ? 'verified' : existingPeer?.status === 'revoked' ? 'revoked' : 'pending';
    const peer: TrustedPeer = {
      peer_id: existingPeer?.peer_id || createPeerId(),
      display_name: invitation.displayName,
      public_key: invitation.publicKey,
      fingerprint: invitation.fingerprint,
      status,
      invitation_expires_at: invitation.expiresAt,
      paired_at: existingPeer?.paired_at || new Date().toISOString(),
      verified_at: existingPeer?.verified_at || null,
      last_seen_at: null,
      notes: null,
    };

    await db.execute('BEGIN IMMEDIATE;');
    try {
      await db.run(
        `INSERT INTO trusted_peers (peer_id, display_name, public_key, fingerprint, status, invitation_expires_at, paired_at, verified_at, last_seen_at, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(fingerprint) DO UPDATE SET
           display_name = excluded.display_name,
           public_key = excluded.public_key,
           invitation_expires_at = excluded.invitation_expires_at,
           status = CASE WHEN trusted_peers.status = 'verified' THEN 'verified' WHEN trusted_peers.status = 'revoked' THEN 'revoked' ELSE 'pending' END`,
        [peer.peer_id, peer.display_name, peer.public_key, peer.fingerprint, peer.status, peer.invitation_expires_at, peer.paired_at, peer.verified_at, peer.last_seen_at, peer.notes],
      );
      await appendAuditEntry(db, 'IMPORT_PAIRING_INVITATION', peer.peer_id, `Imported signed pairing invitation for ${peer.display_name}; verification is ${peer.status}.`, currentOperator());
      await db.execute('COMMIT;');
    } catch (error) {
      try { await db.execute('ROLLBACK;'); } catch { /* Preserve the original import failure. */ }
      throw error;
    }

    const resolvedPeer: TrustedPeer = { ...peer, status: peer.status };
    set({ peers: [resolvedPeer, ...get().peers.filter((item) => item.fingerprint !== resolvedPeer.fingerprint)], pendingVerification: { peer: resolvedPeer, shortAuthenticationCode } });
    return { peer: resolvedPeer, shortAuthenticationCode };
  },

  confirmPeerVerification: async (peerId) => {
    assertPairingManager();
    await requireHighRiskReauthentication('Confirm verified offline device trust');
    const db = await getDb();
    const now = new Date().toISOString();
    const existing = await db.query('SELECT * FROM trusted_peers WHERE peer_id = ? LIMIT 1', [peerId]);
    const peer = existing.values?.[0] as TrustedPeer | undefined;
    if (!peer) throw new Error('The pairing record could not be found.');
    if (peer.status === 'revoked') throw new Error('A revoked device cannot be verified without a new pairing process.');

    await db.execute('BEGIN IMMEDIATE;');
    try {
      await db.run('UPDATE trusted_peers SET status = ?, verified_at = ? WHERE peer_id = ?', ['verified', now, peerId]);
      await appendAuditEntry(db, 'VERIFY_PEER_DEVICE', peerId, `Verified device ${peer.display_name} after human comparison of the short authentication code.`, currentOperator());
      await db.execute('COMMIT;');
    } catch (error) {
      try { await db.execute('ROLLBACK;'); } catch { /* Preserve the original verification failure. */ }
      throw error;
    }
    set({ peers: get().peers.map((item) => item.peer_id === peerId ? { ...item, status: 'verified', verified_at: now } : item), pendingVerification: null });
  },

  revokePeer: async (peerId) => {
    assertPairingManager();
    await requireHighRiskReauthentication('Revoke offline device trust');
    const db = await getDb();
    const result = await db.query('SELECT display_name FROM trusted_peers WHERE peer_id = ? LIMIT 1', [peerId]);
    const peer = result.values?.[0];
    if (!peer) throw new Error('The pairing record could not be found.');

    await db.execute('BEGIN IMMEDIATE;');
    try {
      await db.run('UPDATE trusted_peers SET status = ? WHERE peer_id = ?', ['revoked', peerId]);
      await appendAuditEntry(db, 'REVOKE_PEER_DEVICE', peerId, `Revoked offline trust for device ${peer.display_name}.`, currentOperator());
      await db.execute('COMMIT;');
    } catch (error) {
      try { await db.execute('ROLLBACK;'); } catch { /* Preserve the original revocation failure. */ }
      throw error;
    }
    set({ peers: get().peers.map((item) => item.peer_id === peerId ? { ...item, status: 'revoked' } : item), pendingVerification: get().pendingVerification?.peer.peer_id === peerId ? null : get().pendingVerification });
  },

  clearPendingVerification: () => set({ pendingVerification: null }),
}));

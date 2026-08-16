import { create } from 'zustand';
import { getDb } from '../capacitor/db';
import { getDeviceIdentity, signWithDeviceIdentity, verifyDeviceSignature } from '../capacitor/deviceIdentity';
import { validateSyncDelta, type SyncDeltaPayload } from '../utils/syncProtocol';
import { appendAuditEntry } from '../utils/auditLedger';
import { useAuthStore } from './authStore';
const currentOperator = (): string => useAuthStore.getState().currentUser?.badge || 'SYSTEM_UNKNOWN';
import { useCaseStore } from './caseStore';

export interface TrustedPeer {
  peerId: string;
  displayName: string;
  publicKey: string;
  fingerprint: string;
  status: 'pending' | 'verified' | 'revoked';
  invitationExpiresAt: string;
  pairedAt: string;
  verifiedAt: string | null;
  lastSeenAt: string | null;
  notes: string;
}

interface SyncState {
  peers: TrustedPeer[];
  activePeer: TrustedPeer | null;
  isSyncing: boolean;
  syncLog: string[];
  isScanning: boolean;
  isHardwareReady: boolean;
  discoveredPeers: Array<{ deviceId: string; name: string; rssi: number }>;
  transferStatus: string | null;
  loadPeers: () => Promise<void>;
  registerPeer: (displayName: string, publicKey: string, fingerprint: string, notes?: string) => Promise<TrustedPeer>;
  verifyPeer: (fingerprint: string) => Promise<void>;
  revokePeer: (fingerprint: string) => Promise<void>;
  generateSyncDelta: (caseId: string) => Promise<SyncDeltaPayload>;
  applySyncDelta: (delta: SyncDeltaPayload) => Promise<void>;
  initializeMesh: () => Promise<void>;
  startDiscovery: () => Promise<void>;
  stopDiscovery: () => Promise<void>;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  peers: [],
  activePeer: null,
  isSyncing: false,
  syncLog: [],
  isScanning: false,
  isHardwareReady: true,
  discoveredPeers: [],
  transferStatus: 'Secure peer-to-peer sync engine ready.',
  initializeMesh: async () => {},
  startDiscovery: async () => {},
  stopDiscovery: async () => {},

  loadPeers: async () => {
    try {
      const db = await getDb();
      const response = await db.query('SELECT * FROM trusted_peers ORDER BY paired_at DESC');
      set({
        peers: (response.values || []).map((row: any): TrustedPeer => ({
          peerId: String(row.peer_id),
          displayName: String(row.display_name),
          publicKey: String(row.public_key),
          fingerprint: String(row.fingerprint),
          status: row.status as 'pending' | 'verified' | 'revoked',
          invitationExpiresAt: String(row.invitation_expires_at),
          pairedAt: String(row.paired_at),
          verifiedAt: row.verified_at ? String(row.verified_at) : null,
          lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : null,
          notes: row.notes ? String(row.notes) : '',
        })),
      });
    } catch (error) {
      console.warn('Failed to load trusted peers.', error);
    }
  },

  registerPeer: async (displayName, publicKey, fingerprint, notes = '') => {
    const db = await getDb();
    const peerId = `peer_${Math.random().toString(36).substring(2, 11)}`;
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const peer: TrustedPeer = {
      peerId, displayName: displayName.trim().slice(0, 120), publicKey, fingerprint, status: 'pending',
      invitationExpiresAt: expiresAt, pairedAt: now, verifiedAt: null, lastSeenAt: null, notes: notes.trim().slice(0, 500),
    };
    await db.run(
      'INSERT INTO trusted_peers (peer_id, display_name, public_key, fingerprint, status, invitation_expires_at, paired_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [peer.peerId, peer.displayName, peer.publicKey, peer.fingerprint, peer.status, peer.invitationExpiresAt, peer.pairedAt, peer.notes]
    );
    await appendAuditEntry(db, 'REGISTER_TRUSTED_PEER', peerId, `Registered trusted peer candidate: ${peer.displayName} (${peer.fingerprint})`, currentOperator());
    await get().loadPeers();
    return peer;
  },

  verifyPeer: async (fingerprint) => {
    const db = await getDb();
    const now = new Date().toISOString();
    await db.run('UPDATE trusted_peers SET status = \'verified\', verified_at = ? WHERE fingerprint = ?', [now, fingerprint]);
    await appendAuditEntry(db, 'VERIFY_TRUSTED_PEER', fingerprint, `Verified trusted peer fingerprint: ${fingerprint}`, currentOperator());
    await get().loadPeers();
  },

  revokePeer: async (fingerprint) => {
    const db = await getDb();
    await db.run('UPDATE trusted_peers SET status = \'revoked\' WHERE fingerprint = ?', [fingerprint]);
    await appendAuditEntry(db, 'REVOKE_TRUSTED_PEER', fingerprint, `Revoked trusted peer fingerprint: ${fingerprint}`, currentOperator());
    await get().loadPeers();
  },

  generateSyncDelta: async (caseId) => {
    const identity = await getDeviceIdentity();
    const db = await getDb();
    const auditRes = await db.query('SELECT entry_hash FROM audit_logs WHERE case_id = ? OR case_id IS NULL ORDER BY timestamp DESC LIMIT 1', [caseId]);
    const auditHeadHash = auditRes.values?.[0]?.entry_hash ? String(auditRes.values[0].entry_hash) : null;

    const nodesRes = await db.query('SELECT * FROM nodes WHERE case_id = ?', [caseId]);
    const edgesRes = await db.query('SELECT * FROM edges WHERE case_id = ?', [caseId]);
    const notesRes = await db.query('SELECT * FROM notes WHERE case_id = ?', [caseId]);
    const provRes = await db.query('SELECT * FROM evidence_provenance WHERE case_id = ?', [caseId]);
    const derivRes = await db.query('SELECT * FROM evidence_derivatives WHERE case_id = ?', [caseId]);
    const movRes = await db.query('SELECT * FROM exhibit_movements WHERE case_id = ?', [caseId]);
    const ctxRes = await db.query('SELECT * FROM observation_contexts WHERE case_id = ?', [caseId]);

    const timestamp = new Date().toISOString();
    const deltaPayload: Omit<SyncDeltaPayload, 'signature'> = {
      caseId,
      senderDeviceId: identity.deviceId,
      senderFingerprint: identity.fingerprint,
      auditHeadHash,
      nodes: nodesRes.values || [],
      edges: edgesRes.values || [],
      notes: notesRes.values || [],
      provenance: provRes.values || [],
      derivatives: derivRes.values || [],
      movements: movRes.values || [],
      contexts: ctxRes.values || [],
      timestamp,
    };

    const signature = await signWithDeviceIdentity(JSON.stringify(deltaPayload));
    return { ...deltaPayload, signature };
  },

  applySyncDelta: async (delta) => {
    set({ isSyncing: true });
    try {
      const peer = get().peers.find((p) => p.fingerprint === delta.senderFingerprint && p.status === 'verified');
      if (!peer) throw new Error('Sync delta sender is not a verified trusted peer.');

      const validation = await validateSyncDelta(delta, peer.fingerprint);
      if (!validation.valid || !delta.signature) {
        throw new Error(`Sync delta verification failed: ${validation.errors.join(', ')}`);
      }

      const signatureValid = await verifyDeviceSignature(peer.publicKey, JSON.stringify({
        caseId: delta.caseId,
        senderDeviceId: delta.senderDeviceId,
        senderFingerprint: delta.senderFingerprint,
        auditHeadHash: delta.auditHeadHash,
        nodes: delta.nodes,
        edges: delta.edges,
        notes: delta.notes,
        provenance: delta.provenance,
        derivatives: delta.derivatives,
        movements: delta.movements,
        contexts: delta.contexts,
        timestamp: delta.timestamp,
      }), delta.signature);

      if (!signatureValid) throw new Error('Sync delta cryptographic signature verification failed.');

      const db = await getDb();
      await db.execute('BEGIN IMMEDIATE;');
      try {
        for (const node of delta.nodes as any[]) {
          await db.run(
            'INSERT OR IGNORE INTO nodes (id, case_id, label, type, confidence, created_at, occurred_at, attributes, review_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [node.id, node.case_id, node.label, node.type, node.confidence || 3, node.created_at, node.occurred_at || null, node.attributes || null, node.review_status || 'not_required']
          );
        }
        for (const edge of delta.edges as any[]) {
          await db.run(
            'INSERT OR IGNORE INTO edges (id, case_id, source, target, label, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [edge.id, edge.case_id, edge.source, edge.target, edge.label, edge.created_at]
          );
        }
        for (const note of delta.notes as any[]) {
          await db.run(
            'INSERT OR IGNORE INTO notes (id, case_id, content, linked_nodes, created_at) VALUES (?, ?, ?, ?, ?)',
            [note.id, note.case_id, note.content, note.linked_nodes || '[]', note.created_at]
          );
        }

        await appendAuditEntry(db, 'SYNC_INBOUND_DELTA', delta.caseId, `Successfully synchronized local delta from peer ${peer.displayName} (${peer.fingerprint})`, currentOperator());
        await db.execute('COMMIT;');
        set((state) => ({ syncLog: [`[${new Date().toISOString()}] Synced case ${delta.caseId} from ${peer.displayName}`, ...state.syncLog] }));
        await useCaseStore.getState().loadGraphElements(delta.caseId);
      } catch (err) {
        try { await db.execute('ROLLBACK;'); } catch {}
        throw err;
      }
    } finally {
      set({ isSyncing: false });
    }
  },
}));

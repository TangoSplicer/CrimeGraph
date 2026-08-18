import { create } from 'zustand';
import { getDb, withDatabaseTransaction } from '../capacitor/db';
import { MeshNetwork } from '../capacitor/mesh';
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

export interface SyncConflict {
  id: string;
  caseId: string;
  peerFingerprint: string;
  recordType: 'node' | 'edge' | 'note';
  recordId: string;
  localPayload: any;
  incomingPayload: any;
  status: 'pending' | 'resolved_local' | 'resolved_incoming';
  createdAt: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
}

interface SyncState {
  peers: TrustedPeer[];
  conflicts: SyncConflict[];
  activePeer: TrustedPeer | null;
  isSyncing: boolean;
  syncLog: string[];
  isScanning: boolean;
  isHardwareReady: boolean;
  discoveredPeers: Array<{ deviceId: string; name: string; rssi: number }>;
  transferStatus: string | null;
  loadPeers: () => Promise<void>;
  loadConflicts: (caseId: string) => Promise<void>;
  resolveConflict: (conflictId: string, resolution: 'resolved_local' | 'resolved_incoming') => Promise<void>;
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
  conflicts: [],
  activePeer: null,
  isSyncing: false,
  syncLog: [],
  isScanning: false,
  isHardwareReady: false,
  discoveredPeers: [],
  transferStatus: 'Tactical Mesh radio is not initialized. Discovery never transfers case intelligence.',
  initializeMesh: async () => {
    set({ isHardwareReady: false, isScanning: false, transferStatus: 'TACTICAL MESH INITIALIZING — requesting local Bluetooth LE access…', discoveredPeers: [] });
    try {
      await MeshNetwork.initializeHardware();
      set({
        isHardwareReady: true,
        isScanning: false,
        transferStatus: 'TACTICAL MESH READY — local beacon advertising is active. Start discovery to scan for nearby CrimeGraph beacons; no case intelligence is transferred.',
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Tactical Mesh radio initialization failed.';
      set({ isHardwareReady: false, isScanning: false, transferStatus: `TACTICAL MESH INACTIVE — ${detail}` });
    }
  },
  startDiscovery: async () => {
    if (!get().isHardwareReady) {
      set({ transferStatus: 'Initialize the Tactical Mesh radio before starting discovery.' });
      return;
    }
    set({ isScanning: true, discoveredPeers: [], transferStatus: 'Scanning locally for CrimeGraph peer beacons. No case intelligence is transferred.' });
    try {
      await MeshNetwork.startTacticalScan((device) => {
        if (!device?.deviceId) return;
        const peer = { deviceId: String(device.deviceId), name: String(device.name || 'Operator Node'), rssi: Number.isFinite(Number(device.rssi)) ? Number(device.rssi) : 0 };
        set((state) => ({
          discoveredPeers: [peer, ...state.discoveredPeers.filter((existing) => existing.deviceId !== peer.deviceId)],
          transferStatus: `Found local peer beacon: ${peer.name}. Discovery does not exchange or authorize intelligence.`,
        }));
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Tactical Mesh discovery could not start.';
      set({ isScanning: false, transferStatus: `TACTICAL MESH READY — discovery is not active. ${detail}` });
    }
  },
  stopDiscovery: async () => {
    try {
      await MeshNetwork.stopTacticalScan();
      set({ isScanning: false, transferStatus: 'Local Tactical Mesh discovery stopped. No intelligence was transferred.' });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Tactical Mesh discovery could not stop cleanly.';
      set({ isScanning: false, transferStatus: `TACTICAL MESH READY — scan stop reported an error: ${detail}` });
    }
  },

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

  loadConflicts: async (caseId: string) => {
    try {
      const db = await getDb();
      const response = await db.query('SELECT * FROM sync_conflicts WHERE case_id = ? ORDER BY created_at DESC', [caseId]);
      set({
        conflicts: (response.values || []).map((row: any): SyncConflict => ({
          id: String(row.id),
          caseId: String(row.case_id),
          peerFingerprint: String(row.peer_fingerprint),
          recordType: row.record_type as 'node' | 'edge' | 'note',
          recordId: String(row.record_id),
          localPayload: JSON.parse(row.local_payload),
          incomingPayload: JSON.parse(row.incoming_payload),
          status: row.status as 'pending' | 'resolved_local' | 'resolved_incoming',
          createdAt: String(row.created_at),
          resolvedBy: row.resolved_by ? String(row.resolved_by) : null,
          resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
        })),
      });
    } catch (error) {
      console.warn('Failed to load sync conflicts.', error);
    }
  },

  resolveConflict: async (conflictId: string, resolution: 'resolved_local' | 'resolved_incoming') => {
    const db = await getDb();
    const now = new Date().toISOString();
    const operator = currentOperator();

    const resolvedCaseId = await withDatabaseTransaction(db, async () => {
      const res = await db.query('SELECT * FROM sync_conflicts WHERE id = ?', [conflictId]);
      const conflict = res.values?.[0];
      if (!conflict) throw new Error('Conflict not found.');

      if (resolution === 'resolved_incoming') {
        const payload = JSON.parse(conflict.incoming_payload);
        if (conflict.record_type === 'node') {
          await db.run(
            'INSERT OR REPLACE INTO nodes (id, case_id, label, type, confidence, created_at, occurred_at, attributes, review_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [payload.id, payload.case_id, payload.label, payload.type, payload.confidence || 3, payload.created_at, payload.occurred_at || null, payload.attributes || null, payload.review_status || 'not_required']
          );
        } else if (conflict.record_type === 'edge') {
          await db.run(
            'INSERT OR REPLACE INTO edges (id, case_id, source, target, label, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [payload.id, payload.case_id, payload.source, payload.target, payload.label, payload.created_at]
          );
        } else if (conflict.record_type === 'note') {
          await db.run(
            'INSERT OR REPLACE INTO notes (id, case_id, content, linked_nodes, created_at) VALUES (?, ?, ?, ?, ?)',
            [payload.id, payload.case_id, payload.content, payload.linked_nodes || '[]', payload.created_at]
          );
        }
      }

      await db.run(
        'UPDATE sync_conflicts SET status = ?, resolved_by = ?, resolved_at = ? WHERE id = ?',
        [resolution, operator, now, conflictId]
      );

      await appendAuditEntry(db, 'RESOLVE_SYNC_CONFLICT', conflict.case_id, `Resolved sync conflict for ${conflict.record_type}:${conflict.record_id} with strategy: ${resolution}`, operator);
      return String(conflict.case_id);
    });

    await get().loadConflicts(resolvedCaseId);
    await useCaseStore.getState().loadGraphElements(resolvedCaseId);
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
      await withDatabaseTransaction(db, async () => {
        for (const node of delta.nodes as any[]) {
          const existing = await db.query('SELECT * FROM nodes WHERE id = ?', [node.id]);
          if (existing.values && existing.values.length > 0) {
            const local = existing.values[0];
            if (local.label !== node.label || local.type !== node.type || (local.attributes || '') !== (node.attributes || '')) {
              const conflictId = `conf_${Math.random().toString(36).substring(2, 11)}`;
              await db.run(
                'INSERT INTO sync_conflicts (id, case_id, peer_fingerprint, record_type, record_id, local_payload, incoming_payload, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [conflictId, delta.caseId, peer.fingerprint, 'node', node.id, JSON.stringify(local), JSON.stringify(node), 'pending', new Date().toISOString()]
              );
            }
          } else {
            await db.run(
              'INSERT INTO nodes (id, case_id, label, type, confidence, created_at, occurred_at, attributes, review_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [node.id, node.case_id, node.label, node.type, node.confidence || 3, node.created_at, node.occurred_at || null, node.attributes || null, node.review_status || 'not_required']
            );
          }
        }
        for (const edge of delta.edges as any[]) {
          const existing = await db.query('SELECT * FROM edges WHERE id = ?', [edge.id]);
          if (existing.values && existing.values.length > 0) {
            const local = existing.values[0];
            if (local.label !== edge.label || local.source !== edge.source || local.target !== edge.target) {
              const conflictId = `conf_${Math.random().toString(36).substring(2, 11)}`;
              await db.run(
                'INSERT INTO sync_conflicts (id, case_id, peer_fingerprint, record_type, record_id, local_payload, incoming_payload, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [conflictId, delta.caseId, peer.fingerprint, 'edge', edge.id, JSON.stringify(local), JSON.stringify(edge), 'pending', new Date().toISOString()]
              );
            }
          } else {
            await db.run(
              'INSERT OR IGNORE INTO edges (id, case_id, source, target, label, created_at) VALUES (?, ?, ?, ?, ?, ?)',
              [edge.id, edge.case_id, edge.source, edge.target, edge.label, edge.created_at]
            );
          }
        }
        for (const note of delta.notes as any[]) {
          const existing = await db.query('SELECT * FROM notes WHERE id = ?', [note.id]);
          if (existing.values && existing.values.length > 0) {
            const local = existing.values[0];
            if (local.content !== note.content) {
              const conflictId = `conf_${Math.random().toString(36).substring(2, 11)}`;
              await db.run(
                'INSERT INTO sync_conflicts (id, case_id, peer_fingerprint, record_type, record_id, local_payload, incoming_payload, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [conflictId, delta.caseId, peer.fingerprint, 'note', note.id, JSON.stringify(local), JSON.stringify(note), 'pending', new Date().toISOString()]
              );
            }
          } else {
            await db.run(
              'INSERT OR IGNORE INTO notes (id, case_id, content, linked_nodes, created_at) VALUES (?, ?, ?, ?, ?)',
              [note.id, note.case_id, note.content, note.linked_nodes || '[]', note.created_at]
            );
          }
        }

        await appendAuditEntry(db, 'SYNC_INBOUND_DELTA', delta.caseId, `Successfully synchronized local delta from peer ${peer.displayName} (${peer.fingerprint})`, currentOperator());
      });
      set((state) => ({ syncLog: [`[${new Date().toISOString()}] Synced case ${delta.caseId} from ${peer.displayName}`, ...state.syncLog] }));
      await useCaseStore.getState().loadGraphElements(delta.caseId);
    } finally {
      set({ isSyncing: false });
    }
  },
}));

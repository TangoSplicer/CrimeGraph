// Tactical mesh transfer is intentionally fail-closed until the transport supports
// authenticated peers, device-bound key provisioning, replay protection, and an inbound apply path.
// Radio discovery can remain available, but no intelligence may be packaged or transmitted.

const SECURE_MESH_UNAVAILABLE = 'Secure mesh transfer is unavailable: peer identity, key provisioning, replay protection, and verified inbound persistence are not configured.';

export const SyncEngine = {
  generateDeltaPayload: async (_localLogs: unknown[], _peerTimestamp: number): Promise<string> => {
    throw new Error(SECURE_MESH_UNAVAILABLE);
  },

  processIncomingPayload: async (_base64Payload: string): Promise<never> => {
    throw new Error(SECURE_MESH_UNAVAILABLE);
  },
};

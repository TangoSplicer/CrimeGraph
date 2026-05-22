// Phase 2: Cryptographic Handshake & Diff Engine

// Standard AES-GCM 256-bit configuration for Tactical Mesh
const ENCRYPTION_ALGORITHM = 'AES-GCM';

async function getMeshKey(): Promise<CryptoKey> {
  // In a full production build, this key is derived from the Operation Password.
  // For this scaffold, we generate a deterministic 256-bit buffer.
  const rawKey = new Uint8Array(32); 
  return await window.crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: ENCRYPTION_ALGORITHM },
    false,
    ['encrypt', 'decrypt']
  );
}

export const SyncEngine = {
  /**
   * Diff the local audit ledger against the peer's timestamp and package the delta.
   */
  generateDeltaPayload: async (localLogs: any[], peerTimestamp: number): Promise<string> => {
    // Filter immutable ledger for actions that occurred after the peer's last known timestamp
    const deltaLogs = localLogs.filter(log => new Date(log.timestamp).getTime() > peerTimestamp);
    
    if (deltaLogs.length === 0) return ''; // Nothing to sync

    const payload = JSON.stringify({
      protocol: 'DARK_SYNC_V1',
      timestamp: Date.now(),
      actionCount: deltaLogs.length,
      logs: deltaLogs
    });

    // Web Crypto API AES-GCM 256-bit Encryption
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await getMeshKey();
    const encodedPayload = new TextEncoder().encode(payload);
    
    const encryptedContent = await window.crypto.subtle.encrypt(
      { name: ENCRYPTION_ALGORITHM, iv: iv },
      key,
      encodedPayload
    );

    // Package IV and Ciphertext into a single transmittable Base64 string
    const combined = new Uint8Array(iv.length + encryptedContent.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encryptedContent), iv.length);
    
    return btoa(String.fromCharCode.apply(null, Array.from(combined)));
  },

  /**
   * Decrypt and verify incoming mesh intelligence.
   */
  processIncomingPayload: async (base64Payload: string): Promise<any[]> => {
    try {
      const combined = new Uint8Array(
        atob(base64Payload).split('').map(c => c.charCodeAt(0))
      );
      
      const iv = combined.slice(0, 12);
      const ciphertext = combined.slice(12);
      const key = await getMeshKey();

      const decryptedContent = await window.crypto.subtle.decrypt(
        { name: ENCRYPTION_ALGORITHM, iv: iv },
        key,
        ciphertext
      );

      const payloadStr = new TextDecoder().decode(decryptedContent);
      const data = JSON.parse(payloadStr);

      if (data.protocol !== 'DARK_SYNC_V1') {
        throw new Error('Invalid tactical mesh signature.');
      }

      return data.logs || [];
    } catch (error) {
      console.error('Cryptographic handshake failed or payload invalid:', error);
      throw error;
    }
  }
};

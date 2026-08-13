export interface AuditLedgerEntry {
  id: string;
  timestamp: string;
  user_id: string;
  action: string;
  target_id: string;
  details: string;
  previous_hash?: string | null;
  entry_hash?: string | null;
}

export interface AuditVerificationResult {
  valid: boolean;
  verifiedEntries: number;
  legacyEntries: number;
  brokenEntryId?: string;
}

const GENESIS_HASH = 'GENESIS';
const MAX_DETAILS_LENGTH = 500;

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};

const sha256 = async (value: string): Promise<string> => {
  const encoded = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest('SHA-256', encoded);
  return toBase64(new Uint8Array(digest));
};

const canonicalise = (entry: Omit<AuditLedgerEntry, 'entry_hash'>, previousHash: string): string => {
  return JSON.stringify([
    entry.id,
    entry.timestamp,
    entry.user_id,
    entry.action,
    entry.target_id,
    entry.details,
    previousHash,
  ]);
};

const createId = (): string => {
  if (window.crypto?.randomUUID) return `audit_${window.crypto.randomUUID()}`;
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  return `audit_${Date.now()}_${toBase64(bytes).replace(/[^a-zA-Z0-9]/g, '').slice(0, 18)}`;
};

export async function appendAuditEntry(
  db: any,
  action: string,
  targetId: string,
  details: string,
  userId: string,
): Promise<AuditLedgerEntry> {
  const latest = await db.query(
    'SELECT entry_hash FROM audit_logs WHERE entry_hash IS NOT NULL AND entry_hash != ? ORDER BY timestamp DESC, id DESC LIMIT 1',
    [''],
  );
  const previousHash = latest.values?.[0]?.entry_hash || GENESIS_HASH;
  const entry: Omit<AuditLedgerEntry, 'entry_hash'> = {
    id: createId(),
    timestamp: new Date().toISOString(),
    user_id: userId || 'SYSTEM_UNKNOWN',
    action: action.trim().slice(0, 80),
    target_id: targetId.trim().slice(0, 160),
    details: details.replace(/[\r\n]+/g, ' ').trim().slice(0, MAX_DETAILS_LENGTH),
    previous_hash: previousHash,
  };
  const entryHash = await sha256(canonicalise(entry, previousHash));
  const completedEntry: AuditLedgerEntry = { ...entry, entry_hash: entryHash };

  await db.run(
    'INSERT INTO audit_logs (id, timestamp, user_id, action, target_id, details, previous_hash, entry_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      completedEntry.id,
      completedEntry.timestamp,
      completedEntry.user_id,
      completedEntry.action,
      completedEntry.target_id,
      completedEntry.details,
      completedEntry.previous_hash,
      completedEntry.entry_hash,
    ],
  );
  return completedEntry;
}

export async function verifyAuditChain(entries: AuditLedgerEntry[]): Promise<AuditVerificationResult> {
  const ordered = [...entries].sort((a, b) => {
    const timestampDelta = a.timestamp.localeCompare(b.timestamp);
    return timestampDelta || a.id.localeCompare(b.id);
  });
  let expectedPreviousHash = GENESIS_HASH;
  let verifiedEntries = 0;
  let legacyEntries = 0;

  for (const entry of ordered) {
    if (!entry.entry_hash || !entry.previous_hash) {
      legacyEntries += 1;
      continue;
    }
    const expectedHash = await sha256(canonicalise(entry, expectedPreviousHash));
    if (entry.previous_hash !== expectedPreviousHash || entry.entry_hash !== expectedHash) {
      return { valid: false, verifiedEntries, legacyEntries, brokenEntryId: entry.id };
    }
    expectedPreviousHash = entry.entry_hash;
    verifiedEntries += 1;
  }

  return { valid: true, verifiedEntries, legacyEntries };
}

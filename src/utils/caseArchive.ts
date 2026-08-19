import { getDb, withDatabaseTransaction } from '../capacitor/db';

const ARCHIVE_FORMAT = 'cgarchive';
const ARCHIVE_VERSION = 1;
// Current PBKDF2-HMAC-SHA256 work factor for new password-derived archives.
const PBKDF2_ITERATIONS = 600000;
// Explicit compatibility only for archives generated before the uplift.
const LEGACY_PBKDF2_ITERATIONS = 100000;
const SUPPORTED_PBKDF2_ITERATIONS = new Set([PBKDF2_ITERATIONS, LEGACY_PBKDF2_ITERATIONS]);
const SALT_BYTES = 16;
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
const MAX_ARCHIVE_JSON_BYTES = 64 * 1024 * 1024;
const MAX_CIPHERTEXT_BYTES = 16 * 1024 * 1024;
const MAX_RECORDS_PER_COLLECTION = 50000;

type ArchiveEnvelope = {
  format?: string;
  version?: number;
  kdf?: { name?: string; hash?: string; iterations?: number };
  encryption?: { name?: string; tagLength?: number };
  salt: number[];
  iv: number[];
  data: number[];
};

type ArchiveBundle = {
  version: string;
  exportedAt: string;
  caseRecord: Record<string, unknown>;
  nodes: unknown[];
  edges: unknown[];
  notes: unknown[];
  provenance: unknown[];
  derivatives: unknown[];
  movements: unknown[];
  contexts: unknown[];
  auditLogs: unknown[];
};

const getCrypto = (): Crypto => {
  if (!globalThis.crypto?.subtle) throw new Error('Secure Web Crypto is unavailable on this platform.');
  return globalThis.crypto;
};

const assertStrongPassphrase = (password: string): void => {
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) {
    throw new Error('Archive passphrase must contain between 12 and 1024 characters.');
  }
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseByteArray = (value: unknown, label: string, expectedLength?: number): Uint8Array => {
  if (!Array.isArray(value) || (expectedLength !== undefined && value.length !== expectedLength) || value.length === 0) {
    throw new Error(`Invalid case archive: ${label} is malformed.`);
  }
  if (value.length > MAX_CIPHERTEXT_BYTES) {
    throw new Error(`Invalid case archive: ${label} exceeds the permitted size.`);
  }
  if (!value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
    throw new Error(`Invalid case archive: ${label} contains invalid byte values.`);
  }
  return new Uint8Array(value);
};

const parseArchiveEnvelope = (archiveJson: string): { salt: Uint8Array; iv: Uint8Array; data: Uint8Array; kdfIterations: number } => {
  if (typeof archiveJson !== 'string' || archiveJson.length === 0 || archiveJson.length > MAX_ARCHIVE_JSON_BYTES) {
    throw new Error('Invalid case archive: envelope size is not permitted.');
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(archiveJson);
  } catch {
    throw new Error('Invalid case archive: envelope is not valid JSON.');
  }
  if (!isPlainRecord(envelope)) throw new Error('Invalid case archive: envelope must be an object.');

  const typedEnvelope = envelope as ArchiveEnvelope;
  if (typedEnvelope.format !== undefined && typedEnvelope.format !== ARCHIVE_FORMAT) {
    throw new Error('Invalid case archive: unsupported archive format.');
  }
  if (typedEnvelope.version !== undefined && typedEnvelope.version !== ARCHIVE_VERSION) {
    throw new Error('Invalid case archive: unsupported archive version.');
  }
  const kdfIterations = typedEnvelope.kdf?.iterations;
  if (!typedEnvelope.kdf || typedEnvelope.kdf.name !== 'PBKDF2' || typedEnvelope.kdf.hash !== 'SHA-256' || typeof kdfIterations !== 'number' || !Number.isInteger(kdfIterations) || !SUPPORTED_PBKDF2_ITERATIONS.has(kdfIterations)) {
    throw new Error('Invalid case archive: unsupported key-derivation parameters.');
  }
  if (typedEnvelope.encryption && (typedEnvelope.encryption.name !== 'AES-GCM' || typedEnvelope.encryption.tagLength !== 128)) {
    throw new Error('Invalid case archive: unsupported encryption parameters.');
  }

  const salt = parseByteArray(typedEnvelope.salt, 'salt', SALT_BYTES);
  const iv = parseByteArray(typedEnvelope.iv, 'initialization vector', GCM_IV_BYTES);
  const data = parseByteArray(typedEnvelope.data, 'ciphertext');
  if (data.byteLength < GCM_TAG_BYTES) throw new Error('Invalid case archive: ciphertext is too short.');
  return { salt, iv, data, kdfIterations };
};

const parseArchiveBundle = (plaintext: string): ArchiveBundle => {
  let bundle: unknown;
  try {
    bundle = JSON.parse(plaintext);
  } catch {
    throw new Error('Failed to decrypt archive. Invalid password or corrupted archive.');
  }
  if (!isPlainRecord(bundle) || bundle.version !== '1.0' || typeof bundle.exportedAt !== 'string' || !isPlainRecord(bundle.caseRecord)) {
    throw new Error('Failed to decrypt archive. Archive contents are invalid.');
  }

  const caseRecord = bundle.caseRecord;
  const requiredCaseFields = ['id', 'reference_number', 'title', 'case_type', 'date_opened', 'created_at', 'updated_at'];
  if (!requiredCaseFields.every((field) => typeof caseRecord[field] === 'string' && caseRecord[field].length > 0)) {
    throw new Error('Failed to decrypt archive. Case record is invalid.');
  }

  const collectionNames = ['nodes', 'edges', 'notes', 'provenance', 'derivatives', 'movements', 'contexts', 'auditLogs'] as const;
  for (const name of collectionNames) {
    const collection = bundle[name];
    if (!Array.isArray(collection) || collection.length > MAX_RECORDS_PER_COLLECTION) {
      throw new Error(`Failed to decrypt archive. ${name} collection is invalid.`);
    }
  }
  return bundle as ArchiveBundle;
};

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const crypto = getCrypto();
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function exportCaseArchive(caseId: string, password: string): Promise<string> {
  assertStrongPassphrase(password);
  const db = await getDb();
  const caseRes = await db.query('SELECT * FROM cases WHERE id = ?', [caseId]);
  const caseRecord = caseRes.values?.[0];
  if (!caseRecord) throw new Error('Case not found for export.');

  const nodesRes = await db.query('SELECT * FROM nodes WHERE case_id = ?', [caseId]);
  const edgesRes = await db.query('SELECT * FROM edges WHERE case_id = ?', [caseId]);
  const notesRes = await db.query('SELECT * FROM notes WHERE case_id = ?', [caseId]);
  const provRes = await db.query('SELECT * FROM evidence_provenance WHERE case_id = ?', [caseId]);
  const derivRes = await db.query('SELECT * FROM evidence_derivatives WHERE case_id = ?', [caseId]);
  const movRes = await db.query('SELECT * FROM exhibit_movements WHERE case_id = ?', [caseId]);
  const ctxRes = await db.query('SELECT * FROM observation_contexts WHERE case_id = ?', [caseId]);
  const auditRes = await db.query('SELECT * FROM audit_logs WHERE case_id = ?', [caseId]);

  const bundle: ArchiveBundle = {
    version: '1.0', exportedAt: new Date().toISOString(), caseRecord,
    nodes: nodesRes.values || [], edges: edgesRes.values || [], notes: notesRes.values || [], provenance: provRes.values || [],
    derivatives: derivRes.values || [], movements: movRes.values || [], contexts: ctxRes.values || [], auditLogs: auditRes.values || [],
  };

  const crypto = getCrypto();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const encryptedContent = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(bundle)));

  const archivePackage = {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS },
    encryption: { name: 'AES-GCM', tagLength: 128 },
    salt: Array.from(salt),
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encryptedContent)),
  };
  return JSON.stringify(archivePackage);
}

export async function importCaseArchive(archiveJson: string, password: string): Promise<string> {
  assertStrongPassphrase(password);
  const { salt, iv, data, kdfIterations } = parseArchiveEnvelope(archiveJson);
  const crypto = getCrypto();
  const key = await deriveKey(password, salt, kdfIterations);

  let decryptedContent: ArrayBuffer;
  try {
    decryptedContent = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, data as BufferSource);
  } catch {
    throw new Error('Failed to decrypt archive. Invalid password or corrupted archive.');
  }
  const bundle = parseArchiveBundle(new TextDecoder().decode(decryptedContent));

  const db = await getDb();
  return withDatabaseTransaction(db, async (transactionDb) => {
    const c = bundle.caseRecord as Record<string, any>;
    await transactionDb.run(
      'INSERT OR REPLACE INTO cases (id, reference_number, title, case_type, status, lead_officer_id, classification, description, date_opened, date_closed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [c.id, c.reference_number, c.title, c.case_type, c.status || 'active', c.lead_officer_id || null, c.classification || 'OFFICIAL', c.description || null, c.date_opened, c.date_closed || null, c.created_at, c.updated_at],
    );
    for (const node of bundle.nodes as any[]) await transactionDb.run('INSERT OR REPLACE INTO nodes (id, case_id, label, type, confidence, created_at, occurred_at, attributes, review_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [node.id, node.case_id, node.label, node.type, node.confidence || 3, node.created_at, node.occurred_at || null, node.attributes || null, node.review_status || 'not_required']);
    for (const edge of bundle.edges as any[]) await transactionDb.run('INSERT OR REPLACE INTO edges (id, case_id, source, target, label, created_at) VALUES (?, ?, ?, ?, ?, ?)', [edge.id, edge.case_id, edge.source, edge.target, edge.label, edge.created_at]);
    for (const note of bundle.notes as any[]) await transactionDb.run('INSERT OR REPLACE INTO notes (id, case_id, content, linked_nodes, created_at) VALUES (?, ?, ?, ?, ?)', [note.id, note.case_id, note.content, note.linked_nodes || '[]', note.created_at]);
    return String(c.id);
  });
}

export const archiveSecurityLimits = { ARCHIVE_FORMAT, ARCHIVE_VERSION, PBKDF2_ITERATIONS, LEGACY_PBKDF2_ITERATIONS, SALT_BYTES, GCM_IV_BYTES, MAX_ARCHIVE_JSON_BYTES, MAX_CIPHERTEXT_BYTES, MAX_RECORDS_PER_COLLECTION };

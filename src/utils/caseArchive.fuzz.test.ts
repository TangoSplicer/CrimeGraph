import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = {
  query: vi.fn(),
  run: vi.fn(),
  execute: vi.fn(),
};

vi.mock('../capacitor/db', () => ({
  getDb: vi.fn(async () => db),
  withDatabaseTransaction: vi.fn(async (connection, operation) => operation(connection)),
}));

import { archiveSecurityLimits, exportCaseArchive, importCaseArchive } from './caseArchive';

const validCase = {
  id: 'case_fuzz_001',
  reference_number: 'FUZZ-001',
  title: 'Archive Fuzz Fixture',
  case_type: 'test',
  status: 'active',
  date_opened: '2026-08-16T00:00:00.000Z',
  created_at: '2026-08-16T00:00:00.000Z',
  updated_at: '2026-08-16T00:00:00.000Z',
};

const securePassphrase = 'Test-only passphrase 123!';

const buildArchive = async (): Promise<Record<string, unknown>> => {
  const raw = await exportCaseArchive(validCase.id, securePassphrase);
  return JSON.parse(raw) as Record<string, unknown>;
};

describe('case archive defensive fuzzing', () => {
  beforeEach(() => {
    db.query.mockReset();
    db.run.mockReset();
    db.execute.mockReset();
    db.query.mockImplementation(async (sql: string) => ({ values: sql.includes('FROM cases') ? [validCase] : [] }));
  });

  it('emits self-describing, fixed-strength cryptographic envelopes with independent random salt and IV', async () => {
    const first = await buildArchive();
    const second = await buildArchive();

    expect(first.format).toBe(archiveSecurityLimits.ARCHIVE_FORMAT);
    expect(first.version).toBe(archiveSecurityLimits.ARCHIVE_VERSION);
    expect(first.kdf).toEqual({ name: 'PBKDF2', hash: 'SHA-256', iterations: archiveSecurityLimits.PBKDF2_ITERATIONS });
    expect(first.encryption).toEqual({ name: 'AES-GCM', tagLength: 128 });
    expect((first.salt as number[])).toHaveLength(archiveSecurityLimits.SALT_BYTES);
    expect((first.iv as number[])).toHaveLength(archiveSecurityLimits.GCM_IV_BYTES);
    expect(first.salt).not.toEqual(second.salt);
    expect(first.iv).not.toEqual(second.iv);
  });

  it('fails closed when ciphertext, IV, salt, or PBKDF2 parameters are modified', async () => {
    const archive = await buildArchive();
    const data = archive.data as number[];
    const iv = archive.iv as number[];
    const salt = archive.salt as number[];
    const mutations = [
      { ...archive, data: [...data.slice(0, -1), (data[data.length - 1] ^ 1)] },
      { ...archive, iv: [...iv.slice(0, -1), (iv[iv.length - 1] ^ 1)] },
      { ...archive, salt: [...salt.slice(0, -1), (salt[salt.length - 1] ^ 1)] },
      { ...archive, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 1 } },
      { ...archive, encryption: { name: 'AES-CBC', tagLength: 128 } },
    ];

    for (const mutation of mutations) {
      await expect(importCaseArchive(JSON.stringify(mutation), securePassphrase)).rejects.toThrow();
    }
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('imports a valid legacy 100,000-iteration archive only through the explicit compatibility path', async () => {
    const crypto = globalThis.crypto;
    const salt = crypto.getRandomValues(new Uint8Array(archiveSecurityLimits.SALT_BYTES));
    const iv = crypto.getRandomValues(new Uint8Array(archiveSecurityLimits.GCM_IV_BYTES));
    const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(securePassphrase), { name: 'PBKDF2' }, false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt as BufferSource, iterations: archiveSecurityLimits.LEGACY_PBKDF2_ITERATIONS, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt'],
    );
    const legacyBundle = {
      version: '1.0', exportedAt: new Date().toISOString(), caseRecord: validCase,
      nodes: [], edges: [], notes: [], provenance: [], derivatives: [], movements: [], contexts: [], auditLogs: [],
    };
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(legacyBundle)));
    const legacyArchive = JSON.stringify({
      format: archiveSecurityLimits.ARCHIVE_FORMAT,
      version: archiveSecurityLimits.ARCHIVE_VERSION,
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: archiveSecurityLimits.LEGACY_PBKDF2_ITERATIONS },
      encryption: { name: 'AES-GCM', tagLength: 128 },
      salt: Array.from(salt), iv: Array.from(iv), data: Array.from(new Uint8Array(ciphertext)),
    });

    await expect(importCaseArchive(legacyArchive, securePassphrase)).resolves.toBe(validCase.id);
    expect(db.run).toHaveBeenCalledWith(expect.stringContaining('INSERT OR REPLACE INTO cases'), expect.any(Array));
  });

  it('rejects wrong, short, empty, and overlong passphrases before database mutation', async () => {
    const archive = JSON.stringify(await buildArchive());
    await expect(importCaseArchive(archive, 'incorrect test passphrase!')).rejects.toThrow('Failed to decrypt archive');
    await expect(importCaseArchive(archive, 'short')).rejects.toThrow('Archive passphrase');
    await expect(importCaseArchive(archive, '')).rejects.toThrow('Archive passphrase');
    await expect(importCaseArchive(archive, 'x'.repeat(1025))).rejects.toThrow('Archive passphrase');
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('rejects deterministic malformed-envelope fuzz corpus before key derivation or database access', async () => {
    const malformedCorpus = [
      '', 'null', '[]', '{}', '{', 'not-json',
      JSON.stringify({ format: 'wrong', salt: [], iv: [], data: [] }),
      JSON.stringify({ format: 'cgarchive', version: 1, salt: new Array(16).fill(0), iv: new Array(11).fill(0), data: new Array(16).fill(0) }),
      JSON.stringify({ format: 'cgarchive', version: 1, salt: new Array(16).fill(0), iv: new Array(12).fill(0), data: [-1, 256, 1.5, 'x'] }),
      JSON.stringify({ format: 'cgarchive', version: 999, salt: new Array(16).fill(0), iv: new Array(12).fill(0), data: new Array(16).fill(0) }),
      JSON.stringify({ format: 'cgarchive', version: 1, kdf: { name: 'PBKDF2', hash: 'SHA-1', iterations: 1 }, salt: new Array(16).fill(0), iv: new Array(12).fill(0), data: new Array(16).fill(0) }),
    ];

    for (const payload of malformedCorpus) {
      await expect(importCaseArchive(payload, securePassphrase)).rejects.toThrow(/Invalid case archive/);
    }
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('handles randomized malformed byte-array fuzz inputs without unhandled exceptions or database access', async () => {
    let seed = 0x5eeda11;
    const next = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed; };

    for (let iteration = 0; iteration < 96; iteration++) {
      const length = next() % 40;
      const values = Array.from({ length }, () => {
        const selector = next() % 5;
        return selector === 0 ? -1 : selector === 1 ? 256 : selector === 2 ? 1.5 : selector === 3 ? 'bad' : next() % 256;
      });
      const fuzzed = JSON.stringify({
        format: iteration % 2 ? 'cgarchive' : 'unexpected',
        version: iteration % 3 ? 1 : 2,
        salt: values,
        iv: values,
        data: values,
      });
      await expect(importCaseArchive(fuzzed, securePassphrase)).rejects.toThrow();
    }
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('rejects archives beyond the declared envelope and ciphertext limits before decryption', async () => {
    const oversizedJson = 'x'.repeat(archiveSecurityLimits.MAX_ARCHIVE_JSON_BYTES + 1);
    await expect(importCaseArchive(oversizedJson, securePassphrase)).rejects.toThrow('envelope size');

    const oversizedCiphertext = JSON.stringify({
      format: 'cgarchive', version: 1,
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: archiveSecurityLimits.PBKDF2_ITERATIONS },
      encryption: { name: 'AES-GCM', tagLength: 128 },
      salt: new Array(16).fill(0), iv: new Array(12).fill(0),
      data: new Array(archiveSecurityLimits.MAX_CIPHERTEXT_BYTES + 1).fill(0),
    });
    await expect(importCaseArchive(oversizedCiphertext, securePassphrase)).rejects.toThrow('ciphertext exceeds');
    expect(db.execute).not.toHaveBeenCalled();
  }, 15000);
});

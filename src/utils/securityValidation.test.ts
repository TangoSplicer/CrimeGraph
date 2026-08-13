import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDeviceStorageSecret: vi.fn(),
}));

vi.mock('../capacitor/deviceIdentity', () => ({
  getDeviceStorageSecret: mocks.getDeviceStorageSecret,
}));

import { decryptEvidenceMedia, encryptEvidenceMedia } from './secureMedia';
import { can } from './permissions';
import { validateImportedPackage } from '../stores/caseStore';

const STORAGE_SECRET = `${'A'.repeat(43)}=`;
const envelopePrefix = new TextEncoder().encode('CGM1');

beforeAll(() => {
  Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true });
});

beforeEach(() => {
  mocks.getDeviceStorageSecret.mockResolvedValue(STORAGE_SECRET);
});

describe('protected evidence media envelope', () => {
  it('uses the CGM1 envelope, a random IV, and round-trips only with the device-bound secret', async () => {
    const original = btoa('field evidence payload');
    const encrypted = await encryptEvidenceMedia(original);
    const envelope = Uint8Array.from(atob(encrypted), (character) => character.charCodeAt(0));

    expect(encrypted).not.toBe(original);
    expect([...envelope.slice(0, 4)]).toEqual([...envelopePrefix]);
    expect(envelope.length).toBeGreaterThan(4 + 12);
    await expect(decryptEvidenceMedia(encrypted)).resolves.toBe(original);
  });

  it('rejects malformed and tampered envelope prefixes before decrypting attachment data', async () => {
    await expect(decryptEvidenceMedia(btoa('CGM1too-short'))).rejects.toThrow('malformed encryption envelope');
    const validEnvelope = Uint8Array.from(atob(await encryptEvidenceMedia(btoa('payload'))), (character) => character.charCodeAt(0));
    validEnvelope[0] = 0x42;
    const tampered = btoa(String.fromCharCode(...validEnvelope));
    await expect(decryptEvidenceMedia(tampered)).rejects.toThrow('malformed encryption envelope');
  });

  it('fails closed when a bridge response is not an AES-256 storage secret', async () => {
    mocks.getDeviceStorageSecret.mockResolvedValue(btoa('too-short'));
    await expect(encryptEvidenceMedia(btoa('payload'))).rejects.toThrow('unexpected length');
  });
});

describe('supervisory permission boundaries', () => {
  it('keeps review decisions with supervisors and resubmission constrained to field operators', () => {
    expect(can('admin', 'intelligence:review')).toBe(true);
    expect(can('supervisor', 'intelligence:review')).toBe(true);
    expect(can('analyst', 'intelligence:review')).toBe(false);
    expect(can('field', 'intelligence:review')).toBe(false);
    expect(can('field', 'intelligence:resubmit')).toBe(true);
    expect(can('readonly', 'intelligence:resubmit')).toBe(false);
  });
});

describe('adversarial package validation', () => {
  const validPackage = {
    metadata: { reference: 'CASE-42', title: 'Protected import', classification: 'OFFICIAL' },
    intelligence_nodes: [],
    relationships: [],
    notes: [],
  };

  it('accepts a bounded package with required metadata', () => {
    expect(validateImportedPackage(validPackage)).toMatchObject({ reference: 'CASE-42', title: 'Protected import' });
  });

  it('rejects missing metadata and package arrays that exceed the offline intake limit', () => {
    expect(() => validateImportedPackage({ intelligence_nodes: [] })).toThrow('metadata is missing');
    expect(() => validateImportedPackage({ ...validPackage, intelligence_nodes: Array.from({ length: 2001 }, () => ({})) })).toThrow('exceeds the supported import size');
    expect(() => validateImportedPackage(null)).toThrow('not a JSON object');
  });
});

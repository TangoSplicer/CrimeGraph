import {
  getDeviceIdentity,
  signWithDeviceIdentity,
  verifyDeviceSignature,
  type DeviceIdentity,
} from '../capacitor/deviceIdentity';

const PAIRING_PREFIX = 'CGPAIR1:';
const PAIRING_VERSION = 1;
const INVITATION_LIFETIME_MS = 10 * 60 * 1000;
const MAX_PAIRING_CODE_LENGTH = 16_384;

export interface PairingInvitationPayload {
  version: number;
  deviceId: string;
  displayName: string;
  publicKey: string;
  fingerprint: string;
  expiresAt: string;
  nonce: string;
}

export interface PairingInvitation extends PairingInvitationPayload {
  signature: string;
}

export interface PreparedPairingInvitation extends PairingInvitation {
  code: string;
}

export interface VerifiedPeerInvitation {
  invitation: PairingInvitation;
  shortAuthenticationCode: string;
}

const toBase64 = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};

const fromBase64 = (value: string): string => {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const fromBase64Bytes = (value: string): Uint8Array => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

const randomNonce = (): string => {
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const canonicalPayload = (payload: PairingInvitationPayload): string => JSON.stringify({
  version: payload.version,
  deviceId: payload.deviceId,
  displayName: payload.displayName,
  publicKey: payload.publicKey,
  fingerprint: payload.fingerprint,
  expiresAt: payload.expiresAt,
  nonce: payload.nonce,
});

const toFingerprint = async (publicKey: string): Promise<string> => {
  const keyBytes = fromBase64Bytes(publicKey);
  const digest = new Uint8Array(await window.crypto.subtle.digest('SHA-256', keyBytes as any));
  return Array.from(digest).map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join('');
};

const expectedDeviceId = (fingerprint: string): string => `cg-${fingerprint.slice(0, 24).toLowerCase()}`;

const isValidInvitation = (value: unknown): value is PairingInvitation => {
  if (!value || typeof value !== 'object') return false;
  const invitation = value as Record<string, unknown>;
  return invitation.version === PAIRING_VERSION
    && typeof invitation.deviceId === 'string'
    && typeof invitation.displayName === 'string'
    && typeof invitation.publicKey === 'string'
    && typeof invitation.fingerprint === 'string'
    && typeof invitation.expiresAt === 'string'
    && typeof invitation.nonce === 'string'
    && typeof invitation.signature === 'string';
};

const assertInvitationShape = (invitation: PairingInvitation): void => {
  if (!/^[A-Za-z0-9+/=]{80,1024}$/.test(invitation.publicKey)) throw new Error('The pairing public key is malformed.');
  if (!/^[A-F0-9]{64}$/.test(invitation.fingerprint)) throw new Error('The pairing fingerprint is malformed.');
  if (!/^[a-f0-9]{32}$/.test(invitation.nonce)) throw new Error('The pairing nonce is malformed.');
  if (!invitation.displayName.trim() || invitation.displayName.length > 64) throw new Error('The pairing device name is malformed.');
  const expiry = new Date(invitation.expiresAt).getTime();
  if (!Number.isFinite(expiry) || expiry <= Date.now()) throw new Error('This pairing invitation has expired. Ask the other device to create a new one.');
  if (expiry - Date.now() > INVITATION_LIFETIME_MS + 60_000) throw new Error('This pairing invitation has an invalid expiry window.');
};

export const createPairingInvitation = async (displayName: string): Promise<PreparedPairingInvitation> => {
  const cleanName = displayName.trim();
  if (!cleanName || cleanName.length > 64) throw new Error('Provide a device name between 1 and 64 characters.');
  const identity = await getDeviceIdentity();
  const payload: PairingInvitationPayload = {
    version: PAIRING_VERSION,
    deviceId: identity.deviceId,
    displayName: cleanName,
    publicKey: identity.publicKey,
    fingerprint: identity.fingerprint,
    expiresAt: new Date(Date.now() + INVITATION_LIFETIME_MS).toISOString(),
    nonce: randomNonce(),
  };
  const signature = await signWithDeviceIdentity(canonicalPayload(payload));
  const invitation: PairingInvitation = { ...payload, signature };
  return { ...invitation, code: `${PAIRING_PREFIX}${toBase64(JSON.stringify(invitation))}` };
};

export const parseAndVerifyPairingCode = async (code: string): Promise<VerifiedPeerInvitation> => {
  const trimmed = code.trim();
  if (!trimmed.startsWith(PAIRING_PREFIX) || trimmed.length > MAX_PAIRING_CODE_LENGTH) throw new Error('This is not a valid CrimeGraph pairing code.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64(trimmed.slice(PAIRING_PREFIX.length)));
  } catch {
    throw new Error('The pairing code is unreadable or corrupted.');
  }
  if (!isValidInvitation(parsed)) throw new Error('The pairing invitation has an unsupported format.');
  const invitation = parsed;
  assertInvitationShape(invitation);

  const computedFingerprint = await toFingerprint(invitation.publicKey);
  if (computedFingerprint !== invitation.fingerprint || expectedDeviceId(computedFingerprint) !== invitation.deviceId) {
    throw new Error('The pairing invitation identity does not match its public key.');
  }
  const signatureValid = await verifyDeviceSignature(invitation.publicKey, canonicalPayload(invitation), invitation.signature);
  if (!signatureValid) throw new Error('The pairing invitation signature could not be verified.');

  const localIdentity = await getDeviceIdentity();
  if (localIdentity.deviceId === invitation.deviceId) throw new Error('A device cannot pair with itself.');
  const orderedKeys = [localIdentity.publicKey, invitation.publicKey].sort().join('|');
  const digest = new Uint8Array(await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(orderedKeys)));
  const shortAuthenticationCode = Array.from(digest.slice(0, 6)).map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join('').match(/.{1,4}/g)?.join('-') || '';
  return { invitation, shortAuthenticationCode };
};

export const getPairingIdentity = async (): Promise<DeviceIdentity> => getDeviceIdentity();

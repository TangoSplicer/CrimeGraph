import { Directory, Filesystem } from '@capacitor/filesystem';
import { getDeviceStorageSecret } from '../capacitor/deviceIdentity';

const MEDIA_PREFIX = new TextEncoder().encode('CGM1');
const IV_LENGTH = 12;

const fromBase64 = (value: string): Uint8Array => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

const toBase64 = (value: Uint8Array): string => {
  let binary = '';
  value.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};

const deriveMediaKey = async (): Promise<CryptoKey> => {
  const storageSecret = fromBase64(await getDeviceStorageSecret());
  if (storageSecret.length !== 32) throw new Error('The device storage secret has an unexpected length.');
  return window.crypto.subtle.importKey('raw', storageSecret as any, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};

const isEnvelope = (value: Uint8Array): boolean => MEDIA_PREFIX.every((byte, index) => value[index] === byte);

export const encryptEvidenceMedia = async (plainBase64: string): Promise<string> => {
  const plaintext = fromBase64(plainBase64);
  const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = new Uint8Array(await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as any }, await deriveMediaKey(), plaintext as any));
  const envelope = new Uint8Array(MEDIA_PREFIX.length + iv.length + ciphertext.length);
  envelope.set(MEDIA_PREFIX, 0);
  envelope.set(iv, MEDIA_PREFIX.length);
  envelope.set(ciphertext, MEDIA_PREFIX.length + iv.length);
  return toBase64(envelope);
};

export const decryptEvidenceMedia = async (encryptedBase64: string): Promise<string> => {
  const envelope = fromBase64(encryptedBase64);
  if (envelope.length <= MEDIA_PREFIX.length + IV_LENGTH || !isEnvelope(envelope)) throw new Error('The evidence attachment has an unsupported or malformed encryption envelope.');
  const iv = envelope.slice(MEDIA_PREFIX.length, MEDIA_PREFIX.length + IV_LENGTH);
  const ciphertext = envelope.slice(MEDIA_PREFIX.length + IV_LENGTH);
  const plaintext = new Uint8Array(await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as any }, await deriveMediaKey(), ciphertext));
  return toBase64(plaintext);
};

export const writeEncryptedEvidenceMedia = async (caseId: string, attachmentName: string, plainBase64: string): Promise<string> => {
  if (!caseId || !attachmentName) throw new Error('Case and attachment identifiers are required for protected media storage.');
  const result = await Filesystem.writeFile({
    path: `evidence/${caseId}/${attachmentName}.cgm`,
    data: await encryptEvidenceMedia(plainBase64),
    directory: Directory.Data,
    recursive: true,
  });
  return result.uri;
};

export const readEncryptedEvidenceMedia = async (uri: string): Promise<string> => {
  if (!uri) throw new Error('The evidence attachment URI is unavailable.');
  const result = await Filesystem.readFile({ path: uri });
  if (typeof result.data !== 'string') throw new Error('The encrypted evidence attachment could not be read.');
  return decryptEvidenceMedia(result.data);
};

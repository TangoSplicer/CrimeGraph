const AUTH_PBKDF2_ITERATIONS = 310000;
const EXPORT_PBKDF2_ITERATIONS = 310000;
const LEGACY_EXPORT_PBKDF2_ITERATIONS = 100000;
const EXPORT_PREFIX = 'CGX2:';

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};

const fromBase64 = (value: string): Uint8Array => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

export async function hashPassword(password: string): Promise<string> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits'],
  );
  const hashBuffer = await window.crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as any, iterations: AUTH_PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return `${toBase64(salt)}:${toBase64(new Uint8Array(hashBuffer))}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const parts = storedHash.split(':');
    if (parts.length !== 2) return false;
    const salt = fromBase64(parts[0]);
    const expectedHash = fromBase64(parts[1]);
    if (salt.length !== 16 || expectedHash.length !== 32) return false;

    const keyMaterial = await window.crypto.subtle.importKey(
      'raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits'],
    );
    const actualHash = new Uint8Array(await window.crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: salt as any, iterations: AUTH_PBKDF2_ITERATIONS, hash: 'SHA-256' },
      keyMaterial,
      256,
    ));
    let mismatch = expectedHash.length ^ actualHash.length;
    for (let index = 0; index < expectedHash.length; index += 1) mismatch |= expectedHash[index] ^ actualHash[index];
    return mismatch === 0;
  } catch {
    return false;
  }
}

async function deriveExportKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveKey'],
  );
  return window.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as any, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptPackage(data: string, password: string): Promise<string> {
  if (!password || password.length < 12) throw new Error('Export password must contain at least 12 characters.');
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveExportKey(password, salt, EXPORT_PBKDF2_ITERATIONS);
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as any },
    key,
    new TextEncoder().encode(data),
  );

  const bundle = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  bundle.set(salt, 0);
  bundle.set(iv, salt.length);
  bundle.set(new Uint8Array(ciphertext), salt.length + iv.length);
  return `${EXPORT_PREFIX}${toBase64(bundle)}`;
}

export async function decryptPackage(encryptedPayload: string, password: string): Promise<string> {
  const isCurrentFormat = encryptedPayload.startsWith(EXPORT_PREFIX);
  const payload = isCurrentFormat ? encryptedPayload.slice(EXPORT_PREFIX.length) : encryptedPayload;
  const bundle = fromBase64(payload);
  if (bundle.length < 45) throw new Error('Encrypted package is malformed.');

  const salt = bundle.slice(0, 16);
  const iv = bundle.slice(16, 28);
  const ciphertext = bundle.slice(28);
  const key = await deriveExportKey(
    password,
    salt,
    isCurrentFormat ? EXPORT_PBKDF2_ITERATIONS : LEGACY_EXPORT_PBKDF2_ITERATIONS,
  );
  const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as any }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

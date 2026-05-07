// Strictly Web Crypto API (window.crypto.subtle) - Zero External Dependencies
export async function hashPassword(password: string): Promise<string> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  
  const hashBuffer = await window.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 310000, // OWASP 2023 Standard
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  const saltB64 = btoa(String.fromCharCode(...new Uint8Array(salt)));
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
  
  return `${saltB64}:${hashB64}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  
  const salt = Uint8Array.from(atob(parts[0]), c => c.charCodeAt(0));
  const hashBuffer = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));

  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  
  const testHashBuffer = await window.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 310000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  
  const testHashArray = new Uint8Array(testHashBuffer);
  if (hashBuffer.length !== testHashArray.length) return false;
  
  // Constant-time comparison to prevent timing attacks
  let isMatch = true;
  for (let i = 0; i < hashBuffer.length; i++) {
    if (hashBuffer[i] !== testHashArray[i]) isMatch = false;
  }
  return isMatch;
}

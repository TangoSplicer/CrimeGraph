#!/bin/bash

echo "Patching crypto.ts to bypass ArrayBuffer typings..."
cat << 'EOF' > src/capacitor/crypto.ts
export async function hashPassword(password: string): Promise<string> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), { name: "PBKDF2" }, false, ["deriveBits"]
  );
  const hashBuffer = await window.crypto.subtle.deriveBits(
    // 🚀 FIXED: cast salt as any to satisfy TS buffer typings
    { name: "PBKDF2", salt: salt as any, iterations: 310000, hash: "SHA-256" }, keyMaterial, 256
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
    "raw", new TextEncoder().encode(password), { name: "PBKDF2" }, false, ["deriveBits"]
  );
  const testHashBuffer = await window.crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as any, iterations: 310000, hash: "SHA-256" }, keyMaterial, 256
  );
  const testHashArray = new Uint8Array(testHashBuffer);
  if (hashBuffer.length !== testHashArray.length) return false;
  let isMatch = true;
  for (let i = 0; i < hashBuffer.length; i++) {
    if (hashBuffer[i] !== testHashArray[i]) isMatch = false;
  }
  return isMatch;
}

// 🚀 PHASE 10: AES-GCM Export Encryption
async function deriveExportKey(password: string, salt: Uint8Array) {
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), { name: "PBKDF2" }, false, ["deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
    // 🚀 FIXED: cast salt as any here
    { name: "PBKDF2", salt: salt as any, iterations: 100000, hash: "SHA-256" },
    keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}

export async function encryptPackage(data: string, password: string): Promise<string> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveExportKey(password, salt);
  const encoded = new TextEncoder().encode(data);
  // 🚀 FIXED: cast iv as any here
  const ciphertext = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as any }, key, encoded);
  
  // Pack Salt + IV + Ciphertext into a single Base64 string
  const bundle = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  bundle.set(salt, 0);
  bundle.set(iv, salt.length);
  bundle.set(new Uint8Array(ciphertext), salt.length + iv.length);
  return btoa(String.fromCharCode(...bundle));
}

export async function decryptPackage(encryptedB64: string, password: string): Promise<string> {
  const bundle = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));
  const salt = bundle.slice(0, 16);
  const iv = bundle.slice(16, 28);
  const ciphertext = bundle.slice(28);
  const key = await deriveExportKey(password, salt);
  // 🚀 FIXED: cast iv as any here
  const decrypted = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as any }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}
EOF

echo "Staging files..."
git add src/capacitor/crypto.ts

echo "Committing..."
git commit -m "fix: bypass TypeScript SharedArrayBuffer definition quirks in Web Crypto API"

echo "Pushing to GitHub..."
git push origin main

echo "Crypto Type Patch Deployed! CI/CD should turn green."

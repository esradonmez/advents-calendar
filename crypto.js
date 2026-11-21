// Shared crypto helpers (browser Web Crypto API).
// Format must stay in sync with tools/encrypt.py.

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64ToBytes(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

// Forgiving normalisation: trims, lowercases, NFKC. Mirrored in encrypt.py.
export function normalizePassphrase(p) {
  return p.normalize('NFKC').trim().toLowerCase();
}

export async function deriveKey(passphrase, kdf) {
  const base = await crypto.subtle.importKey(
    'raw', enc.encode(normalizePassphrase(passphrase)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: kdf.hash, salt: b64ToBytes(kdf.salt), iterations: kdf.iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']);
}

// box = { iv: base64, data: base64 (ciphertext || 16-byte GCM tag) }
export async function decryptJSON(key, box) {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(box.iv) }, key, b64ToBytes(box.data));
  return JSON.parse(dec.decode(plain));
}

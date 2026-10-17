import { asciiBytes, sha256 } from './sha256.ts';

/**
 * Byte ngẫu nhiên an toàn cho `clientVerifier`/`requestId` của Zalo.
 * - Web và Node (test): `crypto.getRandomValues`.
 * - Android (Hermes không có Web Crypto): UUID v4 native của expo-modules-core, vốn dùng `java.util.UUID.randomUUID()`
 *   (SecureRandom, 122 bit ngẫu nhiên mỗi UUID). Ghép ba UUID (366 bit) làm hạt rồi băm SHA-256 theo từng khối đếm để ra
 *   đủ số byte cần, không phải thêm thư viện native.
 */
export function secureRandomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  const webCrypto = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (typeof webCrypto?.getRandomValues === 'function') {
    webCrypto.getRandomValues(out);
    return out;
  }
  const uuidv4 = (globalThis as { expo?: { uuidv4?: () => string } }).expo?.uuidv4;
  if (typeof uuidv4 !== 'function') throw new Error('Thiết bị không có nguồn số ngẫu nhiên an toàn');
  const seed = `${uuidv4()}|${uuidv4()}|${uuidv4()}`;
  for (let block = 0; block * 32 < length; block++) {
    const chunk = sha256(asciiBytes(`${seed}|${block}`));
    out.set(chunk.subarray(0, Math.min(32, length - block * 32)), block * 32);
  }
  return out;
}

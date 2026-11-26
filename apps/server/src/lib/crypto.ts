import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SALT = Buffer.from('marquee.session.v1');

/** Derive the 32-byte key from SESSION_SECRET, or from a generated key file in the data dir. */
export function resolveKey(dataDir: string, secret: string | null): Buffer {
  if (secret && secret.length >= 16) return scryptSync(secret, SALT, 32);
  const file = join(dataDir, '.session-key');
  if (!existsSync(file)) {
    writeFileSync(file, randomBytes(32).toString('hex'), { mode: 0o600 });
    chmodSync(file, 0o600);
  }
  return scryptSync(readFileSync(file, 'utf8').trim(), SALT, 32);
}

/** AES-256-GCM. Output layout: iv(12) | tag(16) | ciphertext, base64. */
export function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}

export function decrypt(blob: string, key: Buffer): string {
  const raw = Buffer.from(blob, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// OWASP scrypt profile: N=2^15, r=8, p=3. Node's implementation is asynchronous.
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt);
  return `scrypt-v1$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const match = /^scrypt-v1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(encoded);
  if (!match) return false;
  const actual = await derive(password, match[1]);
  return timingSafeEqual(actual, Buffer.from(match[2], 'hex'));
}

// Unknown logins still incur one scrypt verification, without creating a real user.
export const DUMMY_PASSWORD_HASH = `scrypt-v1$${'0'.repeat(32)}$${'0'.repeat(128)}`;

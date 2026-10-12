import { createHash } from 'node:crypto';

export const SESSION_COOKIE = 'credit_session';
export const SESSION_SECONDS = 24 * 60 * 60;

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function appOrigin(value = process.env.APP_ORIGIN): string {
  if (!value) throw new Error('APP_ORIGIN is required');
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.origin !== value || url.username || url.password || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
    throw new Error('APP_ORIGIN must be an HTTPS origin, or HTTP on localhost');
  }
  return url.origin;
}

export function requireSameOrigin(request: Request, origin: string): void {
  if (request.headers.get('origin') !== appOrigin(origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new HttpError(403, 'Запрос отклонён. Обновите страницу и повторите попытку.');
  }
}

export function parseCredentials(value: unknown): { login: string; password: string } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { login, password } = value as Record<string, unknown>;
  if (typeof login !== 'string' || typeof password !== 'string') return null;
  const normalized = login.trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,64}$/.test(normalized) || password.length < 1 || password.length > 256) return null;
  return { login: normalized, password };
}

export async function readJson(request: Request): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new HttpError(415, 'Ожидается JSON.');
  }
  if (Number(request.headers.get('content-length')) > 4096) throw new HttpError(413, 'Слишком большой запрос.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Пустой запрос.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        throw new HttpError(413, 'Слишком большой запрос.');
      }
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new HttpError(400, 'Некорректный JSON.'); }
  } finally { reader.releaseLock(); }
}

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function validToken(token: string | undefined): token is string {
  return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
}

export function sessionCookie(token: string, expires: Date, origin: string): string {
  const secure = appOrigin(origin).startsWith('https:');
  if (token && !validToken(token)) throw new Error('Invalid session token');
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}; Max-Age=${token ? SESSION_SECONDS : 0}${secure ? '; Secure' : ''}`;
}

export function readSessionCookie(request: Request): string | undefined {
  const values = (request.headers.get('cookie') ?? '').split(';').map((part) => part.trim());
  return values.find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
}

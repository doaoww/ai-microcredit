import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../db/migrate';
import { seedDemoUsers } from '../db/seed';
import { AuthService } from '../lib/auth/service';
import { loginRequest, logoutRequest } from '../lib/auth/http';

const db = new PGlite();
const auth = new AuthService(db);
const origin = 'http://localhost:3000';
before(async () => { await migrate(db); await seedDemoUsers(db); });
after(async () => { await db.close(); });

function request(body: string, extra: Record<string, string> = {}) {
  return new Request(`${origin}/api/auth/login`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json', ...extra }, body,
  });
}

test('HTTP login rejects cross-site, malformed and oversized requests', async () => {
  for (const [req, code] of [
    [request('{}', { origin: 'https://evil.example' }), 403],
    [request('{}', { origin: '' }), 403],
    [request('{'), 400],
    [request('x'.repeat(5000)), 413],
    [request('{}', { 'content-type': 'text/plain' }), 415],
    [request('{"login":"test1"}'), 400],
  ] as const) {
    const response = await loginRequest(req, auth, origin);
    assert.equal(response.status, code);
    assert.equal(response.headers.get('set-cookie'), null);
  }
});

test('HTTP login sets private cookie; logout denies CSRF and revokes session', async () => {
  const response = await loginRequest(request('{"login":"test1","password":"test1","userId":"other"}'), auth, origin);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control')!, /no-store/);
  const cookie = response.headers.get('set-cookie')!;
  assert.match(cookie, /HttpOnly/);
  const token = cookie.split(';')[0].split('=')[1];
  assert.equal((await auth.getUser(token))?.login, 'test1');
  assert.deepEqual(await response.json(), { ok: true });
  const denied = await logoutRequest(request('{}', { cookie, origin: 'https://evil.example' }), auth, origin);
  assert.equal(denied.status, 403);
  assert.ok(await auth.getUser(token));
  const logout = await logoutRequest(request('{}', { cookie }), auth, origin);
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie')!, /Max-Age=0/);
  assert.equal(await auth.getUser(token), null);
});

test('HTTP returns generic invalid-credentials errors and a retry interval when limited', async () => {
  const wrong = await loginRequest(request('{"login":"test2","password":"wrong"}'), auth, origin);
  const unknown = await loginRequest(request('{"login":"missing","password":"wrong"}'), auth, origin);
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(await wrong.json(), await unknown.json());
  for (let i = 0; i < 4; i++) await loginRequest(request('{"login":"missing","password":"wrong"}'), auth, origin);
  const limited = await loginRequest(request('{"login":"missing","password":"wrong"}'), auth, origin);
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
});

test('database outages fail closed without exposing connection secrets', async () => {
  const broken = new AuthService({ query: async () => { throw new Error('postgresql://secret:password@private'); } });
  const response = await loginRequest(request('{"login":"test1","password":"test1"}'), broken, origin);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.doesNotMatch(await response.text(), /secret|password|private|postgresql/);
});

test('maintenance failure after session rotation still delivers the valid new cookie', async () => {
  const cleanupFailure = new AuthService({
    async query<T>(sql: string, parameters?: unknown[]) {
      if (sql === 'DELETE FROM sessions WHERE expires_at <= now()') throw new Error('cleanup timeout');
      return db.query<T>(sql, parameters);
    },
  });
  const response = await loginRequest(request('{"login":"test3","password":"test3"}'), cleanupFailure, origin);
  assert.equal(response.status, 200);
  const token = response.headers.get('set-cookie')!.split(';')[0].split('=')[1];
  assert.equal((await auth.getUser(token))?.login, 'test3');
});

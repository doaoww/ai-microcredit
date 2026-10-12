import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword, verifyPassword } from '../lib/auth/password';
import { parseCredentials, readJson, requireSameOrigin, sessionCookie, tokenHash } from '../lib/auth/security';

test('password hashes are salted and only verify the original password', async () => {
  const first = await hashPassword('test1');
  const second = await hashPassword('test1');
  assert.notEqual(first, second);
  assert(!first.includes('test1'));
  assert.equal(await verifyPassword('test1', first), true);
  assert.equal(await verifyPassword('wrong', first), false);
  assert.equal(await verifyPassword('test1', 'corrupt'), false);
});

test('credentials normalize login but preserve password and reject malformed input', () => {
  assert.deepEqual(parseCredentials({ login: ' TEST1 ', password: ' test1 ' }), { login: 'test1', password: ' test1 ' });
  for (const value of [null, [], {}, { login: 'test1', password: '' }, { login: 'x'.repeat(65), password: 'test1' }, { login: 'test1', password: 'x'.repeat(257) }, { login: "' OR 1=1 --", password: 'test1' }]) {
    assert.equal(parseCredentials(value), null);
  }
});

test('mutations require exact trusted origin, including when Origin is missing', () => {
  const request = (origin?: string, site?: string) => new Request('http://localhost:3000/api/auth/login', {
    method: 'POST', headers: { ...(origin ? { origin } : {}), ...(site ? { 'sec-fetch-site': site } : {}) },
  });
  assert.doesNotThrow(() => requireSameOrigin(request('http://localhost:3000'), 'http://localhost:3000'));
  assert.throws(() => requireSameOrigin(request(), 'http://localhost:3000'));
  assert.throws(() => requireSameOrigin(request('https://evil.example'), 'http://localhost:3000'));
  assert.throws(() => requireSameOrigin(request('http://localhost:3000', 'cross-site'), 'http://localhost:3000'));
});

test('JSON reader rejects oversized actual bodies without trusting Content-Length', async () => {
  const req = (body: string, contentType = 'application/json') => new Request('http://localhost', {
    method: 'POST', headers: { 'content-type': contentType }, body,
  });
  assert.deepEqual(await readJson(req('{"login":"test1"}')), { login: 'test1' });
  await assert.rejects(readJson(req('x'.repeat(5000))));
  await assert.rejects(readJson(req('{')));
  await assert.rejects(readJson(req('{}', 'text/plain')));
});

test('session tokens are hashed and cookies are protected and revocable', () => {
  const token = 'a'.repeat(64);
  assert.notEqual(tokenHash(token), token);
  const cookie = sessionCookie(token, new Date('2030-01-01'), 'https://credit.example');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  assert.match(sessionCookie('', new Date(0), 'http://localhost:3000'), /Max-Age=0/);
  assert.throws(() => sessionCookie(token, new Date(), 'http://credit.example'));
});

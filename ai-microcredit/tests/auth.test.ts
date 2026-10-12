import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../db/migrate';
import { seedDemoUsers } from '../db/seed';
import { AuthService } from '../lib/auth/service';
import { tokenHash } from '../lib/auth/security';

const db = new PGlite();
const auth = new AuthService(db);
before(async () => { await migrate(db); await seedDemoUsers(db); });
beforeEach(async () => { await db.query('DELETE FROM login_rate_limits'); });
after(async () => { await db.close(); });

test('migrations and seed are repeatable without overwriting existing users or duplicating applications', async () => {
  await db.query("UPDATE users SET display_name = 'Preserved' WHERE login = 'test1'");
  await migrate(db);
  await seedDemoUsers(db);
  assert.equal((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM users')).rows[0].count, 5);
  assert.equal((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM credit_applications')).rows[0].count, 4);
  assert.equal((await db.query<{ display_name: string }>("SELECT display_name FROM users WHERE login = 'test1'")).rows[0].display_name, 'Preserved');
});

test('invalid, unknown and blocked credentials fail identically; SQL input cannot log in', async () => {
  assert.equal((await auth.login('test1', 'wrong')).kind, 'invalid');
  assert.equal((await auth.login('unknown', 'wrong')).kind, 'invalid');
  assert.equal((await auth.login("' OR 1=1 --", 'wrong')).kind, 'invalid');
  await db.query("UPDATE users SET account_status = 'BLOCKED' WHERE login = 'test1'");
  assert.equal((await auth.login('test1', 'test1')).kind, 'invalid');
  await db.query("UPDATE users SET account_status = 'ACTIVE' WHERE login = 'test1'");
});

test('five users see only their own status, stored tokens are hashes, and re-login rotates the session', async () => {
  for (const [index, expected] of [null, 'PENDING', 'APPROVED', 'REJECTED', 'ISSUED'].entries()) {
    const login = `test${index + 1}`;
    const result = await auth.login(login, login);
    assert.equal(result.kind, 'success');
    if (result.kind !== 'success') throw new Error('login failed');
    const dashboard = await auth.getDashboard(result.token);
    assert.equal(dashboard?.user.login, login);
    assert.equal(dashboard?.application?.status ?? null, expected);
    assert.equal('password_hash' in dashboard!.user, false);
    const stored = await db.query<{ token_hash: string }>('SELECT token_hash FROM sessions WHERE token_hash = $1', [tokenHash(result.token)]);
    assert.notEqual(stored.rows[0].token_hash, result.token);
    const next = await auth.login(login, login, result.token);
    assert.equal(next.kind, 'success');
    assert.equal(await auth.getUser(result.token), null);
  }
});

test('missing, tampered, expired, blocked and revoked sessions cannot access dashboard', async () => {
  assert.equal(await auth.getDashboard(undefined), null);
  assert.equal(await auth.getDashboard('0'.repeat(64)), null);
  const login = await auth.login('test3', 'test3');
  if (login.kind !== 'success') throw new Error('login failed');
  await db.query('UPDATE sessions SET expires_at = now() - interval \'1 second\' WHERE token_hash = $1', [tokenHash(login.token)]);
  assert.equal(await auth.getDashboard(login.token), null);
  const valid = await auth.login('test4', 'test4');
  if (valid.kind !== 'success') throw new Error('login failed');
  await db.query("UPDATE users SET account_status = 'BLOCKED' WHERE login = 'test4'");
  assert.equal(await auth.getDashboard(valid.token), null);
  await db.query("UPDATE users SET account_status = 'ACTIVE' WHERE login = 'test4'");
  await auth.logout(valid.token);
  assert.equal(await auth.getDashboard(valid.token), null);
});

test('parallel requests cannot bypass login limits; windows expire', async () => {
  const results = await Promise.all(Array.from({ length: 8 }, () => auth.login('limited', 'wrong')));
  assert.equal(results.filter((result) => result.kind === 'invalid').length, 5);
  assert.equal(results.filter((result) => result.kind === 'limited').length, 3);
  await db.query("UPDATE login_rate_limits SET window_start = now() - interval '16 minutes'");
  assert.equal((await auth.login('limited', 'wrong')).kind, 'invalid');
});

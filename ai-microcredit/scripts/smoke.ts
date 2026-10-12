import assert from 'node:assert/strict';

async function main() {
  const origin = process.env.SMOKE_ORIGIN ?? 'http://localhost:3000';
  if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Smoke test is for local demo accounts only');
  const send = (path: string, init?: RequestInit) => fetch(`${origin}${path}`, { redirect: 'manual', ...init });
  const anonymous = await send('/dashboard');
  assert.equal(anonymous.status, 307);
  assert.equal(anonymous.headers.get('location'), '/login');
  for (const [index, label] of ['У вас пока нет заявки.', 'Заявка рассматривается', 'Кредит одобрен', 'В кредите отказано', 'Кредит выдан'].entries()) {
    const login = `test${index + 1}`;
    const result = await send('/api/auth/login', {
      method: 'POST', headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ login, password: login }),
    });
    assert.equal(result.status, 200, `Login ${login} failed: ${result.status}`);
    const cookieHeader = result.headers.get('set-cookie')!;
    assert.match(cookieHeader, /httponly/i);
    const cookie = cookieHeader.split(';')[0];
    const dashboard = await send('/dashboard?userId=someone-else', { headers: { cookie } });
    assert.equal(dashboard.status, 200);
    assert.match(dashboard.headers.get('cache-control')!, /no-store/);
    const html = await dashboard.text();
    assert.ok(html.includes(label), `Expected status missing for ${login}`);
    assert.ok(html.includes(login));
    assert.ok(!html.includes('password_hash'));
    const redirected = await send('/login', { headers: { cookie } });
    assert.equal(redirected.headers.get('location'), '/dashboard');
    const logout = await send('/api/auth/logout', {
      method: 'POST', headers: { origin, cookie, 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(logout.status, 200);
    assert.equal((await send('/dashboard', { headers: { cookie } })).headers.get('location'), '/login');
    console.log(`${login}: login, own status, protected cache and logout verified.`);
  }
  const csrf = await send('/api/auth/login', {
    method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}',
  });
  assert.equal(csrf.status, 403);
  console.log('Anonymous access and cross-site requests denied.');
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });

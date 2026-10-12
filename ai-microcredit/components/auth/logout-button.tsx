'use client';
import { useState } from 'react';

export function LogoutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function logout() {
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      if (!response.ok) { setError('Не удалось выйти. Повторите попытку.'); return; }
      window.location.replace('/');
    } catch { setError('Нет соединения с сервером. Повторите попытку.'); }
    finally { setPending(false); }
  }
  return <div><button onClick={logout} disabled={pending}>{pending ? 'Выходим…' : 'Выйти'}</button>{error && <p role="alert">{error}</p>}</div>;
}

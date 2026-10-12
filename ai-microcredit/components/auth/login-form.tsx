'use client';
import { useState, type FormEvent } from 'react';

export function LoginForm() {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: data.get('login'), password: data.get('password') }),
      });
      const result = await response.json();
      console.log(response.headers.get('set-cookie'));
      if (!response.ok) { setError(result.error ?? 'Не удалось войти.'); return; }
      // Full navigation discards client-side data from any previous account.
      //window.location.replace('/dashboard');
    } catch { setError('Не удалось связаться с сервером. Проверьте соединение и повторите попытку.'); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} className="auth-form" aria-busy={pending}>
    <label htmlFor="login">Логин</label>
    <input id="login" name="login" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={64} required disabled={pending} aria-describedby={error ? 'login-error' : undefined} />
    <label htmlFor="password">Пароль</label>
    <input id="password" name="password" type="password" autoComplete="current-password" maxLength={256} required disabled={pending} aria-describedby={error ? 'login-error' : undefined} />
    {error && <p id="login-error" role="alert">{error}</p>}
    <button type="submit" disabled={pending}>{pending ? 'Входим…' : 'Войти'}</button>
  </form>;
}

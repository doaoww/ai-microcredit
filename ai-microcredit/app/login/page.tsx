import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/login-form';
import { currentUser } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';
export default async function LoginPage() {
  if (await currentUser()) redirect('/dashboard');
  return <>
    <header className="site-header"><Link href="/">На главную</Link></header>
    <main className="narrow"><h1>Вход</h1><p>Введите логин и пароль вашего аккаунта.</p><LoginForm /></main>
  </>;
}

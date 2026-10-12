import Link from 'next/link';
import { LogoutButton } from '@/components/auth/logout-button';
import { ApplicationStatus } from '@/components/credit/application-status';
import { requireDashboard } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';
export default async function DashboardPage() {
  const { user, application } = await requireDashboard();
  return <>
    <header className="site-header"><Link href="/">Кредитный кабинет</Link><LogoutButton /></header>
    <main><h1>Личный кабинет</h1><p>Здравствуйте, {user.displayName}.</p><p>Ваш логин: <strong>{user.login}</strong></p>
      <section aria-labelledby="credit-heading"><h2 id="credit-heading">Ваша заявка</h2><ApplicationStatus status={application?.status ?? null} /></section>
    </main>
  </>;
}

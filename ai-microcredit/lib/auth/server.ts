import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { database } from '../db/client';
import { AuthService } from './service';
import { SESSION_COOKIE } from './security';

export const auth = new AuthService(database);
export async function currentUser() {
  return auth.getUser((await cookies()).get(SESSION_COOKIE)?.value);
}
export async function requireDashboard() {
  const dashboard = await auth.getDashboard((await cookies()).get(SESSION_COOKIE)?.value);
  if (!dashboard) redirect('/login');
  return dashboard;
}

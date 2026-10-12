import { auth } from '@/lib/auth/server';
import { logoutRequest } from '@/lib/auth/http';

export const runtime = 'nodejs';
export async function POST(request: Request) { return logoutRequest(request, auth); }

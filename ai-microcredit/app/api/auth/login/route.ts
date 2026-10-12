import { auth } from '@/lib/auth/server';
import { loginRequest } from '@/lib/auth/http';

export const runtime = 'nodejs';
export async function POST(request: Request) { return loginRequest(request, auth); }

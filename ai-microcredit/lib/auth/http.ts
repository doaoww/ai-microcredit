import type { AuthService } from './service';
import { appOrigin, HttpError, parseCredentials, readJson, readSessionCookie, requireSameOrigin, sessionCookie } from './security';

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

function failure(error: unknown): Response {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  console.error('Authentication request failed; check database availability and server configuration.');
  return json({ error: 'Сервис временно недоступен. Попробуйте позже.' }, 503);
}

export async function loginRequest(request: Request, auth: AuthService, configuredOrigin?: string): Promise<Response> {
  try {
    const origin = appOrigin(configuredOrigin);
    requireSameOrigin(request, origin);
    const credentials = parseCredentials(await readJson(request));
    if (!credentials) throw new HttpError(400, 'Введите логин и пароль.');
    const result = await auth.login(credentials.login, credentials.password, readSessionCookie(request));
    if (result.kind === 'limited') return json({ error: 'Слишком много попыток входа. Повторите через 15 минут.' }, 429, { 'Retry-After': String(result.retryAfter) });
    if (result.kind === 'invalid') return json({ error: 'Неверный логин или пароль.' }, 401);
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(result.token, result.expiresAt, origin) });
  } catch (error) { return failure(error); }
}

export async function logoutRequest(request: Request, auth: AuthService, configuredOrigin?: string): Promise<Response> {
  try {
    const origin = appOrigin(configuredOrigin);
    requireSameOrigin(request, origin);
    await readJson(request);
    await auth.logout(readSessionCookie(request));
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', new Date(0), origin) });
  } catch (error) { return failure(error); }
}

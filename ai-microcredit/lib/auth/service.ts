import { randomBytes } from 'node:crypto';
import type { Database } from '../db/types';
import { DUMMY_PASSWORD_HASH, verifyPassword } from './password';
import { parseCredentials, SESSION_SECONDS, tokenHash, validToken } from './security';

export type User = { id: string; login: string; displayName: string };
export type CreditStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ISSUED';
export type Dashboard = { user: User; application: { id: string; status: CreditStatus } | null };
export type LoginResult = { kind: 'success'; token: string; expiresAt: Date } | { kind: 'invalid' } | { kind: 'limited'; retryAfter: number };

export class AuthService {

  constructor(private readonly db: Database) {}

  private async consumeLimit(key: string, maximum: number): Promise<boolean> {
    const result = await this.db.query<{ attempts: number }>(`
      INSERT INTO login_rate_limits(key, attempts) VALUES ($1, 1)
      ON CONFLICT (key) DO UPDATE SET
        attempts = CASE WHEN login_rate_limits.window_start <= now() - interval '15 minutes'
          THEN 1 ELSE login_rate_limits.attempts + 1 END,
        window_start = CASE WHEN login_rate_limits.window_start <= now() - interval '15 minutes'
          THEN now() ELSE login_rate_limits.window_start END
      RETURNING attempts`, [key]);
    return result.rows[0].attempts <= maximum;
  }

  async login(login: string, password: string, previousToken?: string): Promise<LoginResult> {
    const credentials = parseCredentials({ login, password });
    if (!credentials) return { kind: 'invalid' };

    // Shared DB counters work across processes. No trust in spoofable client IP headers.
    if (!await this.consumeLimit('global', 1000)) return { kind: 'limited', retryAfter: 900 };
    if (!await this.consumeLimit(`login:${tokenHash(credentials.login)}`, 100)) return { kind: 'limited', retryAfter: 900 };

    const result = await this.db.query<{ id: string; password_hash: string; account_status: string }>(
      'SELECT id, password_hash, account_status FROM users WHERE login = $1', [credentials.login],
    );
    const user = result.rows[0];
    const matches = await verifyPassword(credentials.password, user?.password_hash ?? DUMMY_PASSWORD_HASH);

    if (!user || !matches || user.account_status !== 'ACTIVE') return { kind: 'invalid' };

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
    // A single statement atomically rotates the browser's previous session.
    const inserted = await this.db.query(`
      WITH revoked AS (DELETE FROM sessions WHERE token_hash = $4)
      INSERT INTO sessions(token_hash, user_id, expires_at)
      SELECT $1, id, $3 FROM users WHERE id = $2 AND account_status = 'ACTIVE' AND password_hash = $5
      RETURNING token_hash`, [tokenHash(token), user.id, expiresAt, validToken(previousToken) ? tokenHash(previousToken) : '', user.password_hash]);
    if (!inserted.rows.length) return { kind: 'invalid' };
    try {
      await this.db.query('DELETE FROM sessions WHERE expires_at <= now()');
      await this.db.query("DELETE FROM login_rate_limits WHERE window_start < now() - interval '1 day'");
    } catch {
      // The new session is already committed. Maintenance must not hide its cookie.
      console.error('Expired authentication records could not be cleaned up.');
    }
    return { kind: 'success', token, expiresAt };
  }

  async getUser(token?: string): Promise<User | null> {
    if (!validToken(token)) return null;
    const result = await this.db.query<User>(`
      SELECT u.id, u.login, u.display_name AS "displayName"
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.account_status = 'ACTIVE'`, [tokenHash(token)]);
    return result.rows[0] ?? null;
  }

  async getDashboard(token?: string): Promise<Dashboard | null> {
    if (!validToken(token)) return null;
    const result = await this.db.query<User & { application_id: string | null; status: CreditStatus | null }>(`
      SELECT u.id, u.login, u.display_name AS "displayName", a.id AS application_id, a.status
      FROM sessions s JOIN users u ON u.id = s.user_id
      LEFT JOIN LATERAL (
        SELECT id, status FROM credit_applications WHERE user_id = u.id ORDER BY created_at DESC, id DESC LIMIT 1
      ) a ON true
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.account_status = 'ACTIVE'`, [tokenHash(token)]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      user: { id: row.id, login: row.login, displayName: row.displayName },
      application: row.application_id && row.status ? { id: row.application_id, status: row.status } : null,
    };
  }

  async logout(token?: string): Promise<void> {
    if (validToken(token)) await this.db.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash(token)]);
  }
}

import { randomUUID } from 'node:crypto';
import { hashPassword } from '../lib/auth/password';
import type { Database } from '../lib/db/types';

export async function seedDemoUsers(db: Database): Promise<void> {
  await db.query('BEGIN');
  try {
    await db.query('SELECT pg_advisory_xact_lock(76123001)');
    for (const [index, status] of [null, 'PENDING', 'APPROVED', 'REJECTED', 'ISSUED'].entries()) {
      const login = `test${index + 1}`;
      const id = randomUUID();
      const inserted = await db.query(
        'INSERT INTO users(id, login, display_name, password_hash) VALUES ($1, $2, $3, $4) ON CONFLICT (login) DO NOTHING RETURNING id',
        [id, login, `Тестовый пользователь ${index + 1}`, await hashPassword(login)],
      );
      if (inserted.rows.length && status) {
        await db.query('INSERT INTO credit_applications(id, user_id, status) VALUES ($1, $2, $3)', [randomUUID(), id, status]);
      }
    }
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

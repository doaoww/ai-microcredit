import { readFile } from 'node:fs/promises';
import type { Database } from '../lib/db/types';

// Pass a dedicated PostgreSQL connection: the entire migration uses one transaction.
export async function migrate(db: Database): Promise<void> {
  await db.query('BEGIN');
  try {
    await db.query('SELECT pg_advisory_xact_lock(76123001)');
    await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const name = '001_auth.sql';
    const existing = await db.query('SELECT name FROM schema_migrations WHERE name = $1', [name]);
    if (existing.rows.length === 0) {
      const sql = await readFile(new URL('./migrations/001_auth.sql', import.meta.url), 'utf8');
      // This migration contains plain DDL only; no procedural bodies with semicolons.
      for (const statement of sql.split(';').map((part) => part.trim()).filter(Boolean)) await db.query(statement);
      await db.query('INSERT INTO schema_migrations(name) VALUES ($1)', [name]);
    }
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

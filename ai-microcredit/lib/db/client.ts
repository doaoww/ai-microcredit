import 'server-only';
import { Pool } from 'pg';
import type { Database } from './types';

const shared = globalThis as unknown as { creditPool?: Pool };

function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!shared.creditPool) {
    shared.creditPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      statement_timeout: 10000,
    });
    shared.creditPool.on('error', () => console.error('PostgreSQL pool connection failed'));
  }
  return shared.creditPool;
}

export const database: Database = {
  async query<T>(sql: string, parameters?: unknown[]) {
    const result = await getPool().query(sql, parameters);
    return { rows: result.rows as T[] };
  },
};

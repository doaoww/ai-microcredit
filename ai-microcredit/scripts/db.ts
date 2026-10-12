import { loadEnvConfig } from '@next/env';
import { Client } from 'pg';
import { migrate } from '../db/migrate';
import { seedDemoUsers } from '../db/seed';

async function main() {
  loadEnvConfig(process.cwd());
  const command = process.argv[2];
  if (!['migrate', 'seed', 'setup'].includes(command)) throw new Error('Use migrate, seed or setup');
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in .env.local');
  if (command !== 'migrate' && (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEMO_SEED !== 'true')) {
    throw new Error('Demo seed requires ALLOW_DEMO_SEED=true and a non-production environment');
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    if (command !== 'seed') { await migrate(client); console.log('Database migrations applied.'); }
    if (command !== 'migrate') { await seedDemoUsers(client); console.log('Demo accounts ready: test1 through test5 (password = login). Existing accounts were preserved.'); }
  } finally { await client.end(); }
}
main().catch((error: unknown) => {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'SETUP_FAILED';
  console.error(`Database setup failed (${code}). Check Docker, DATABASE_URL and ALLOW_DEMO_SEED. See README.md.`);
  process.exitCode = 1;
});

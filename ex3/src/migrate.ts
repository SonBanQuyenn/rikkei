import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';

// Chay migration an toan:
// - pg_advisory_lock: hai tien trinh migrate khong bao gio chay chong len nhau
// - moi file chay trong 1 transaction: loi giua chung -> ROLLBACK, schema quay ve nhu cu
// - bang schema_migrations ghi lai file da chay -> chay lai lan sau chi lam phan con thieu
const MIGRATION_LOCK_ID = 727274;
const migrationsDir = process.env.MIGRATIONS_DIR ?? join(__dirname, '..', 'migrations');

export async function migrate(databaseUrl: string): Promise<string[]> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
    );
    const done = new Set(
      (await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map(
        (r) => r.name,
      ),
    );
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (done.has(file)) continue;
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
        console.log(`[migrate] OK   ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[migrate] FAIL ${file} -> da ROLLBACK, schema giu nguyen`);
        throw err;
      }
    }
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => undefined);
    await client.end();
  }
}

if (require.main === module) {
  migrate(process.env.DATABASE_URL ?? '')
    .then((applied) => console.log(`[migrate] xong, ${applied.length} migration moi`))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

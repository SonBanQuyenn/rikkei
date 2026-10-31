import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL ?? '';
const pool = new Pool({ connectionString: databaseUrl });

async function loadMigrate(dir: string) {
  process.env.MIGRATIONS_DIR = dir;
  jest.resetModules();
  return (await import('../../src/migrate')).migrate;
}

beforeEach(async () => {
  await pool.query('DROP TABLE IF EXISTS schema_migrations, products, orders CASCADE');
});

afterAll(() => pool.end());

describe('migrate', () => {
  it('chay cac migration theo thu tu va khong chay lai lan 2', async () => {
    const migrate = await loadMigrate(join(__dirname, '..', '..', 'migrations'));
    expect(await migrate(databaseUrl)).toEqual([
      '001_create_products.sql',
      '002_add_products_stock.sql',
    ]);
    expect(await migrate(databaseUrl)).toEqual([]);
  });

  it('migration loi giua chung duoc ROLLBACK, khong de schema nua voi', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mig-'));
    writeFileSync(join(dir, '001_ok.sql'), 'CREATE TABLE products (id SERIAL PRIMARY KEY);');
    // Cau lenh dau thanh cong, cau lenh thu hai loi -> ca file phai bi huy
    writeFileSync(
      join(dir, '002_broken.sql'),
      'CREATE TABLE orders (id SERIAL PRIMARY KEY); ALTER TABLE khong_ton_tai ADD COLUMN x INT;',
    );
    const migrate = await loadMigrate(dir);

    await expect(migrate(databaseUrl)).rejects.toThrow();

    const tables = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1",
    );
    expect(tables.rows.map((r) => r.table_name)).toEqual(['products', 'schema_migrations']);
    const done = await pool.query('SELECT name FROM schema_migrations');
    expect(done.rows.map((r) => r.name)).toEqual(['001_ok.sql']);
  });
});

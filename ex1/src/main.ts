import express from 'express';
import { Pool } from 'pg';

const app = express();
const port = Number(process.env.PORT ?? 3000);

// Doc cau hinh tu bien moi truong luc chay, khong co gia tri mac dinh cho khoa bi mat
const databaseUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;
if (!databaseUrl || !jwtSecret) {
  console.error('Thieu DATABASE_URL hoac JWT_SECRET');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/products', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, name, price FROM products ORDER BY id');
    res.json(rows);
  } catch {
    res.status(500).json({ message: 'Database error' });
  }
});

const server = app.listen(port, () => {
  console.log(`ShopFast API dang chay tai cong ${port}`);
});

// Nhan SIGTERM tu docker stop de dong ket noi gon gang
process.on('SIGTERM', () => {
  server.close(() => pool.end().then(() => process.exit(0)));
});

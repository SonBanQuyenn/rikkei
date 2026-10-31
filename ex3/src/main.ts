import express from 'express';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { ProductRepository } from './product.repository';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
const products = new ProductRepository(pool, redis);

const app = express();

// Health check dung cho deploy.sh: chi tra 200 khi DB va Redis deu ket noi duoc
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    await redis.ping();
    res.json({ status: 'ok', version: process.env.APP_VERSION ?? 'dev' });
  } catch {
    res.status(503).json({ status: 'error' });
  }
});

app.get('/products/:id', async (req, res) => {
  const product = await products.findById(Number(req.params.id));
  if (!product) return res.status(404).json({ message: 'Not found' });
  return res.json(product);
});

app.listen(Number(process.env.PORT ?? 3000));

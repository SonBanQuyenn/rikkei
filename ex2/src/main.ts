import express from 'express';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { ProductRepository } from './product.repository';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
const products = new ProductRepository(pool, redis);

const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/products/:id', async (req, res) => {
  const product = await products.findById(Number(req.params.id));
  if (!product) return res.status(404).json({ message: 'Not found' });
  return res.json(product);
});

app.listen(Number(process.env.PORT ?? 3000));

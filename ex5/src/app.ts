import express from 'express';
import { Metrics } from './metrics';
import { signToken, verifyToken } from './token';

export interface AppConfig {
  version: string;
  jwtSecret: string;
}

const products = [
  { id: 1, name: 'Ao thun ShopFast', price: 150000 },
  { id: 2, name: 'Mu luoi trai', price: 90000 },
];

export function createApp(config: AppConfig) {
  const app = express();
  const metrics = new Metrics();
  app.use(express.json());
  app.use(metrics.middleware());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: config.version });
  });

  app.get('/metrics', (_req, res) => {
    res.json({ version: config.version, ...metrics.snapshot() });
  });

  app.get('/products', (_req, res) => {
    res.json(products);
  });

  app.get('/products/:id', (req, res) => {
    const product = products.find((p) => p.id === Number(req.params.id));
    if (!product) return res.status(404).json({ message: 'Not found' });
    return res.json(product);
  });

  app.post('/auth/token', (req, res) => {
    const userId = req.body?.userId;
    if (typeof userId !== 'string' || userId.length === 0) {
      return res.status(400).json({ message: 'userId is required' });
    }
    return res.json({ token: signToken(userId, config.jwtSecret) });
  });

  app.get('/me', (req, res) => {
    const token = (req.header('authorization') ?? '').replace(/^Bearer /, '');
    const userId = verifyToken(token, config.jwtSecret);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    return res.json({ userId });
  });

  return app;
}

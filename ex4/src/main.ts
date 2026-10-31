import http from 'http';
import express from 'express';
import { Pool } from 'pg';
import { WebSocketServer, WebSocket } from 'ws';

const VERSION = process.env.APP_VERSION ?? 'dev';
const DRAIN_TIMEOUT_MS = Number(process.env.DRAIN_TIMEOUT_MS ?? 45_000);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

let draining = false;

const app = express();
app.use(express.static('public'));

// Readiness: nginx/deploy script chi chuyen luong khi tra 200.
// Khi dang drain tra 503 de khong nhan request moi.
app.get('/health', async (_req, res) => {
  if (draining) return res.status(503).json({ status: 'draining', version: VERSION });
  try {
    await pool.query('SELECT 1');
    return res.json({ status: 'ok', version: VERSION });
  } catch {
    return res.status(503).json({ status: 'db_unavailable', version: VERSION });
  }
});

// Phien ban 2.0 doc cot moi unit_price (migration expand da them va dong bo voi price),
// nen chay duoc song song voi phien ban 1.x van doc/ghi cot price.
app.get('/products/:id', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, unit_price::float AS "unitPrice" FROM products WHERE id = $1',
    [Number(req.params.id)],
  );
  if (!rows[0]) return res.status(404).json({ message: 'Not found' });
  return res.json({ ...rows[0], servedBy: VERSION });
});

const server = http.createServer(app);

// Kenh realtime (thong bao don hang, gio hang...)
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (socket) => {
  socket.send(JSON.stringify({ type: 'hello', version: VERSION }));
  const timer = setInterval(() => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'tick', at: Date.now(), version: VERSION }));
    }
  }, 5_000);
  socket.on('close', () => clearInterval(timer));
});

server.listen(Number(process.env.PORT ?? 3000), () => {
  console.log(`ShopFast ${VERSION} san sang`);
});

// Dong gon gang khi container bi dung (docker stop gui SIGTERM):
// 1. /health tra 503, ngung nhan ket noi moi
// 2. Bao tung client WebSocket tu ket noi lai sau mot khoang ngau nhien (rai deu tai len ban moi)
// 3. Cho client tu roi di, het DRAIN_TIMEOUT_MS moi dong han
function shutdown(signal: string) {
  if (draining) return;
  draining = true;
  console.log(`${signal}: bat dau drain ${wss.clients.size} ket noi realtime`);

  server.close();
  for (const client of wss.clients) {
    const retryAfterMs = Math.floor(Math.random() * 10_000);
    client.send(JSON.stringify({ type: 'reconnect', retryAfterMs }));
  }

  const startedAt = Date.now();
  const check = setInterval(() => {
    const left = wss.clients.size;
    if (left === 0 || Date.now() - startedAt > DRAIN_TIMEOUT_MS) {
      clearInterval(check);
      for (const client of wss.clients) client.close(1012, 'Service restart');
      pool.end().finally(() => process.exit(0));
    }
  }, 500);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

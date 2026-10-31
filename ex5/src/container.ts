import { CacheMetrics } from './cache/cache-metrics.js';
import { CacheService } from './cache/cache.service.js';
import { RedisCacheClient, type RedisClientOptions, type RedisLike } from './cache/redis-cache.client.js';
import { FakeDb } from './data/fake-db.js';
import { CartService, CatalogService, ProductService, ReportService } from './domain/shop.services.js';

export type ShopOptions = {
  redis: RedisLike;
  db?: FakeDb;
  cacheEnabled?: boolean;
  redisOptions?: RedisClientOptions;
};

/** Lap rap cac tang: Redis client -> CacheService -> service nghiep vu. */
export function createShop({ redis, db = new FakeDb(), cacheEnabled = true, redisOptions }: ShopOptions) {
  const client = new RedisCacheClient(redis, redisOptions);
  const metrics = new CacheMetrics();
  const cache = new CacheService(client, metrics, cacheEnabled);
  const products = new ProductService(db, cache);
  return {
    db,
    client,
    metrics,
    cache,
    catalog: new CatalogService(db, cache),
    products,
    carts: new CartService(db, cache, products),
    reports: new ReportService(db, cache),
  };
}

export type Shop = ReturnType<typeof createShop>;

import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp({ version: 'test', jwtSecret: 'test-secret' });

describe('ShopFast API', () => {
  it('GET /health tra ve version', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', version: 'test' });
  });

  it('GET /products tra ve danh sach', async () => {
    const res = await request(app).get('/products');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('GET /products/:id tra ve san pham hoac 404', async () => {
    expect((await request(app).get('/products/1')).body.name).toBe('Ao thun ShopFast');
    expect((await request(app).get('/products/99')).status).toBe(404);
  });

  it('cap token va xac thuc /me', async () => {
    const { body } = await request(app).post('/auth/token').send({ userId: 'u1' });
    const me = await request(app).get('/me').set('authorization', `Bearer ${body.token}`);
    expect(me.body).toEqual({ userId: 'u1' });
  });

  it('tu choi yeu cau thieu userId va token sai', async () => {
    expect((await request(app).post('/auth/token').send({})).status).toBe(400);
    expect((await request(app).get('/me').set('authorization', 'Bearer x.y.z')).status).toBe(401);
  });

  it('GET /metrics dem request va loi', async () => {
    const fresh = createApp({ version: 'm', jwtSecret: 's' });
    await request(fresh).get('/health');
    await request(fresh).get('/products/99');
    const res = await request(fresh).get('/metrics');
    expect(res.body).toMatchObject({ version: 'm', requestsTotal: 2, errors5xxTotal: 0 });
  });
});

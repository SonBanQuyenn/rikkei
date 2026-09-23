import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('UsersController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('Login rồi gọi GET /users/profile với token phải trả về 200', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'test@example.com', password: '123456' })
      .expect(201);

    const token = loginResponse.body.access_token;
    expect(token).toBeDefined();

    await request(app.getHttpServer())
      .get('/users/profile')
      .set('Authorization', 'Bearer ' + token)
      .expect(200);
  });

  it('GET /users/profile không có token phải trả về 401', async () => {
    await request(app.getHttpServer()).get('/users/profile').expect(401);
  });
});

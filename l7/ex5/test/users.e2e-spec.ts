import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import * as request from 'supertest';
import { UsersModule } from './../src/users/users.module';
import { User } from './../src/users/user.entity';

describe('UsersController (e2e) - Postgres thật qua Testcontainers', () => {
  let app: INestApplication;
  let container: StartedTestContainer;

  beforeAll(async () => {
    container = await new GenericContainer('postgres:15-alpine')
      .withEnvironment({
        POSTGRES_USER: 'test',
        POSTGRES_PASSWORD: 'test',
        POSTGRES_DB: 'testdb',
      })
      .withExposedPorts(5432)
      .start();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: container.getHost(),
          port: container.getMappedPort(5432),
          username: 'test',
          password: 'test',
          database: 'testdb',
          entities: [User],
          synchronize: true,
        }),
        UsersModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  }, 60000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it('/users (POST) tạo user thành công trên Postgres thật', async () => {
    const res = await request(app.getHttpServer())
      .post('/users')
      .send({ email: 'real@example.com', password: '123456' })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.email).toBe('real@example.com');
  });

  it('/users (GET) đọc lại được dữ liệu vừa tạo', async () => {
    const res = await request(app.getHttpServer()).get('/users').expect(200);
    expect(res.body.length).toBeGreaterThan(0);
  });
});

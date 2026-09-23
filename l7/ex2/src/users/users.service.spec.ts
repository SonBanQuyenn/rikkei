import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './user.entity';

describe('UsersService', () => {
  let service: UsersService;
  let repository: { create: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    repository = {
      create: jest.fn((dto) => dto),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('nên tạo user thành công', async () => {
    const dto = { email: 'test@example.com', password: '123456' };
    repository.save.mockResolvedValue({ id: 1, ...dto });

    const result = await service.create(dto);

    expect(result).toEqual({ id: 1, ...dto });
  });

  it('nên ném ra ConflictException khi Database báo email đã tồn tại', async () => {
    const dto = { email: 'trung@example.com', password: '123456' };
    repository.save.mockRejectedValue({ code: '23505' });

    await expect(async () => {
      await service.create(dto);
    }).rejects.toThrow(ConflictException);
  });
});

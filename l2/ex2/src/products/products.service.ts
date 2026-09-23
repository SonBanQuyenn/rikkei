import { Injectable } from '@nestjs/common';
import { LoggerService } from '../core/logger.service';
import { DatabaseService } from '../core/database.service';

@Injectable()
export class ProductsService {
  constructor(
    private readonly logger: LoggerService,
    private readonly database: DatabaseService,
  ) {}

  listProducts() {
    this.logger.log('Listing products');
    this.database.connect();
    return ['product1', 'product2'];
  }
}

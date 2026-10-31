import { Controller, Get, UseGuards } from '@nestjs/common';
import { ExpensiveEndpoint, QuotaGuard } from './quota/quota.guard.js';

@UseGuards(QuotaGuard)
@Controller('api')
export class ApiController {
  @Get('products')
  listProducts() {
    return [
      { sku: 'SP-001', name: 'Ao thun', price: 150_000 },
      { sku: 'SP-002', name: 'Quan jean', price: 420_000 },
    ];
  }

  @ExpensiveEndpoint()
  @Get('reports/inventory')
  exportInventoryReport() {
    return { generatedAt: new Date().toISOString(), rows: [{ sku: 'SP-001', stock: 120 }, { sku: 'SP-002', stock: 35 }] };
  }
}

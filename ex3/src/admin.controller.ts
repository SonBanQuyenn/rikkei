import { BadRequestException, Body, Controller, ForbiddenException, Headers, Param, Patch, Post } from '@nestjs/common';
import { MerchantStore } from './quota/merchant.store.js';
import { PLANS, type PlanName } from './quota/plans.js';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? 'admin-secret';

/** Thao tac noi bo: doi goi, thu hoi khoa. */
@Controller('admin')
export class AdminController {
  constructor(private readonly merchants: MerchantStore) {}

  @Patch('merchants/:id/plan')
  changePlan(@Headers('x-admin-token') token: string, @Param('id') id: string, @Body() body: { plan: PlanName }) {
    this.assertAdmin(token);
    if (!body || !(body.plan in PLANS)) throw new BadRequestException(`Goi khong hop le, chon mot trong: ${Object.keys(PLANS).join(', ')}`);
    return this.merchants.changePlan(id, body.plan);
  }

  @Post('keys/:key/revoke')
  revokeKey(@Headers('x-admin-token') token: string, @Param('key') key: string) {
    this.assertAdmin(token);
    this.merchants.revokeKey(key);
    return { key, revoked: true };
  }

  private assertAdmin(token: string | undefined) {
    if (token !== ADMIN_TOKEN) throw new ForbiddenException('Sai admin token');
  }
}

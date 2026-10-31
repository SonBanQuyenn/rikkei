import { Body, Controller, ForbiddenException, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { PolicyConfigStore } from '../shield/config/policy-config.store.js';
import { BlockLogService } from '../shield/engine/block-log.service.js';
import { MetricsService } from '../shield/engine/metrics.service.js';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? 'admin-secret';

/** Danh cho doi van hanh: xem/doi nguong luc dang chay, tra nhat ky chan, bao cao chan nham. */
@Controller('admin/shield')
export class ShieldAdminController {
  constructor(
    private readonly config: PolicyConfigStore,
    private readonly blockLog: BlockLogService,
    private readonly metrics: MetricsService,
  ) {}

  @Get('policies')
  getPolicies(@Headers('x-admin-token') token?: string) {
    assertAdmin(token);
    return this.config.get();
  }

  @Patch('policies')
  updatePolicies(@Headers('x-admin-token') token: string | undefined, @Body() patch: unknown) {
    assertAdmin(token);
    return this.config.update(patch);
  }

  @Get('logs')
  logs(
    @Headers('x-admin-token') token: string | undefined,
    @Query('layer') layer?: string,
    @Query('deviceId') deviceId?: string,
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
  ) {
    assertAdmin(token);
    return this.blockLog.query({ layer, deviceId, userId, limit: limit ? Number(limit) || undefined : undefined });
  }

  /** CSKH xac nhan mot lan chan la nham (khach khieu nai) -> tinh vao ti le chan nham. */
  @Post('logs/:id/false-positive')
  markFalsePositive(@Headers('x-admin-token') token: string | undefined, @Param('id') id: string) {
    assertAdmin(token);
    return this.blockLog.markFalsePositive(id, 'manual');
  }

  @Get('report')
  report(@Headers('x-admin-token') token?: string) {
    assertAdmin(token);
    return { ...this.metrics.report(), policies: this.config.get() };
  }
}

function assertAdmin(token: string | undefined) {
  if (token !== ADMIN_TOKEN) throw new ForbiddenException('Sai admin token');
}

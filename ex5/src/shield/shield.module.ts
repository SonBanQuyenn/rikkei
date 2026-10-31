import { Body, Controller, Headers, Module, Param, Post } from '@nestjs/common';
import { Clock } from './clock.js';
import { PolicyConfigStore } from './config/policy-config.store.js';
import { BlockLogService } from './engine/block-log.service.js';
import { ChallengeService } from './engine/challenge.service.js';
import { MetricsService } from './engine/metrics.service.js';
import { SHIELD_POLICIES, ShieldEngine } from './engine/shield.engine.js';
import { ViewTokenService } from './engine/view-token.service.js';
import { AccountFarmPolicy } from './policies/account-farm.policy.js';
import { BehaviorPolicy } from './policies/behavior.policy.js';
import { VelocityPolicy } from './policies/velocity.policy.js';
import { ShieldGuard } from './shield.guard.js';
import { MemoryShieldStore, ShieldStore } from './storage/shield-store.js';

@Controller('shield/challenges')
export class ChallengeController {
  constructor(private readonly challenges: ChallengeService) {}

  @Post(':id/solve')
  solve(@Param('id') id: string, @Headers('x-device-id') deviceId: string | undefined, @Body() body: { answer?: unknown } | undefined) {
    return this.challenges.solve(id, deviceId ?? '', body?.answer);
  }
}

@Module({
  controllers: [ChallengeController],
  providers: [
    Clock,
    PolicyConfigStore,
    { provide: ShieldStore, useClass: MemoryShieldStore },
    // Thu tu = thu tu kiem tra: lop re nhat (dem) truoc, lop can nhieu ngu canh sau
    { provide: SHIELD_POLICIES, useValue: [new VelocityPolicy(), new BehaviorPolicy(), new AccountFarmPolicy()] },
    BlockLogService,
    MetricsService,
    ChallengeService,
    ViewTokenService,
    ShieldEngine,
    ShieldGuard,
  ],
  exports: [Clock, PolicyConfigStore, ShieldStore, BlockLogService, MetricsService, ViewTokenService, ShieldGuard, ShieldEngine],
})
export class ShieldModule {}

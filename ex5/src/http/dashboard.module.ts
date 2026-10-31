import { Controller, Get, Header, Inject, Module, type DynamicModule } from '@nestjs/common';
import { ControlCenter } from '../queues/control-center.js';
import { MemoryNotifier } from '../monitoring/notifiers.js';
import { renderDashboardHtml } from './dashboard.view.js';

@Controller()
export class DashboardController {
  constructor(
    @Inject(ControlCenter) private readonly center: ControlCenter,
    @Inject(MemoryNotifier) private readonly history: MemoryNotifier,
  ) {}

  /** So job dang cho / dang chay / da xong / that bai cua tung hang doi + lich dinh ky + canh bao dang mo. */
  @Get('api/dashboard')
  async dashboard() {
    return { ...(await this.center.snapshot()), activeAlerts: this.center.activeAlerts() };
  }

  @Get('api/alerts')
  alerts() {
    return { active: this.center.activeAlerts(), history: [...this.history.events].reverse() };
  }

  @Get()
  @Header('content-type', 'text/html; charset=utf-8')
  async page() {
    const snap = await this.center.snapshot();
    return renderDashboardHtml(snap, this.center.activeAlerts(), this.history.events.slice(-15).reverse(), this.center.cfg);
  }
}

@Module({})
export class DashboardModule {
  static register(center: ControlCenter, history: MemoryNotifier): DynamicModule {
    return {
      module: DashboardModule,
      controllers: [DashboardController],
      providers: [
        { provide: ControlCenter, useValue: center },
        { provide: MemoryNotifier, useValue: history },
      ],
    };
  }
}

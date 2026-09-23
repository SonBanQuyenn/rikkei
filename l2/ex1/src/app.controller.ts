import { Controller, Get, Inject } from '@nestjs/common';
import { APP_CONFIG } from './config.constants';

@Controller()
export class AppController {
  constructor(@Inject(APP_CONFIG) private readonly config: any) {}

  @Get('info')
  getInfo() {
    return this.config;
  }
}

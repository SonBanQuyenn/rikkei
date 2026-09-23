import { Inject, Injectable } from '@nestjs/common';
import { CONFIG_OPTIONS } from './config.constants';

@Injectable()
export class ConfigService {
  constructor(@Inject(CONFIG_OPTIONS) private readonly options: { folder: string }) {}

  getFolder() {
    return this.options.folder;
  }
}

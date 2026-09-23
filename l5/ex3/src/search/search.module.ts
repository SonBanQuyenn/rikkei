import { Module } from '@nestjs/common';
import { SearchResolver } from './search.resolver';

@Module({
  providers: [SearchResolver],
})
export class SearchModule {}

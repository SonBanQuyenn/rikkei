import { Module } from '@nestjs/common';
import { AuthorLoader } from './author.loader';

@Module({
  providers: [AuthorLoader],
  exports: [AuthorLoader],
})
export class AuthorsModule {}

import { Module } from '@nestjs/common';
import { PostsResolver } from './posts.resolver';
import { AuthorsModule } from '../authors/authors.module';

@Module({
  imports: [AuthorsModule],
  providers: [PostsResolver],
})
export class PostsModule {}

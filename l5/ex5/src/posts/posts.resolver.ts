import { Query, ResolveField, Parent, Resolver } from '@nestjs/graphql';
import { Post } from './post.model';
import { findAllPosts } from './posts.db';
import { AuthorLoader } from '../authors/author.loader';

@Resolver(() => Post)
export class PostsResolver {
  constructor(private readonly authorLoader: AuthorLoader) {}

  @Query(() => [Post])
  posts(): Post[] {
    return findAllPosts();
  }

  @ResolveField(() => Object, { name: 'author' })
  author(@Parent() post: Post) {
    return this.authorLoader.batchAuthors.load(post.authorId);
  }
}

import { createUnionType } from '@nestjs/graphql';
import { Post } from './post.model';
import { User } from './user.model';

export const SearchResultUnion = createUnionType({
  name: 'SearchResultUnion',
  types: () => [Post, User] as const,
  resolveType(value) {
    if (value.title) {
      return Post;
    }
    if (value.username) {
      return User;
    }
    return null;
  },
});

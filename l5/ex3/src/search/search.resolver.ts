import { Query, Resolver } from '@nestjs/graphql';
import { SearchResultUnion } from './search-result.union';

@Resolver()
export class SearchResolver {
  @Query(() => [SearchResultUnion])
  search() {
    return [
      { id: 1, title: 'Bài viết đầu tiên' },
      { id: 1, username: 'nguyenvana' },
    ];
  }
}

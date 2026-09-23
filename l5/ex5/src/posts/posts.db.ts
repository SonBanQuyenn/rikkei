import { PostRow } from './post-row';

const posts: PostRow[] = Array.from({ length: 100 }, (_, i) => ({
  id: i + 1,
  title: `Bài viết ${i + 1}`,
  authorId: (i % 10) + 1,
}));

export function findAllPosts(): PostRow[] {
  console.log('SELECT * FROM posts');
  return posts;
}

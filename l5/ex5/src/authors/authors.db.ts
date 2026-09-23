export interface AuthorRow {
  id: number;
  name: string;
}

const authors: AuthorRow[] = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1,
  name: `Tác giả ${i + 1}`,
}));

export function findAuthorsByIds(ids: readonly number[]): AuthorRow[] {
  console.log(`SELECT * FROM authors WHERE id IN (${ids.join(',')})`);
  return ids.map((id) => authors.find((a) => a.id === id));
}

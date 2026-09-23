import { Injectable, Scope } from '@nestjs/common';
import DataLoader from 'dataloader';
import { AuthorRow, findAuthorsByIds } from './authors.db';

@Injectable({ scope: Scope.REQUEST })
export class AuthorLoader {
  public readonly batchAuthors = new DataLoader<number, AuthorRow>(
    async (ids: readonly number[]) => findAuthorsByIds(ids),
  );
}

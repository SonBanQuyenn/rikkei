import { Field, ID, ObjectType } from '@nestjs/graphql';
import { Author } from '../authors/author.model';

@ObjectType()
export class Post {
  @Field(() => ID)
  id: number;

  @Field()
  title: string;

  @Field(() => ID)
  authorId: number;

  @Field(() => Author)
  author?: Author;
}

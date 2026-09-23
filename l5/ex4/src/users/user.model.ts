import { Field, ID, ObjectType } from '@nestjs/graphql';
import { EmailScalarType } from '../scalars/email.scalar';

@ObjectType()
export class User {
  @Field(() => ID)
  id: number;

  @Field()
  name: string;

  @Field(() => EmailScalarType)
  email: string;
}

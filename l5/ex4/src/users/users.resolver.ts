import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { User } from './user.model';
import { EmailScalarType } from '../scalars/email.scalar';

@Resolver(() => User)
export class UsersResolver {
  @Query(() => User)
  user(): User {
    return { id: 1, name: 'Nguyễn Văn A', email: 'a@example.com' };
  }

  @Mutation(() => User)
  createUser(
    @Args('name') name: string,
    @Args('email', { type: () => EmailScalarType }) email: string,
  ): User {
    return { id: Date.now(), name, email };
  }
}

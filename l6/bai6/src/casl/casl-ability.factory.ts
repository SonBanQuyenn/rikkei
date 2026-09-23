import { Injectable } from '@nestjs/common';
import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { User } from '../users/user.entity';

@Injectable()
export class CaslAbilityFactory {
  createForUser(user: User) {
    const { can, build } = new AbilityBuilder(createMongoAbility);

    can('read', 'Salary', { ownerId: user.id });
    can('update', 'Salary', { ownerId: user.id });

    return build();
  }
}

import { Field, ID, ObjectType, Int } from '@nestjs/graphql';

@ObjectType()
export class OrderItem {
  @Field(() => ID)
  productId: number;

  @Field(() => Int)
  quantity: number;
}

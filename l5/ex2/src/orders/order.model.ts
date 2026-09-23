import { Field, ID, ObjectType } from '@nestjs/graphql';
import { OrderItem } from './order-item.model';

@ObjectType()
export class Order {
  @Field(() => ID)
  id: number;

  @Field(() => [OrderItem])
  items: OrderItem[];
}

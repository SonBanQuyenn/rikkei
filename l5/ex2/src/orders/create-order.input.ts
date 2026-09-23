import { Field, InputType } from '@nestjs/graphql';
import { CreateOrderItemInput } from './create-order-item.input';

@InputType()
export class CreateOrderInput {
  @Field(() => [CreateOrderItemInput])
  items: CreateOrderItemInput[];
}

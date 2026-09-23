import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Order } from './order.model';
import { CreateOrderInput } from './create-order.input';

@Resolver(() => Order)
export class OrdersResolver {
  @Mutation(() => Order)
  createOrder(@Args('input') input: CreateOrderInput): Order {
    return {
      id: Date.now(),
      items: input.items,
    };
  }
}

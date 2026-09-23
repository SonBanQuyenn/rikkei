import { Args, Mutation, Query, Resolver, Subscription } from '@nestjs/graphql';
import { Product } from './product.model';
import { pubSub } from './pubsub';

let products: Product[] = [];

@Resolver(() => Product)
export class ProductsResolver {
  @Query(() => [Product])
  products(): Product[] {
    return products;
  }

  @Mutation(() => Product)
  createProduct(@Args('name') name: string): Product {
    const product: Product = { id: Date.now(), name };
    products.push(product);
    pubSub.publish('productCreated', { productCreated: product });
    return product;
  }

  @Subscription(() => Product)
  productCreated() {
    return pubSub.asyncIterator('productCreated');
  }
}

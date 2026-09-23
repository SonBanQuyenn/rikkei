import { Query, Resolver } from '@nestjs/graphql';
import { Product } from './product.model';
import { ProductStatus } from './product-status.enum';

@Resolver(() => Product)
export class ProductsResolver {
  @Query(() => [Product])
  products(): Product[] {
    return [
      { id: 1, name: 'Áo thun', status: ProductStatus.IN_STOCK },
      { id: 2, name: 'Quần jean', status: ProductStatus.OUT_OF_STOCK },
      { id: 3, name: 'Mũ lưỡi trai', status: ProductStatus.DISCONTINUED },
    ];
  }
}

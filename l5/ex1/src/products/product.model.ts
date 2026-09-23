import { Field, ID, ObjectType } from '@nestjs/graphql';
import { ProductStatus } from './product-status.enum';

@ObjectType()
export class Product {
  @Field(() => ID)
  id: number;

  @Field()
  name: string;

  @Field(() => ProductStatus)
  status: ProductStatus;
}

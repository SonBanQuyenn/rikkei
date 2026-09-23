import { GraphQLScalarType, Kind, ValueNode } from 'graphql';

function validateEmail(value: unknown): string {
  if (typeof value !== 'string' || !value.includes('@')) {
    throw new Error('EmailScalar: chuỗi truyền vào phải có chữ @');
  }
  return value;
}

export class EmailScalar extends GraphQLScalarType {
  constructor() {
    super({
      name: 'EmailScalar',
      parseValue(value: unknown) {
        return validateEmail(value);
      },
      serialize(value: unknown) {
        return validateEmail(value);
      },
      parseLiteral(ast: ValueNode) {
        if (ast.kind !== Kind.STRING) {
          throw new Error('EmailScalar: chỉ chấp nhận kiểu string');
        }
        return validateEmail(ast.value);
      },
    });
  }
}

export const EmailScalarType = new EmailScalar();

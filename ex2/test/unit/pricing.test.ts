import { calculateTotal } from '../../src/pricing';

describe('calculateTotal', () => {
  it('cong tong tien theo so luong', () => {
    expect(calculateTotal([{ price: 100, quantity: 2 }, { price: 50, quantity: 1 }])).toBe(250);
  });

  it('ap dung giam gia phan tram', () => {
    expect(calculateTotal([{ price: 200, quantity: 1 }], 10)).toBe(180);
  });

  it('tu choi giam gia khong hop le', () => {
    expect(() => calculateTotal([], 120)).toThrow();
  });
});

import { Injectable } from '@nestjs/common';
import { Salary } from './salary.entity';

@Injectable()
export class SalariesService {
  private salaries: Salary[] = [
    { id: 1, ownerId: 1, amount: 15000000 },
    { id: 2, ownerId: 2, amount: 20000000 },
  ];

  findOne(id: number): Salary | undefined {
    return this.salaries.find((s) => s.id === id);
  }

  update(id: number, amount: number): Salary | undefined {
    const salary = this.findOne(id);
    if (salary) {
      salary.amount = amount;
    }
    return salary;
  }
}

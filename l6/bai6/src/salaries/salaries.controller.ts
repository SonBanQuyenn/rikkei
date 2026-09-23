import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { subject } from '@casl/ability';
import { SalariesService } from './salaries.service';
import { CaslAbilityFactory } from '../casl/casl-ability.factory';
import { CurrentUserGuard } from '../casl/current-user.guard';

@UseGuards(CurrentUserGuard)
@Controller('salaries')
export class SalariesController {
  constructor(
    private salariesService: SalariesService,
    private caslAbilityFactory: CaslAbilityFactory,
  ) {}

  @Get(':id')
  findOne(@Req() req, @Param('id') id: string) {
    const salary = this.salariesService.findOne(Number(id));
    if (!salary) {
      throw new NotFoundException();
    }

    const ability = this.caslAbilityFactory.createForUser(req.user);
    if (ability.cannot('read', subject('Salary', salary))) {
      throw new ForbiddenException();
    }

    return salary;
  }

  @Put(':id')
  update(
    @Req() req,
    @Param('id') id: string,
    @Body() body: { amount: number },
  ) {
    const salary = this.salariesService.findOne(Number(id));
    if (!salary) {
      throw new NotFoundException();
    }

    const ability = this.caslAbilityFactory.createForUser(req.user);
    if (ability.cannot('update', subject('Salary', salary))) {
      throw new ForbiddenException();
    }

    return this.salariesService.update(Number(id), body.amount);
  }
}

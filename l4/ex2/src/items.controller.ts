import { Controller, Get, Query } from '@nestjs/common';
import { PaginationDto } from './dto/pagination.dto';

@Controller('items')
export class ItemsController {
  @Get()
  findAll(@Query() pagination: PaginationDto) {
    console.log(pagination);
    console.log(typeof pagination.page, typeof pagination.limit);
    return pagination;
  }
}

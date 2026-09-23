import { Body, Controller, Post } from '@nestjs/common';
import { CreateEventDto } from './dto/create-event.dto';

@Controller('events')
export class EventsController {
  @Post()
  create(@Body() dto: CreateEventDto) {
    return { message: 'Event created', data: dto };
  }
}

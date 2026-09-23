import { Body, Controller, Param, Patch } from '@nestjs/common';
import { UpdatePostWithPrivilegesDto } from './dto/update-post-with-privileges.dto';

@Controller('posts')
export class PostsController {
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePostWithPrivilegesDto) {
    return { id, data: dto };
  }
}

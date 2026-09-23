import { IntersectionType } from '@nestjs/mapped-types';
import { UpdatePostDto } from './update-post.dto';
import { AdditionalPrivilegesDto } from './additional-privileges.dto';

export class UpdatePostWithPrivilegesDto extends IntersectionType(
  UpdatePostDto,
  AdditionalPrivilegesDto,
) {}

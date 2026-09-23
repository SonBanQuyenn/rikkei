import { IsBoolean, IsNotEmpty } from 'class-validator';

export class AdditionalPrivilegesDto {
  @IsNotEmpty()
  @IsBoolean()
  isPinned: boolean;

  @IsNotEmpty()
  @IsBoolean()
  isAdminOnly: boolean;
}

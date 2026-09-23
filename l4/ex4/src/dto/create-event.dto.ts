import { IsNotEmpty, IsString } from 'class-validator';
import { IsAfterDate } from '../validators/is-after-date.validator';

export class CreateEventDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  startDate: string;

  @IsNotEmpty()
  @IsAfterDate('startDate')
  endDate: string;
}

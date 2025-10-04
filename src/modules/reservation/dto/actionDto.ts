import { IsString, IsOptional } from 'class-validator';

export class ActionTypeReservationDto {
  @IsString()
  @IsOptional()
  reason: string;
}

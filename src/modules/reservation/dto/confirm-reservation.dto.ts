import { IsString, IsNotEmpty } from 'class-validator';

export class ConfirmReservationDto {
  @IsString()
  @IsNotEmpty()
  confirmationCode: string;
}

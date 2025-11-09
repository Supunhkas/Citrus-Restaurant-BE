import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

export class CreateReservationDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  contactNumber?: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsOptional()
  tableNumber?: number;

  @IsNotEmpty()
  reservationDate: string;

  @IsNotEmpty()
  reservationTime: string;

  @IsNumber()
  @Min(1)
  @Max(15)
  guests: number;

  @IsOptional()
  specialRequests?: string;

  @IsNotEmpty()
  confirmationMethod: string;
}

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsNumber,
  IsDateString,
  Min,
  Max,
  Matches,
} from 'class-validator';

export class CreateReservationDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Invalid phone number format' })
  contactNumber: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsNumber()
  @Min(1)
  tableNumber: number;

  @IsDateString()
  reservationDate: string;

  @IsNumber()
  @Min(1)
  @Max(15)
  numberOfGuests: number;
}

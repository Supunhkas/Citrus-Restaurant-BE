import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsNumber,
  IsEnum,
  IsIn,
  Matches,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ReservationType } from '../../../schema/reservation/reservation.schema';

export class CreateReservationDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  contactNumber?: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  // The frontend's reservation form always submits this field via
  // FormData, even when the user never filled it in — an empty string, not
  // absent. The global ValidationPipe's enableImplicitConversion runs
  // BEFORE this @Transform sees the value (verified empirically — a
  // '' === '' check here never matched), coercing '' to 0 first. A real
  // table number is never 0, so treat 0 the same as '' / null / undefined:
  // not provided. Without this, @IsOptional() never skips @Min(1) and
  // every reservation without a table number gets rejected.
  @Transform(({ value }) =>
    value === '' || value === null || value === undefined || value === 0
      ? undefined
      : value,
  )
  @IsOptional()
  @IsNumber()
  @Min(1)
  tableNumber?: number;

  // YYYY-MM-DD — the service parses this with `new Date(...)`, so anything
  // else either produces an Invalid Date that silently bypasses the
  // past-date check, or an uncaught Mongoose CastError on save.
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'reservationDate must be in YYYY-MM-DD format',
  })
  reservationDate: string;

  // 24-hour HH:mm — dashboard.service.ts sorts reservations by this field as
  // a plain string, which only sorts correctly if it's zero-padded 24-hour.
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'reservationTime must be in 24-hour HH:mm format',
  })
  reservationTime: string;

  @IsNumber()
  @Min(1)
  @Max(15)
  guests: number;

  @IsOptional()
  @IsString()
  specialRequests?: string;

  @IsNotEmpty()
  @IsIn(['email', 'sms'])
  confirmationMethod: string;

  @IsOptional()
  @IsEnum(ReservationType)
  type?: ReservationType;
}

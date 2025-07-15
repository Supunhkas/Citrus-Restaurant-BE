import {
  IsOptional,
  IsString,
  IsNotEmpty,
  IsEmail,
  ValidateIf,
  Matches,
} from 'class-validator';

export class ResendConfirmationDto {
  // Contact phone number (optional, E.164 format)
  @ValidateIf((o) => !o.email)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Invalid phone number format' })
  contactNumber?: string;

  // Email (optional)
  @ValidateIf((o) => !o.contactNumber)
  @IsOptional()
  @IsEmail()
  email?: string;
}

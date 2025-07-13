import { Exclude, Expose } from 'class-transformer';

export class AuthResponseDto {
  @Expose()
  id: string;

  @Expose()
  email: string;

  @Expose()
  firstName: string;

  @Expose()
  lastName: string;

  @Expose()
  role: string;

  @Expose()
  isEmailVerified: boolean;

  @Expose()
  accessToken: string;

  @Expose()
  refreshToken: string;

  @Exclude()
  password: string;

  constructor(partial: Partial<AuthResponseDto>) {
    Object.assign(this, partial);
  }
}

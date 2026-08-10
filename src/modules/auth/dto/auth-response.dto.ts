// No ClassSerializerInterceptor is registered anywhere in this app, so Nest
// serializes the object Nest controllers return via a plain JSON.stringify,
// not class-transformer's classToPlain — @Exclude()/@Expose() here had no
// effect. There also was an @Exclude()'d `password` field that was never
// populated by any caller; removed rather than kept as a decorator that
// looked like protection but wasn't.
export class AuthResponseDto {
  id: string;
  email: string;
  name: string;
  role: string;
  isEmailVerified: boolean;
  accessToken: string;
  refreshToken: string;
  message: string;

  constructor(partial: Partial<AuthResponseDto>) {
    Object.assign(this, partial);
  }
}

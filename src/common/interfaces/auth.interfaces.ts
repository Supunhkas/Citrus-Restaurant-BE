export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  type?: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  name: string;
}

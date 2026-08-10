import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// For routes that must stay accessible to anonymous callers but should still
// capture req.user when a valid Bearer token happens to be present (e.g.
// guest checkout that can optionally be tied to a logged-in account). Unlike
// JwtAuthGuard, an absent or invalid token never blocks the request — it
// just means req.user stays null.
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any) {
    return user || null;
  }
}

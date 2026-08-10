import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import {
  JwtPayload,
  AuthenticatedUser,
} from 'src/common/interfaces/auth.interfaces';
import { UserDocument } from 'src/schema/user/user.schema';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = (await this.usersService.findById(
      payload.sub,
    )) as UserDocument;

    if (!user) {
      throw new UnauthorizedException('User not found or inactive');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    return {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      name: user.name,
    };
  }
}

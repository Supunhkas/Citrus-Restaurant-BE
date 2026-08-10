import { Controller, Get } from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { AuthenticatedUser } from 'src/common/interfaces/auth.interfaces';

@Controller('users')
export class UsersController {
  constructor(private readonly userService: UsersService) {}

  @Get('details')
  async getUserDetails(@CurrentUser() user: AuthenticatedUser) {
    const found = await this.userService.findById(user.id);
    const {
      password,
      refreshTokenHash,
      passwordResetToken,
      passwordResetExpires,
      emailVerificationToken,
      ...safe
    } = found.toObject();
    return safe;
  }
}

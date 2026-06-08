import { Controller, Get } from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { AuthenticatedUser } from 'src/common/interfaces/auth.interfaces';

@Controller('users')
export class UsersController {
  constructor(private readonly userService: UsersService) {}

  @Get('details')
  async getUserDetails(@CurrentUser() user: AuthenticatedUser) {
    return await this.userService.findById(user.id);
  }
}

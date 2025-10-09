import { Controller, Get } from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly userService: UsersService) {}

  @Get('details')
  async getUserDetails(@CurrentUser() user: any) {
    console.log('User', user.id);
    return await this.userService.findById(user.id);
  }
}

import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('send')
  async sendNotification(
    @Body() body: { token: string; title: string; message: string },
  ) {
    const { token, title, message } = body;
    return this.notificationsService.sendPushNotification(
      token,
      title,
      message,
    );
  }
}

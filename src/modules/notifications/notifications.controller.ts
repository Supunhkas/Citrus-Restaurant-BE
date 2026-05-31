import { Body, Controller, Post } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { Public } from '../../common/decorators/public.decorator';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Public()
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

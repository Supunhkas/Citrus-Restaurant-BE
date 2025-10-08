// import { Injectable, Logger } from '@nestjs/common';
// import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

// @Injectable()
// export class NotificationsService {
//   private readonly expo = new Expo();
//   private readonly logger = new Logger(NotificationsService.name);

//   async sendPushNotification(
//     pushToken: string,
//     title: string,
//     body: string,
//     data?: any,
//   ) {
//     // Validate token
//     if (!Expo.isExpoPushToken(pushToken)) {
//       this.logger.warn(`Invalid Expo push token: ${pushToken}`);
//       return;
//     }

//     const messages: ExpoPushMessage[] = [
//       {
//         to: pushToken,
//         sound: 'default',
//         title,
//         body,
//         data,
//       },
//     ];

//     const chunks = this.expo.chunkPushNotifications(messages);
//     const tickets: ExpoPushTicket[] = [];

//     for (const chunk of chunks) {
//       try {
//         const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
//         tickets.push(...ticketChunk);
//         this.logger.log(`Push sent: ${JSON.stringify(ticketChunk)}`);
//       } catch (error) {
//         this.logger.error('Error sending push notification', error);
//       }
//     }

//     return tickets;
//   }
// }

import { Injectable, Logger } from '@nestjs/common';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';

@Injectable()
export class NotificationsService {
  private readonly expo = new Expo();
  private readonly logger = new Logger(NotificationsService.name);

  async sendPushNotification(
    pushToken: string,
    title: string,
    body: string,
    data?: Record<string, any>,
  ) {
    if (!Expo.isExpoPushToken(pushToken)) {
      this.logger.warn(`Invalid Expo push token: ${pushToken}`);
      return;
    }

    const message: ExpoPushMessage = {
      to: pushToken,
      sound: 'default',
      title,
      body,
      data,
    };

    try {
      const ticket = await this.expo.sendPushNotificationsAsync([message]);
      this.logger.log(`Expo Push Sent: ${JSON.stringify(ticket)}`);
      return ticket;
    } catch (error) {
      this.logger.error('Expo push send error:', error);
    }
  }

  async sendMulticast(
    pushTokens: string[],
    title: string,
    body: string,
    data?: Record<string, any>,
  ) {
    const validTokens = pushTokens.filter((t) => Expo.isExpoPushToken(t));
    if (validTokens.length === 0) {
      this.logger.warn('No valid Expo push tokens found');
      return;
    }

    const messages: ExpoPushMessage[] = validTokens.map((token) => ({
      to: token,
      sound: 'default',
      title,
      body,
      data,
    }));

    const chunks = this.expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      try {
        const tickets = await this.expo.sendPushNotificationsAsync(chunk);
        this.logger.log(`Expo push tickets: ${JSON.stringify(tickets)}`);
      } catch (err) {
        this.logger.error('Error sending chunk of Expo notifications', err);
      }
    }
  }
}

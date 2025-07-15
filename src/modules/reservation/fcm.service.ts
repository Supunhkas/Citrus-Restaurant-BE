import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FCMService {
  private readonly logger = new Logger(FCMService.name);
  private initialized = false;

  constructor(private configService: ConfigService) {
    this.initFirebase();
  }

  private initFirebase() {
    if (!this.initialized && !admin.apps.length) {
      const firebaseConfig = this.configService.get('firebase');
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: firebaseConfig.projectId,
          clientEmail: firebaseConfig.clientEmail,
          privateKey: firebaseConfig.privateKey,
        }),
      });
      this.initialized = true;
      this.logger.log('Firebase Admin initialized for FCM');
    }
  }

  async sendNotification(
    deviceToken: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ) {
    try {
      const message = {
        token: deviceToken,
        notification: { title, body },
        data: data || {},
      };
      const response = await admin.messaging().send(message);
      this.logger.log(`FCM notification sent: ${response}`);
      return response;
    } catch (error) {
      this.logger.error('Failed to send FCM notification', error);
      throw error;
    }
  }
}

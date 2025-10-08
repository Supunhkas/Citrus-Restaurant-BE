import { Injectable, OnModuleInit } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private initialized = false;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.initFirebase();
  }

  private initFirebase() {
    if (!this.initialized && !admin.apps.length) {
      const firebaseConfig = this.configService.get('firebase');

      if (
        !firebaseConfig?.projectId ||
        !firebaseConfig?.clientEmail ||
        !firebaseConfig?.privateKey
      ) {
        console.error('Firebase configuration is incomplete');
        throw new Error('Firebase configuration missing required fields');
      }

      try {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: firebaseConfig.projectId,
            clientEmail: firebaseConfig.clientEmail,
            // Handle both escaped and unescaped newlines
            privateKey: firebaseConfig.privateKey.replace(/\\n/g, '\n'),
          }),
        });
        this.initialized = true;
      } catch (error) {
        console.error('Failed to initialize Firebase Admin', error);
        throw error;
      }
    }
  }

  /**
   * Send FCM notification optimized for Expo apps
   */
  async sendNotification(
    deviceToken: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<string | null> {
    try {
      // Expo requires specific FCM message format
      const message: admin.messaging.Message = {
        token: deviceToken,
        notification: {
          title,
          body,
        },
        // Data payload - all values must be strings
        data: {
          ...data,
          title, // Include in data for Expo
          body, // Include in data for Expo
        },
        // Android-specific options
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'default',
          },
        },
        // iOS-specific options
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().send(message);

      return response;
    } catch (error) {
      // Handle specific FCM errors
      if (
        error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered'
      ) {
        console.warn(`Invalid or expired device token: ${deviceToken}`);
        // You should remove this token from your database
        return null;
      }

      console.error(
        `Failed to send FCM notification: ${error.message}`,
        error.stack,
      );
      // Don't throw - let the app continue even if notification fails
      return null;
    }
  }

  /**
   * Send notification to multiple devices
   */
  async sendMulticast(
    deviceTokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ) {
    if (!deviceTokens || deviceTokens.length === 0) {
      console.warn('No device tokens provided for multicast');
      return { successCount: 0, failureCount: 0 };
    }

    try {
      const message: admin.messaging.MulticastMessage = {
        tokens: deviceTokens,
        notification: { title, body },
        data: {
          ...data,
          title,
          body,
        },
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().sendEachForMulticast(message);

      // Log failed tokens for debugging
      if (response.failureCount > 0) {
        const failedTokens = response.responses
          .map((resp, idx) => (!resp.success ? deviceTokens[idx] : null))
          .filter(Boolean);
        console.warn(`Failed tokens: ${failedTokens.join(', ')}`);
      }

      return response;
    } catch (error) {
      console.error('Failed to send multicast notification', error);
      return { successCount: 0, failureCount: deviceTokens.length };
    }
  }
}

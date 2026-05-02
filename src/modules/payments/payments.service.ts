import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class PaymentsService {
  private stripe: InstanceType<typeof Stripe>;
  private readonly logger = new Logger(PaymentsService.name);

  constructor(private configService: ConfigService) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');

    if (secretKey) {
      this.stripe = new Stripe(secretKey, {
        apiVersion: '2024-06-20' as any,
      });
    } else {
      this.logger.warn(
        'STRIPE_SECRET_KEY is not defined. Payments will not work.',
      );
    }
  }

  async createCheckoutSession(
    reservationId: string,
    amount: number,
    customerEmail: string,
  ) {
    const appUrl = this.configService.get<string>('APP_URL');

    if (!this.stripe) {
      throw new Error(
        'Stripe is not initialized. Please provide a STRIPE_SECRET_KEY.',
      );
    }

    try {
      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'aud',
              product_data: {
                name: 'Restaurant Reservation Deposit',
                description: `Deposit for reservation ID: ${reservationId}`,
              },
              unit_amount: amount * 100,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${appUrl}/reservation/payment-success?session_id={CHECKOUT_SESSION_ID}&reservation_id=${reservationId}`,
        cancel_url: `${appUrl}/reservation/payment-cancelled?reservation_id=${reservationId}`,
        customer_email: customerEmail,
        metadata: {
          reservationId,
        },
      });

      return session;
    } catch (error) {
      this.logger.error('Error creating Stripe session:', error);
      throw error;
    }
  }

  async constructEventFromPayload(signature: string, payload: Buffer) {
    if (!this.stripe) {
      throw new Error(
        'Stripe is not initialized. Please provide a STRIPE_WEBHOOK_SECRET.',
      );
    }
    const webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );

    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is missing');
    }

    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret,
    );
  }
}

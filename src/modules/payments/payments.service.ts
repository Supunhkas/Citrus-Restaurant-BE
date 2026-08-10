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
      // The installed `stripe` SDK's types only accept its latest known API
      // version ('2026-04-22.dahlia') as a literal here — but the API
      // version actually configured on the Stripe account/dashboard may
      // still be '2024-06-20', and changing it changes response/webhook
      // payload shapes (this is a real Stripe account setting, not just a
      // type mismatch). Pinning to whatever the SDK types happen to accept,
      // without reviewing the Stripe API changelog between the two
      // versions, risks silently breaking session/webhook field shapes
      // this codebase already depends on. Left as `as any` deliberately —
      // upgrade only after a real changelog review.
      this.stripe = new Stripe(secretKey, {
        apiVersion: '2024-06-20' as any,
      });
    } else {
      this.logger.warn(
        'STRIPE_SECRET_KEY is not defined. Payments will not work.',
      );
    }
  }

  get isInitialized(): boolean {
    return !!this.stripe;
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
              unit_amount: Math.round(amount * 100),
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

  async createPickupOrderCheckoutSession(
    orderId: string,
    amount: number,
    customerEmail?: string,
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
                name: 'Pickup Order Payment',
                description: `Payment for order ID: ${orderId}`,
              },
              unit_amount: Math.round(amount * 100),
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${appUrl}/order/payment-success?session_id={CHECKOUT_SESSION_ID}&order_id=${orderId}`,
        cancel_url: `${appUrl}/order/payment-cancelled?order_id=${orderId}`,
        ...(customerEmail ? { customer_email: customerEmail } : {}),
        metadata: { orderId },
        // Checkout sessions don't propagate metadata onto their PaymentIntent
        // automatically — without this, a payment_intent.payment_failed
        // webhook has no orderId to act on.
        payment_intent_data: { metadata: { orderId } },
      });

      return session;
    } catch (error) {
      this.logger.error(
        'Error creating Stripe session for pickup order:',
        error,
      );
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

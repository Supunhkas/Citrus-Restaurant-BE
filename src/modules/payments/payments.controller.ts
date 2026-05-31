import {
  Controller,
  Post,
  Headers,
  Req,
  Res,
  HttpStatus,
  RawBodyRequest,
  Logger,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { Request, Response } from 'express';
import { EventBusService } from 'src/common/utils/event-bus.service';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly eventBusService: EventBusService,
  ) {}

  @Public()
  @Post('webhook')
  async handleWebhook(
    @Headers('stripe-signature') sig: string,
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
  ) {
    let event;

    try {
      event = await this.paymentsService.constructEventFromPayload(
        sig,
        req.rawBody,
      );
    } catch (err) {
      this.logger.error(`Webhook Error: ${err.message}`);
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const { reservationId, orderId } = session.metadata ?? {};

      if (orderId) {
        this.logger.log(`Stripe payment completed for pickup order: ${orderId}`);
        this.eventBusService.emit('order.payment.success', {
          orderId,
          stripeSessionId: session.id,
        });
      } else if (reservationId) {
        this.logger.log(`Stripe payment completed for reservation: ${reservationId}`);
        this.eventBusService.emit('payment.success', {
          reservationId,
          stripeSessionId: session.id,
        });
      } else {
        this.logger.warn('Stripe webhook: no orderId or reservationId in metadata');
      }
    }

    res.status(HttpStatus.OK).json({ received: true });
  }
}

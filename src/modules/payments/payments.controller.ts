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
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Reservation,
  ReservationDocument,
  PaymentStatus,
  ReservationStatus,
} from '../../schema/reservation/reservation.schema';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);
  constructor(
    private readonly paymentsService: PaymentsService,
    @InjectModel(Reservation.name)
    private readonly reservationModel: Model<ReservationDocument>,
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
      const reservationId = session.metadata.reservationId;

      await this.reservationModel.findOneAndUpdate(
        { _id: reservationId },
        {
          paymentStatus: PaymentStatus.COMPLETED,
          status: ReservationStatus.PENDING, // Now it can move to pending status
          stripeSessionId: session.id,
        },
      );
    }

    res.status(HttpStatus.OK).json({ received: true });
  }
}

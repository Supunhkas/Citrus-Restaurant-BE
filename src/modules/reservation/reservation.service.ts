import { randomBytes } from 'crypto';
import {
  Injectable,
  ConflictException,
  BadRequestException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Reservation,
  ReservationDocument,
  ReservationStatus,
  ReservationType,
} from '../../schema/reservation/reservation.schema';
import { EmailService } from '../email/email.service';
import { UsersService } from '../users/users.service';
import { ActionTypeReservationDto } from './dto/actionDto';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { Counter, CounterDocument } from 'src/schema/counter/counter.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PaymentsService } from '../payments/payments.service';
import { PaymentStatus } from '../../schema/reservation/reservation.schema';
import { reservationEmailTemplates } from './reservation-email.template';
import { EventBusService } from 'src/common/utils/event-bus.service';

@Injectable()
export class ReservationService implements OnModuleInit {
  private readonly logger = new Logger(ReservationService.name);
  constructor(
    @InjectModel(Reservation.name)
    private readonly reservationModel: Model<ReservationDocument>,
    @InjectModel(Counter.name)
    private readonly counterModel: Model<CounterDocument>,

    private readonly emailService: EmailService,

    private readonly usersService: UsersService,
    private readonly expoService: NotificationsService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly paymentsService: PaymentsService,
    private readonly configService: ConfigService,
    private readonly eventBusService: EventBusService,
  ) {}

  onModuleInit() {
    this.eventBusService.on('payment.success', async (data) => {
      await this.withRetry(
        () => this.handlePaymentSuccess(data.reservationId, data.stripeSessionId, data.amountTotal ?? 0),
        `payment.success for reservation ${data.reservationId}`,
      );
    });
  }

  private async withRetry(fn: () => Promise<any>, label: string, attempts = 3): Promise<void> {
    for (let i = 1; i <= attempts; i++) {
      try {
        await fn();
        return;
      } catch (err) {
        this.logger.error(`Attempt ${i}/${attempts} failed for [${label}]: ${err.message}`);
        if (i < attempts) await new Promise((r) => setTimeout(r, 500 * i));
      }
    }
    this.logger.error(`All ${attempts} attempts failed for [${label}] — manual intervention required`);
  }

  private generateConfirmationCode(): string {
    return randomBytes(5).toString('hex').toUpperCase();
  }

  private getAppName(): string {
    return this.configService.get<string>('app.name') || 'Citrus Restaurant';
  }

  // Helper: Send Expo push notification to all admins
  private async notifyAdminsExpo(
    title: string,
    body: string,
    data?: Record<string, string>,
  ) {
    try {
      const tokens = await this.usersService.findAdminDeviceTokens();

      if (!tokens || tokens.length === 0) {
        this.logger.warn('No admin Expo push tokens found');
        return;
      }

      await this.expoService.sendMulticast(tokens, title, body, data);
    } catch (error) {
      this.logger.error('Error notifying admins via Expo', error);
    }
  }

  private async getNextSequence(name: string): Promise<number> {
    const updated = await this.counterModel.findOneAndUpdate(
      { name },
      { $inc: { seq: 1 } },
      { new: true, upsert: true },
    );
    return updated.seq;
  }

  //! Create a new reservation
  async createReservation(dto: CreateReservationDto): Promise<Reservation> {
    const reservationDate = new Date(dto.reservationDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Start of today

    // 1. Prevent past dates
    if (reservationDate < now) {
      throw new BadRequestException(
        'Cannot book a reservation for a past date',
      );
    }

    // 2. Limit guests per reservation to 15
    if (dto.guests > 15) {
      throw new BadRequestException('Maximum guests per reservation is 15');
    }

    // 3. Prevent duplicate active reservations for same email/date/time
    const existing = await this.reservationModel.findOne({
      email: dto.email,
      reservationDate: dto.reservationDate,
      reservationTime: dto.reservationTime,
      status: { $ne: ReservationStatus.REJECTED },
    });

    if (existing) {
      throw new ConflictException(
        'You already have an active reservation for this time slot',
      );
    }

    // 4. Capacity Check (Max 40 guests per time slot)
    const MAX_CAPACITY = 40;
    const currentBookings = await this.reservationModel.aggregate([
      {
        $match: {
          reservationDate: dto.reservationDate,
          reservationTime: dto.reservationTime,
          status: {
            $in: [
              ReservationStatus.PENDING,
              ReservationStatus.CONFIRMED,
              ReservationStatus.APPROVED,
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          totalGuests: { $sum: '$guests' },
        },
      },
    ]);

    const totalGuests =
      currentBookings.length > 0 ? currentBookings[0].totalGuests : 0;
    if (totalGuests + dto.guests > MAX_CAPACITY) {
      throw new ConflictException(
        'Sorry, we are fully booked for this time slot. Please try another time.',
      );
    }

    const confirmationCode = this.generateConfirmationCode();
    const seq = await this.getNextSequence('reservationId');
    const reservationId = `RES-${seq.toString().padStart(6, '0')}`;
    const reservationType = dto.type ?? ReservationType.STANDARD;

    // Compute buffet pricing when applicable
    const BUFFET_PRICE_PER_HEAD = Number(
      this.configService.get<number>('reservation.buffetPricePerHead') ?? 35,
    );
    const pricePerPerson = reservationType === ReservationType.BUFFET ? BUFFET_PRICE_PER_HEAD : undefined;
    const buffetTotal = pricePerPerson !== undefined ? dto.guests * pricePerPerson : undefined;

    const reservation = new this.reservationModel({
      ...dto,
      reservationId,
      type: reservationType,
      pricePerPerson,
      buffetTotal,
      status: ReservationStatus.PENDING,
      notes: '',
      confirmationCode,
    });
    await reservation.save();

    // Buffet → always requires full pre-payment; standard → deposit for 5+ guests
    const DEPOSIT_AUD = 30;
    const requiresPayment =
      reservationType === ReservationType.BUFFET || reservation.guests > 4;
    const paymentAmount =
      reservationType === ReservationType.BUFFET ? (buffetTotal ?? DEPOSIT_AUD) : DEPOSIT_AUD;

    if (requiresPayment) {
      const session = await this.paymentsService.createCheckoutSession(
        reservation._id.toString(),
        paymentAmount,
        reservation.email,
      );

      reservation.paymentStatus = PaymentStatus.PENDING;
      reservation.status = ReservationStatus.PAYMENT_PENDING;
      reservation.stripeSessionId = session.id;
      reservation.paymentAmount = paymentAmount;
      await reservation.save();

      return {
        ...reservation.toObject(),
        paymentRequired: true,
        stripeSessionUrl: session.url,
      } as any;
    }

    if (reservation.email) {
      try {
        const template = reservationEmailTemplates.confirmationCode(
          reservation.name,
          reservation.confirmationCode,
          this.getAppName(),
        );
        await this.emailService.sendEmail({
          to: reservation.email,
          subject: template.subject,
          html: template.html,
        });
      } catch (emailError) {
        this.logger.warn(`Failed to send confirmation code email to ${reservation.email}: ${emailError.message}`);
      }
    }

    await this.notifyAdminsExpo(
      'New Reservation',
      `Reservation on ${new Date(reservation.reservationDate).toLocaleDateString()} ${reservation.reservationTime}`,
      {
        screen: 'reservation',
        _id: reservation._id.toString(),
      },
    );

    // Real-time WebSocket notification
    this.notificationsGateway.notifyNewReservation(reservation);

    return reservation;
  }

  //! Confirm a reservation
  async confirmReservation(confirmationCode: string): Promise<Reservation> {
    // Find by code regardless of status so we can give accurate error messages
    const reservation = await this.reservationModel.findOne({ confirmationCode });

    if (!reservation) {
      throw new ConflictException('Invalid confirmation code');
    }

    // Block confirmation while deposit payment is outstanding (check first, before status gate)
    if (reservation.status === ReservationStatus.PAYMENT_PENDING) {
      throw new ConflictException('Deposit payment required before confirming reservation');
    }

    if (reservation.status !== ReservationStatus.PENDING) {
      throw new ConflictException('Reservation is not pending');
    }

    // Extra safety: guests > 4 must have completed payment
    if (reservation.guests > 4 && reservation.paymentStatus !== PaymentStatus.COMPLETED) {
      throw new ConflictException('Deposit payment required before confirming reservation');
    }

    // Time restriction: confirmation must be within 1 hour of creation
    const createdAt = reservation.get('createdAt');
    if (createdAt) {
      const createdTime = new Date(createdAt).getTime();
      const now = Date.now();
      const oneHour = 60 * 60 * 1000;
      if (now - createdTime > oneHour) {
        throw new ConflictException(
          'Confirmation code expired. Please create a new reservation.',
        );
      }
    }

    reservation.status = ReservationStatus.CONFIRMED;

    await reservation.save();

    // Send confirmation email to user with reservation details
    if (reservation.email) {
      try {
        const template = reservationEmailTemplates.confirmed(
          reservation.name,
          reservation.reservationDate
            ? new Date(reservation.reservationDate).toLocaleDateString()
            : 'N/A',
          reservation.reservationTime || 'N/A',
          this.getAppName(),
        );
        await this.emailService.sendEmail({
          to: reservation.email,
          subject: template.subject,
          html: template.html,
        });
      } catch (emailError) {
        this.logger.warn(`Failed to send confirmed email to ${reservation.email}: ${emailError.message}`);
      }
    }

    // Notify all admins
    await this.notifyAdminsExpo(
      'Reservation Confirmed',
      `${reservation.name} on ${reservation.reservationDate ? new Date(reservation.reservationDate).toLocaleDateString() : ''} has been confirmed.`,
      { screen: 'reservation', _id: reservation._id.toString() },
    );

    // Real-time WebSocket notification
    this.notificationsGateway.notifyReservationConfirmed(reservation);

    return reservation;
  }

  //! Get all reservations (paginated)
  async getReservations(
    userId?: Types.ObjectId,
    status?: ReservationStatus,
    startDate?: string,
    endDate?: string,
    search?: string,
    page = 1,
    limit = 50,
  ): Promise<{ data: Reservation[]; total: number; pages: number; page: number }> {
    const filter: any = {};
    if (userId) filter.userId = userId;
    if (status) filter.status = status;
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setUTCHours(23, 59, 59, 999);
      filter.reservationDate = { $gte: start, $lte: end };
    } else if (startDate) {
      filter.reservationDate = { $gte: new Date(startDate) };
    } else if (endDate) {
      const end = new Date(endDate);
      end.setUTCHours(23, 59, 59, 999);
      filter.reservationDate = { $lte: end };
    }

    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escapedSearch, $options: 'i' } },
        { email: { $regex: escapedSearch, $options: 'i' } },
        { reservationId: { $regex: escapedSearch, $options: 'i' } },
      ];
    }

    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const skip = (safePage - 1) * safeLimit;

    const [data, total] = await Promise.all([
      this.reservationModel.find(filter).sort({ reservationDate: -1 }).skip(skip).limit(safeLimit).exec(),
      this.reservationModel.countDocuments(filter),
    ]);

    return { data, total, pages: Math.ceil(total / safeLimit), page: safePage };
  }

  //! Approve a reservation
  async approveReservation(reservationId: string): Promise<Reservation> {
    const reservation = await this.reservationModel.findById(reservationId);
    if (!reservation) {
      throw new ConflictException('Reservation not found');
    }
    if (reservation.status !== ReservationStatus.CONFIRMED) {
      throw new ConflictException(
        'Only confirmed reservations can be approved',
      );
    }
    reservation.status = ReservationStatus.APPROVED;

    await reservation.save();

    await this.notifyAdminsExpo(
      'Reservation Approved',
      `${reservation.name} on ${reservation.reservationDate ? new Date(reservation.reservationDate).toLocaleDateString() : ''} has been approved.`,
      { screen: 'reservation', _id: reservation._id.toString() },
    );

    if (reservation.email) {
      const template = reservationEmailTemplates.update(
        reservation.name,
        'APPROVED',
        reservation.reservationDate.toLocaleDateString(),
        this.getAppName(),
      );
      await this.emailService.sendEmail({
        to: reservation.email,
        subject: template.subject,
        html: template.html,
      });
    }

    return reservation;
  }

  //! Reject a reservation
  async rejectReservation(
    reservationId: string,
    dto: ActionTypeReservationDto,
  ): Promise<Reservation> {
    const reservation = await this.reservationModel.findById(reservationId);
    if (!reservation) {
      throw new ConflictException('Reservation not found');
    }

    if (reservation.status !== ReservationStatus.CONFIRMED) {
      throw new ConflictException(
        'Only confirmed reservations can be rejected',
      );
    }

    reservation.status = ReservationStatus.REJECTED;
    reservation.notes = dto.reason;

    await reservation.save();

    // Notify all admins
    await this.notifyAdminsExpo(
      'Reservation Rejected',
      `Customer ${reservation.name} Reservation on ${reservation.reservationDate ? new Date(reservation.reservationDate).toLocaleDateString() : ''} has been rejected.`,
      { screen: 'reservation', _id: reservation._id.toString() },
    );
    // Send email to guest (if email exists)
    if (reservation.email) {
      const template = reservationEmailTemplates.update(
        reservation.name,
        'REJECTED',
        reservation.reservationDate.toLocaleDateString(),
        this.getAppName(),
        dto.reason,
      );
      await this.emailService.sendEmail({
        to: reservation.email,
        subject: template.subject,
        html: template.html,
      });
    }

    return reservation;
  }

  //! Resend confirmation
  async resendConfirmation(contact: string): Promise<void> {
    const reservation = await this.reservationModel.findOne({
      $or: [{ contactNumber: contact }, { email: contact }],
      status: ReservationStatus.PENDING,
    });
    if (!reservation) {
      throw new ConflictException(
        'No pending reservation found for this contact',
      );
    }

    if (reservation.email) {
      const template = reservationEmailTemplates.confirmationCode(
        reservation.name,
        reservation.confirmationCode,
        this.getAppName(),
      );
      await this.emailService.sendEmail({
        to: reservation.email,
        subject: template.subject,
        html: template.html,
      });
    }
    // TODO: Integrate SMS sending if required
  }

  async handlePaymentSuccess(
    reservationId: string,
    stripeSessionId: string,
    amountTotal: number,
  ): Promise<Reservation> {
    const reservation = await this.reservationModel.findById(reservationId);

    if (!reservation) {
      throw new Error(`Reservation ${reservationId} not found`);
    }

    // Idempotency: skip if already processed
    if (reservation.paymentStatus === PaymentStatus.COMPLETED) {
      this.logger.warn(`Duplicate webhook for reservation ${reservationId} (session ${stripeSessionId}) — already processed`);
      return reservation;
    }

    // Amount verification: Stripe uses cents
    const expectedCents = Math.round(reservation.paymentAmount * 100);
    if (amountTotal !== expectedCents) {
      this.logger.error(
        `Payment amount mismatch for reservation ${reservationId}: expected ${expectedCents} cents, got ${amountTotal} cents`,
      );
      throw new Error(`Payment amount mismatch for reservation ${reservationId}`);
    }

    reservation.paymentStatus = PaymentStatus.COMPLETED;
    reservation.status = ReservationStatus.PENDING;
    reservation.stripeSessionId = stripeSessionId;
    await reservation.save();

    this.logger.log(`Reservation ${reservationId} marked as paid. Status is now PENDING.`);

    // 1. Send confirmation email to user with confirmation code
    if (reservation.email) {
      const template = reservationEmailTemplates.confirmationCode(
        reservation.name,
        reservation.confirmationCode,
        this.getAppName(),
      );
      await this.emailService.sendEmail({
        to: reservation.email,
        subject: template.subject,
        html: template.html,
      });
    }

    // 2. Notify all admins via Expo push notification
    await this.notifyAdminsExpo(
      'New Reservation (Deposit Paid)',
      `Reservation on ${new Date(reservation.reservationDate).toLocaleDateString()} ${reservation.reservationTime} by ${reservation.name}`,
      {
        screen: 'reservation',
        _id: reservation._id.toString(),
      },
    );

    // 3. Real-time WebSocket notification for admin dashboard
    this.notificationsGateway.notifyNewReservation(reservation);

    return reservation;
  }
}

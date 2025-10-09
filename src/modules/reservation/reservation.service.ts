import { Injectable, ConflictException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Reservation,
  ReservationDocument,
  ReservationStatus,
} from '../../schema/reservation/reservation.schema';
import { EmailService } from '../email/email.service';
import { ReservationGateway } from './reservation.gateway';
import { UsersService } from '../users/users.service';
import { ActionTypeReservationDto } from './dto/actionDto';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { Counter, CounterDocument } from 'src/schema/counter/counter.schema';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ReservationService {
  private readonly logger = new Logger(ReservationService.name);
  constructor(
    @InjectModel(Reservation.name)
    private readonly reservationModel: Model<ReservationDocument>,
    @InjectModel(Counter.name)
    private readonly counterModel: Model<CounterDocument>,

    private readonly emailService: EmailService,
    private readonly reservationGateway: ReservationGateway,
    private readonly usersService: UsersService,
    private readonly expoService: NotificationsService,
  ) {}

  private generateConfirmationCode(): string {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  }

  // Helper: Send Expo push notification to all admins
  private async notifyAdminsExpo(
    title: string,
    body: string,
    data?: Record<string, string>,
  ) {
    try {
      const admins = await this.usersService['userModel']
        .find({
          role: 'admin',
          deviceToken: { $exists: true, $ne: null },
        })
        .select('deviceToken')
        .lean();

      if (!admins || admins.length === 0) {
        this.logger.warn('No admin Expo push tokens found');
        return;
      }

      const tokens = admins.map((a) => a.deviceToken).filter(Boolean);
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
    const confirmationCode = this.generateConfirmationCode();

    // Generate reservationId
    const seq = await this.getNextSequence('reservationId');
    const reservationId = `RES-${seq.toString().padStart(6, '0')}`;

    const reservation = new this.reservationModel({
      ...dto,
      reservationId,
      status: ReservationStatus.PENDING,
      notes: '',
      confirmationCode,
    });
    await reservation.save();
    if (reservation.email) {
      await this.emailService.sendEmail({
        to: reservation.email,
        subject: 'Your Reservation Confirmation Code',
        html: `<p>Your confirmation code is: <b>${confirmationCode}</b></p>`,
      });
    }

    await this.notifyAdminsExpo(
      'New Reservation',
      `Reservation on ${new Date(reservation.reservationDate).toLocaleDateString()} ${reservation.reservationTime}`,
      {
        screen: 'reservation',
        _id: reservation._id.toString(),
      },
    );
    this.reservationGateway.emitNewReservation(reservation);
    return reservation;
  }

  //! Confirm a reservation
  async confirmReservation(confirmationCode: string): Promise<Reservation> {
    const reservation = await this.reservationModel.findOne({
      status: ReservationStatus.PENDING,
      confirmationCode,
    });

    if (!reservation) {
      throw new ConflictException('Invalid confirmation code');
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

    if (reservation.status !== ReservationStatus.PENDING) {
      throw new ConflictException('Reservation is not pending');
    }

    reservation.status = ReservationStatus.CONFIRMED;
    // reservation.confirmationCode = null;
    await reservation.save();

    // Send confirmation email to user with reservation details
    if (reservation.email) {
      await this.emailService.sendEmail({
        to: reservation.email,
        subject: 'Your Reservation is Confirmed',
        html: `<h2>Reservation Confirmed</h2>
          <p>Dear ${reservation.name || 'Guest'},</p>
          <p>Your reservation has been successfully confirmed.</p>
          <ul>
            <li><b>Date:</b> ${reservation.reservationDate ? new Date(reservation.reservationDate).toLocaleDateString() : 'N/A'}</li>
            <li><b>Reservation Time:</b> ${reservation.reservationTime || 'N/A'}</li>
          </ul>
          <p>Thank you for choosing Citrus Restaurant!</p>`,
      });
    }

    // Notify all admins
    await this.notifyAdminsExpo(
      'Reservation Confirmed',
      `${reservation.name} on ${reservation.reservationDate ? new Date(reservation.reservationDate).toLocaleDateString() : ''} has been confirmed.`,
      { screen: 'reservation', _id: reservation._id.toString() },
    );
    return reservation;
  }

  //! Get all reservations
  async getReservations(
    userId?: Types.ObjectId,
    status?: ReservationStatus,
    date?: string,
    search?: string,
  ): Promise<Reservation[]> {
    const filter: any = {};
    if (userId) filter.userId = userId;
    if (status) filter.status = status;
    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setUTCHours(23, 59, 59, 999);

      filter.reservationDate = { $gte: start, $lte: end };
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { reservationId: { $regex: search, $options: 'i' } },
      ];
    }

    const res = await this.reservationModel
      .find(filter)
      .sort({ reservationDate: -1 })
      .exec();

    return res;
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
      await this.emailService.sendReservationUpdate(reservation.email, {
        name: reservation.name,
        status: 'APPROVED',
        reservationDate: reservation.reservationDate.toISOString(),
        tableNumber: reservation.tableNumber,
      });
    }
    this.reservationGateway.emitReservationApproved(reservation);
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
      await this.emailService.sendReservationUpdate(reservation.email, {
        name: reservation.name,
        status: 'REJECTED',
        reservationDate: reservation.reservationDate.toLocaleDateString(),
        tableNumber: reservation.tableNumber,
        reason: dto.reason,
      });
    }
    this.reservationGateway.emitReservationRejected(reservation);
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
      await this.emailService.sendEmail({
        to: reservation.email,
        subject: 'Your Reservation Confirmation Code',
        html: `<p>Your confirmation code is: <b>${reservation.confirmationCode}</b></p>`,
      });
    }
    // TODO: Integrate SMS sending if required
  }
}

import { Injectable, ConflictException } from '@nestjs/common';
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
import { FCMService } from './fcm.service';

@Injectable()
export class ReservationService {
  constructor(
    @InjectModel(Reservation.name)
    private reservationModel: Model<ReservationDocument>,
    private emailService: EmailService,
    private reservationGateway: ReservationGateway,
    private usersService: UsersService,
    private fcmService: FCMService,
  ) {}

  private generateConfirmationCode(): string {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  }

  // Helper: Send FCM push notification to all admins
  private async notifyAdminsFCM(
    title: string,
    body: string,
    data?: Record<string, string>,
  ) {
    const admins = await this.usersService['userModel'].find({
      role: 'admin',
      deviceToken: { $exists: true, $ne: null },
    });
    for (const admin of admins) {
      await this.fcmService.sendNotification(
        admin.deviceToken,
        title,
        body,
        data,
      );
    }
  }

  //! Create a new reservation
  async createReservation(dto: any): Promise<Reservation> {
    const confirmationCode = this.generateConfirmationCode();
    const reservation = new this.reservationModel({
      ...dto,
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
    // Notify all admins via FCM
    await this.notifyAdminsFCM(
      'New Reservation',
      `Reservation for table ${reservation.tableNumber} on ${new Date(reservation.reservationDate).toLocaleString()}`,
      { reservationId: reservation._id.toString() },
    );
    this.reservationGateway.emitNewReservation(reservation);
    return reservation;
  }

  //! Confirm a reservation
  async confirmReservation(confirmationCode: string): Promise<Reservation> {
    const reservation = await this.reservationModel.findOne({
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
            <li><b>Date:</b> ${reservation.reservationDate ? new Date(reservation.reservationDate).toLocaleString() : 'N/A'}</li>
            <li><b>Table Number:</b> ${reservation.tableNumber || 'N/A'}</li>
            <li><b>Confirmation Code:</b> ${reservation.confirmationCode}</li>
          </ul>
          <p>Thank you for choosing Citrus Restaurant!</p>`,
      });
    }

    // Notify all admins via FCM
    await this.notifyAdminsFCM(
      'Reservation Confirmed',
      `Reservation for table ${reservation.tableNumber} on ${reservation.reservationDate ? new Date(reservation.reservationDate).toLocaleString() : ''} has been confirmed.`,
      { reservationId: reservation._id.toString() },
    );

    return reservation;
  }

  //! Get all reservations
  async getReservations(
    userId?: Types.ObjectId,
    status?: ReservationStatus,
    startDate?: string,
    endDate?: string,
    tableNumber?: number,
    name?: string,
  ): Promise<Reservation[]> {
    const filter: any = {};
    if (userId) filter.userId = userId;
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.reservationDate = {};
      if (startDate) filter.reservationDate.$gte = new Date(startDate);
      if (endDate) filter.reservationDate.$lte = new Date(endDate);
    }
    if (tableNumber) filter.tableNumber = tableNumber;
    if (name) filter.name = { $regex: name, $options: 'i' };
    return this.reservationModel
      .find(filter)
      .sort({ reservationDate: -1 })
      .exec();
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
    // Notify all admins via FCM
    await this.notifyAdminsFCM(
      'Reservation Approved',
      `Reservation for table ${reservation.tableNumber} has been approved.`,
      { reservationId: reservation._id.toString() },
    );
    // Send email to guest (if email exists)
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
    reason?: string,
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
    await reservation.save();
    // Notify all admins via FCM
    await this.notifyAdminsFCM(
      'Reservation Rejected',
      `Reservation for table ${reservation.tableNumber} has been rejected.`,
      { reservationId: reservation._id.toString() },
    );
    // Send email to guest (if email exists)
    if (reservation.email) {
      await this.emailService.sendReservationUpdate(reservation.email, {
        name: reservation.name,
        status: 'REJECTED',
        reservationDate: reservation.reservationDate.toISOString(),
        tableNumber: reservation.tableNumber,
        reason: reason || 'Not specified',
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

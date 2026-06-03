import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ReservationStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
}

export enum PaymentStatus {
  NONE = 'NONE',
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum ReservationType {
  STANDARD = 'STANDARD',
  BUFFET = 'BUFFET',
}

export type ReservationDocument = Reservation & Document;

@Schema({ timestamps: true })
export class Reservation {
  @Prop()
  reservationId: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  userId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: false, trim: true })
  contactNumber: string;

  @Prop({ required: true, trim: true, lowercase: true })
  email?: string;

  @Prop()
  tableNumber?: number;

  @Prop({ required: true })
  reservationDate: Date;

  @Prop({ required: true })
  reservationTime: string;

  @Prop({ required: true })
  guests: number;

  @Prop({
    type: String,
    enum: ReservationStatus,
    default: ReservationStatus.PENDING,
  })
  status: ReservationStatus;

  @Prop({ required: true })
  confirmationCode: string;

  @Prop()
  specialRequests?: string;

  @Prop()
  confirmationMethod: 'email' | 'sms';

  @Prop()
  notes?: string;

  @Prop()
  rejectedReason?: string;

  @Prop({
    type: String,
    enum: PaymentStatus,
    default: PaymentStatus.NONE,
  })
  paymentStatus: PaymentStatus;

  @Prop()
  stripeSessionId?: string;

  @Prop({ required: false, default: 0 })
  paymentAmount: number;

  @Prop({
    type: String,
    enum: ReservationType,
    default: ReservationType.STANDARD,
  })
  type: ReservationType;

  @Prop({ required: false })
  pricePerPerson?: number;

  @Prop({ required: false })
  buffetTotal?: number;
}

export const ReservationSchema = SchemaFactory.createForClass(Reservation);

ReservationSchema.index({ tableNumber: 1, reservationDate: 1, status: 1 });
// Capacity check aggregation (hot path on every createReservation)
ReservationSchema.index({ reservationDate: 1, reservationTime: 1, status: 1 });
// Duplicate booking guard
ReservationSchema.index({ email: 1, status: 1 });
// Confirmation lookup
ReservationSchema.index({ confirmationCode: 1, status: 1 });
// Dashboard and list queries
ReservationSchema.index({ status: 1, createdAt: -1 });
ReservationSchema.index({ reservationDate: -1 });

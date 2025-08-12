import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// Reservation status enum
export enum ReservationStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

// Reservation document type
export type ReservationDocument = Reservation & Document;

@Schema({ timestamps: true })
export class Reservation {
  // Reference to User (optional, if logged in)
  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  userId?: Types.ObjectId;

  // Guest or user name (required)
  @Prop({ required: true, trim: true })
  name: string;

  // Contact phone number (required)
  @Prop({ required: false, trim: true })
  contactNumber: string;

  // Email (optional)
  @Prop({ required: true, trim: true, lowercase: true })
  email?: string;

  @Prop()
  tableNumber?: number;

  // Reservation date/time (required)
  @Prop({ required: true })
  reservationDate: Date;

  // Number of guests (required)
  @Prop({ required: true })
  guests: number;

  // Reservation status (enum, default: PENDING)
  @Prop({
    type: String,
    enum: ReservationStatus,
    default: ReservationStatus.PENDING,
  })
  status: ReservationStatus;

  // Confirmation code/token (required)
  @Prop({ required: true })
  confirmationCode: string;

  @Prop()
  specialRequests?: string;
}

export const ReservationSchema = SchemaFactory.createForClass(Reservation);

// Index for efficient lookups by table/date/status
ReservationSchema.index({ tableNumber: 1, reservationDate: 1, status: 1 });

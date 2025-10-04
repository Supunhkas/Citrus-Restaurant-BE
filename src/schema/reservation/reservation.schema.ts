import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ReservationStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
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
}

export const ReservationSchema = SchemaFactory.createForClass(Reservation);

ReservationSchema.index({ tableNumber: 1, reservationDate: 1, status: 1 });

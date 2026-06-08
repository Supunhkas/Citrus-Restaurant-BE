import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PickupOrderDocument = HydratedDocument<PickupOrder>;

export enum PickupOrderStatus {
  PAYMENT_PENDING = 'payment_pending',
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  READY = 'ready',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum PickupOrderPaymentStatus {
  NONE = 'NONE',
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface OrderItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
}

@Schema({ timestamps: true })
export class PickupOrder {
  @Prop({ required: true, trim: true })
  customerName: string;

  @Prop({ required: true, trim: true })
  customerPhone: string;

  @Prop({ trim: true, default: null })
  customerEmail: string | null;

  @Prop({ type: [Object], required: true })
  items: OrderItem[];

  // Subtotal before tax
  @Prop({ required: true, min: 0 })
  subtotal: number;

  // Tax amount
  @Prop({ required: true, min: 0 })
  tax: number;

  // Final total
  @Prop({ required: true, min: 0 })
  total: number;

  @Prop({
    type: String,
    enum: PickupOrderStatus,
    default: PickupOrderStatus.PENDING,
  })
  status: PickupOrderStatus;

  @Prop({ trim: true, default: null })
  notes: string | null;

  // Estimated pickup time set by admin
  @Prop({ default: null })
  estimatedPickupTime: Date | null;

  // Payment tracking
  @Prop({
    type: String,
    enum: PickupOrderPaymentStatus,
    default: PickupOrderPaymentStatus.NONE,
  })
  paymentStatus: PickupOrderPaymentStatus;

  @Prop({ default: null })
  stripeSessionId: string | null;

  @Prop({ default: 0, min: 0 })
  paymentAmount: number;
}

export const PickupOrderSchema = SchemaFactory.createForClass(PickupOrder);

PickupOrderSchema.index({ status: 1, createdAt: -1 });

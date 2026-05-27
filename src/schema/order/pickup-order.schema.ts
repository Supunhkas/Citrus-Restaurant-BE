import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PickupOrderDocument = PickupOrder & Document;

export enum PickupOrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  READY = 'ready',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
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
}

export const PickupOrderSchema = SchemaFactory.createForClass(PickupOrder);

PickupOrderSchema.index({ status: 1, createdAt: -1 });

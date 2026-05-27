import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MenuItemDocument = MenuItem & Document;

export type DietaryTag =
  | 'vegetarian'
  | 'vegan'
  | 'gluten-free'
  | 'dairy-free'
  | 'nut-free';

@Schema({ timestamps: true })
export class MenuItem {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  description: string;

  // Stored as a number (e.g. 16.95) — formatted on the frontend.
  // Avoids the $-string parsing hack that was in the static data file.
  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ required: true, trim: true, lowercase: true })
  category: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  // 1 = mild, 2 = medium, 3 = hot. Optional (null = no heat).
  @Prop({ type: Number, enum: [1, 2, 3], default: null })
  spiceLevel: number | null;

  @Prop({ type: [String], default: [] })
  dietaryInfo: DietaryTag[];

  @Prop({ trim: true, default: null })
  image: string | null;

  @Prop({ default: false })
  featured: boolean;

  // Admin can take an item off the menu without deleting it.
  @Prop({ default: true })
  isAvailable: boolean;

  // Display order within a category. Lower = shown first.
  @Prop({ default: 0 })
  sortOrder: number;
}

export const MenuItemSchema = SchemaFactory.createForClass(MenuItem);

// Indexes that power the public list endpoint filters
MenuItemSchema.index({ category: 1, isAvailable: 1 });
MenuItemSchema.index({ featured: 1, isAvailable: 1 });
MenuItemSchema.index({ name: 'text', description: 'text' });

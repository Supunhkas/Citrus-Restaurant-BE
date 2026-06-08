import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MenuCategoryDocument = HydratedDocument<MenuCategory>;

@Schema({ timestamps: true })
export class MenuCategory {
  // Slug used as the filter key (e.g. 'mains', 'curries').
  // Unique and lowercase — matches what's stored on MenuItem.category.
  @Prop({ required: true, trim: true, lowercase: true, unique: true })
  slug: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true, default: '' })
  description: string;

  // Display order in category navigation. Lower = shown first.
  @Prop({ default: 0 })
  sortOrder: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const MenuCategorySchema = SchemaFactory.createForClass(MenuCategory);

MenuCategorySchema.index({ slug: 1 }, { unique: true });
MenuCategorySchema.index({ sortOrder: 1, isActive: 1 });

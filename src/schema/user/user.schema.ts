import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, trim: true, lowercase: true })
  email: string;

  @Prop({ required: true, trim: true })
  password: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ default: 'user' })
  role: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastLoginAt?: Date;

  @Prop()
  emailVerificationToken?: string;

  @Prop()
  passwordResetToken?: string;

  @Prop()
  passwordResetExpires?: Date;

  @Prop({ type: String, default: null })
  refreshTokenHash?: string;

  @Prop({ type: String, default: null })
  deviceToken?: string;

  @Prop({ type: Date, default: null })
  deviceTokenUpdatedAt?: Date;

  @Prop({ type: String, default: null })
  fcmToken?: string;

  @Prop({ type: Date, default: null })
  fcmTokenUpdatedAt?: Date;

  @Prop({ type: Number, default: 0 })
  failedLoginAttempts: number;

  @Prop({ type: Date, default: null })
  lockUntil?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ email: 1, isActive: 1 });
UserSchema.index({ emailVerificationToken: 1 });
UserSchema.index({ passwordResetToken: 1 });

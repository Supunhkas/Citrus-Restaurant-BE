import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../schema/user/user.schema';
import { RegisterDto } from '../auth/dto/register.dto';
import * as argon2 from 'argon2';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly configService: ConfigService,
  ) {}

  async create(registerDto: RegisterDto): Promise<User> {
    const { email, password, name } = registerDto;

    const existingUser = await this.findByEmail(email);

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const hashedPassword = await this.hashPassword(password);

    const emailVerificationToken = randomBytes(32).toString('hex');

    const user = new this.userModel({
      email,
      password: hashedPassword,
      name,
      emailVerificationToken,
    });

    return user.save();
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async findById(id: string): Promise<User | null> {
    return this.userModel.findById(id).exec();
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      lastLoginAt: new Date(),
    });
  }

  async verifyEmail(token: string): Promise<User> {
    const user = await this.userModel.findOne({
      emailVerificationToken: token,
    });

    if (!user) {
      throw new NotFoundException('Invalid verification token');
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    return this.userModel.findByIdAndUpdate(
      user._id,
      { isEmailVerified: true, emailVerificationToken: undefined },
      { new: true },
    );
  }

  async generatePasswordResetToken(email: string): Promise<string> {
    const user = await this.findByEmail(email);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const resetToken = randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour

    await this.userModel.findByIdAndUpdate((user as any)._id, {
      passwordResetToken: resetToken,
      passwordResetExpires: resetExpires,
    });

    return resetToken;
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await this.userModel.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      throw new NotFoundException('Invalid or expired reset token');
    }

    const hashedPassword = await this.hashPassword(newPassword);
    user.password = hashedPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
  }

  async updateProfile(
    userId: string,
    updateData: Partial<User>,
  ): Promise<User> {
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true },
    );

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async deactivateUser(userId: string): Promise<void> {
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { isActive: false },
      { new: true },
    );

    if (!user) {
      throw new NotFoundException('User not found');
    }
  }

  private async hashPassword(password: string): Promise<string> {
    const argon2Config = this.configService.get('argon2');
    return argon2.hash(password, {
      timeCost: argon2Config.timeCost,
      memoryCost: argon2Config.memoryCost,
    });
  }

  async verifyPassword(
    plainPassword: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return argon2.verify(hashedPassword, plainPassword);
  }

  //!Dashboard Counters
  async countUsers(): Promise<number> {
    return this.userModel.countDocuments({ role: 'user' }).exec();
  }

  async updateDeviceToken(userId: string, deviceToken: string): Promise<void> {
    try {
      await this.userModel.findByIdAndUpdate(
        userId,
        {
          deviceToken,
          deviceTokenUpdatedAt: new Date(),
        },
        { new: true },
      );
    } catch (error) {
      console.error(
        `Failed to update device token for user ${userId}`,
        error.stack,
      );
      // Don't throw - token update failure shouldn't break login
    }
  }
  async updateFcmToken(userId: string, fcm: string): Promise<void> {
    try {
      await this.userModel.findByIdAndUpdate(
        userId,
        {
          fcmToken: fcm,
          fcmTokenUpdatedAt: new Date(),
        },
        { new: true },
      );
      `Fcm token updated for user: ${userId}`;
    } catch (error) {
      console.error(
        `Failed to update Fcm token for user ${userId}`,
        error.stack,
      );
      // Don't throw - token update failure shouldn't break login
    }
  }

  async removeDeviceToken(userId: string): Promise<void> {
    try {
      await this.userModel.findByIdAndUpdate(
        userId,
        {
          deviceToken: null,
          deviceTokenUpdatedAt: null,
        },
        { new: true },
      );
      `Device token removed for user: ${userId}`;
    } catch (error) {
      console.error(
        `Failed to remove device token for user ${userId}`,
        error.stack,
      );
    }
  }

  // Optional: Find all users by device token (useful for cleanup)
  async findByDeviceToken(deviceToken: string): Promise<User[]> {
    return this.userModel.find({ deviceToken }).exec();
  }
}

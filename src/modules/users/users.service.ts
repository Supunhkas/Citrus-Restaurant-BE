import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../schema/user/user.schema';
import { RegisterDto } from '../auth/dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import * as argon2 from 'argon2';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

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

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async findById(id: string): Promise<UserDocument | null> {
    const user = await this.userModel.findById(id).exec();

    if (!user) {
      throw new BadRequestException('User not found');
    }

    return user;
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

    await this.userModel.findByIdAndUpdate(user._id, {
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
    updateData: UpdateProfileDto,
  ): Promise<User> {
    // Only allow safe fields — role, password, isActive, etc. are never updated here
    const safeUpdate: Record<string, unknown> = {};
    if (updateData.name !== undefined) safeUpdate.name = updateData.name;
    if (updateData.phone !== undefined) safeUpdate.phone = updateData.phone;
    if (updateData.address !== undefined)
      safeUpdate.address = updateData.address;

    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { $set: safeUpdate },
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
        { deviceToken, deviceTokenUpdatedAt: new Date() },
        { new: true },
      );
    } catch (error) {
      this.logger.error(
        `Failed to update device token for user ${userId}`,
        error.message,
      );
    }
  }

  async updateFcmToken(userId: string, fcm: string): Promise<void> {
    try {
      await this.userModel.findByIdAndUpdate(
        userId,
        { fcmToken: fcm, fcmTokenUpdatedAt: new Date() },
        { new: true },
      );
    } catch (error) {
      this.logger.error(
        `Failed to update FCM token for user ${userId}`,
        error.message,
      );
    }
  }

  async removeDeviceToken(userId: string): Promise<void> {
    try {
      await this.userModel.findByIdAndUpdate(
        userId,
        { deviceToken: null, deviceTokenUpdatedAt: null },
        { new: true },
      );
    } catch (error) {
      this.logger.error(
        `Failed to remove device token for user ${userId}`,
        error.message,
      );
    }
  }

  // Optional: Find all users by device token (useful for cleanup)
  async findByDeviceToken(deviceToken: string): Promise<User[]> {
    return this.userModel.find({ deviceToken }).exec();
  }

  async findAdminDeviceTokens(): Promise<string[]> {
    const admins = await this.userModel
      .find({
        role: 'admin',
        deviceToken: { $exists: true, $ne: null },
      })
      .select('deviceToken')
      .lean()
      .exec();

    return admins.map((a) => a.deviceToken).filter(Boolean);
  }

  // ── Account lockout management ──────────────────────────────────────────

  private readonly MAX_LOGIN_ATTEMPTS = 5;
  private readonly LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

  async recordFailedLogin(userId: string): Promise<void> {
    const user = await this.userModel.findById(userId);
    if (!user) return;

    const attempts = (user.failedLoginAttempts ?? 0) + 1;
    const update: Record<string, unknown> = { failedLoginAttempts: attempts };

    if (attempts >= this.MAX_LOGIN_ATTEMPTS) {
      update.lockUntil = new Date(Date.now() + this.LOCK_DURATION_MS);
      this.logger.warn(
        `Account locked due to ${attempts} failed attempts: ${user.email}`,
      );
    }

    await this.userModel.findByIdAndUpdate(userId, update);
  }

  async clearFailedLogins(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      failedLoginAttempts: 0,
      lockUntil: null,
    });
  }

  isAccountLocked(user: User): boolean {
    if (!user.lockUntil) return false;
    return new Date(user.lockUntil) > new Date();
  }

  // ── Refresh token management ─────────────────────────────────────────────

  async saveRefreshToken(userId: string, plainToken: string): Promise<void> {
    const hash = await argon2.hash(plainToken);
    await this.userModel.findByIdAndUpdate(userId, { refreshTokenHash: hash });
  }

  async findByValidRefreshToken(
    userId: string,
    plainToken: string,
  ): Promise<UserDocument | null> {
    const user = await this.userModel.findById(userId).exec();
    if (!user?.refreshTokenHash) return null;

    const isValid = await argon2.verify(user.refreshTokenHash, plainToken);
    return isValid ? user : null;
  }

  async removeRefreshToken(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      refreshTokenHash: null,
    });
  }
}

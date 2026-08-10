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
import { UpdateProfileDto } from './dto/update-profile.dto';
import * as argon2 from 'argon2';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'crypto';

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

    // The plain token is only ever returned to the caller (to email it) —
    // only its hash is persisted, the same way refreshTokenHash already is.
    // A raw DB read otherwise directly yields a usable verification token.
    const emailVerificationToken = randomBytes(32).toString('hex');

    const user = new this.userModel({
      email,
      password: hashedPassword,
      name,
      emailVerificationToken: this.hashToken(emailVerificationToken),
    });

    try {
      await user.save();
    } catch (error: any) {
      // findByEmail-then-insert above is a check-then-act race against the
      // schema's unique email index — two concurrent registrations for the
      // same address can both pass that check, and the loser hits a raw
      // Mongo E11000 here instead of a clean 409.
      if (error?.code === 11000) {
        throw new ConflictException('User with this email already exists');
      }
      throw error;
    }

    return { ...user.toObject(), emailVerificationToken } as User;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async findById(id: string): Promise<UserDocument | null> {
    // Returns null on not-found, matching the declared type — this used to
    // throw BadRequestException instead, which made JwtStrategy's own
    // `if (!user) throw new UnauthorizedException(...)` unreachable: a
    // valid JWT for a since-deleted user surfaced as a raw 400 from deep in
    // the guard chain instead of the intended 401. Callers that need a 404
    // (e.g. a controller looking up a user by id) should throw it
    // themselves based on the null.
    return this.userModel.findById(id).exec();
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      lastLoginAt: new Date(),
    });
  }

  async verifyEmail(token: string): Promise<User> {
    const user = await this.userModel.findOne({
      emailVerificationToken: this.hashToken(token),
    });

    if (!user) {
      throw new NotFoundException('Invalid verification token');
    }

    // $unset, not a plain `undefined` field in the update object — Mongo
    // drops keys with an undefined value rather than translating them to
    // $unset, so the token was very likely never actually cleared from the
    // stored document.
    return this.userModel.findByIdAndUpdate(
      user._id,
      { isEmailVerified: true, $unset: { emailVerificationToken: '' } },
      { new: true },
    );
  }

  // Returns null (instead of throwing) when the email isn't registered, so
  // callers can return an identical response either way — throwing here let
  // callers enumerate which emails exist via POST /auth/forgot-password.
  async generatePasswordResetToken(email: string): Promise<string | null> {
    const user = await this.findByEmail(email);
    if (!user) {
      return null;
    }

    // As with emailVerificationToken, only the hash is persisted — the
    // plain value returned here is what actually gets emailed.
    const resetToken = randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour

    await this.userModel.findByIdAndUpdate(user._id, {
      passwordResetToken: this.hashToken(resetToken),
      passwordResetExpires: resetExpires,
    });

    return resetToken;
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await this.userModel.findOne({
      passwordResetToken: this.hashToken(token),
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      throw new NotFoundException('Invalid or expired reset token');
    }

    const hashedPassword = await this.hashPassword(newPassword);
    user.password = hashedPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    // A password reset is meant to defend against a compromised account —
    // that protection is incomplete if an attacker who already holds a
    // stolen refresh token can keep using it afterward. Invalidate it so
    // every device is forced to log in again with the new password.
    user.refreshTokenHash = undefined;
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
    // Atomic $inc instead of read-modify-write: concurrent failed attempts
    // (exactly what a brute-force sends) could otherwise all read the same
    // stale count and each write back the same incremented value, letting
    // the real attempt count exceed MAX_LOGIN_ATTEMPTS before locking.
    const updated = await this.userModel.findByIdAndUpdate(
      userId,
      { $inc: { failedLoginAttempts: 1 } },
      { new: true },
    );
    if (!updated) return;

    if (updated.failedLoginAttempts >= this.MAX_LOGIN_ATTEMPTS) {
      await this.userModel.findByIdAndUpdate(userId, {
        lockUntil: new Date(Date.now() + this.LOCK_DURATION_MS),
      });
      this.logger.warn(
        `Account locked due to ${updated.failedLoginAttempts} failed attempts: ${updated.email}`,
      );
    }
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

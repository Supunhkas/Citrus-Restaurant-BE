import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { JwtPayload } from 'src/common/interfaces/auth.interfaces';
import { UserDocument } from 'src/schema/user/user.schema';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async register(registerDto: RegisterDto): Promise<{ message: string }> {
    const user = await this.usersService.create(registerDto);

    // Send email verification — no tokens issued until the user verifies their address
    if (user.emailVerificationToken) {
      await this.emailService.sendEmailVerification(
        user.email,
        user.emailVerificationToken,
      );
    }

    return {
      message:
        'Registration successful. Please check your email to verify your account before logging in.',
    };
  }

  async adminLogin(loginDto: LoginDto): Promise<AuthResponseDto> {
    const { email, password, deviceToken, fcmToken } = loginDto;

    const user = await this.usersService.findByEmail(email);

    if (!user?.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.role !== 'admin') {
      throw new UnauthorizedException('This user not an Admin user');
    }

    const isPasswordValid = await this.usersService.verifyPassword(
      password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login
    await this.usersService.updateLastLogin(user._id.toString());

    if (deviceToken) {
      await this.usersService.updateDeviceToken(
        user._id.toString(),
        deviceToken,
      );
      this.logger.log(`Device token saved for user: ${email}`);
    }

    if (fcmToken) {
      await this.usersService.updateFcmToken(user._id.toString(), fcmToken);
      this.logger.log(`FCM token saved for user: ${email}`);
    }

    const tokens = await this.generateTokens(user);
    await this.usersService.saveRefreshToken(
      user._id.toString(),
      tokens.refreshToken,
    );
    const response = new AuthResponseDto({
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });

    return response;
  }
  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const { email, password, deviceToken, fcmToken } = loginDto;

    const user = await this.usersService.findByEmail(email);

    // Password is checked before anything about account state is revealed.
    // Checking isEmailVerified/isAccountLocked first (as this used to) lets
    // an unauthenticated caller enumerate which emails are registered,
    // verified, or locked out — none of that should be observable without
    // first proving knowledge of the password.
    const isPasswordValid = user?.isActive
      ? await this.usersService.verifyPassword(password, user.password)
      : false;

    if (!user?.isActive || !isPasswordValid) {
      if (user?.isActive) {
        await this.usersService.recordFailedLogin(user._id.toString());
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    if (this.usersService.isAccountLocked(user)) {
      throw new UnauthorizedException(
        'Account temporarily locked due to too many failed login attempts. Please try again later.',
      );
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException(
        'Please verify your email address before logging in',
      );
    }

    // Clear lockout on successful login
    await this.usersService.clearFailedLogins(user._id.toString());

    // Update last login
    await this.usersService.updateLastLogin(user._id.toString());

    if (deviceToken) {
      await this.usersService.updateDeviceToken(
        user._id.toString(),
        deviceToken,
      );
    }

    if (fcmToken) {
      await this.usersService.updateFcmToken(user._id.toString(), fcmToken);
    }

    const tokens = await this.generateTokens(user);
    await this.usersService.saveRefreshToken(
      user._id.toString(),
      tokens.refreshToken,
    );

    return new AuthResponseDto({
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  }

  async refreshToken(refreshToken: string): Promise<AuthResponseDto> {
    // 1. Verify the JWT signature and expiry using the dedicated refresh secret.
    //    This immediately rejects any access token presented here (different secret).
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // 2. Confirm the token type so access tokens are definitively rejected
    //    even if someone somehow obtained the refresh secret.
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // 3. Look up the user and verify the token hash stored in the DB.
    //    This makes every refresh token single-use-until-rotated AND
    //    means logout (which clears the hash) immediately invalidates
    //    any outstanding refresh token.
    const user = await this.usersService.findByValidRefreshToken(
      payload.sub,
      refreshToken,
    );

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // 4. Rotate: issue a brand-new pair and overwrite the stored hash.
    const tokens = await this.generateTokens(user);
    await this.usersService.saveRefreshToken(
      user._id.toString(),
      tokens.refreshToken,
    );

    return new AuthResponseDto({
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    const user = await this.usersService.verifyEmail(token);

    // Send welcome email after verification
    if (user.isEmailVerified) {
      await this.emailService.sendWelcomeEmail(user.email, user.name);
    }

    return { message: 'Email verified successfully' };
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const resetToken =
      await this.usersService.generatePasswordResetToken(email);

    // Only send an email when the address is actually registered, but
    // always return the same generic message either way — otherwise the
    // response itself reveals which emails have an account.
    if (resetToken) {
      await this.emailService.sendPasswordReset(email, resetToken);
    }

    return {
      message:
        'If an account exists for that email, password reset instructions have been sent.',
    };
  }

  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    await this.usersService.resetPassword(token, newPassword);
    return { message: 'Password reset successfully' };
  }

  async logout(userId: string): Promise<{ message: string }> {
    await this.usersService.removeRefreshToken(userId);
    this.logger.log(`User logged out: ${userId}`);
    return { message: 'Logged out successfully' };
  }

  private async generateTokens(
    user: UserDocument,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const basePayload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      // Access token — short-lived, signed with JWT_SECRET
      this.jwtService.signAsync(
        { ...basePayload, type: 'access' },
        {
          secret: this.configService.get<string>('jwt.secret'),
          expiresIn: this.configService.get<string>('jwt.expiresIn'),
        },
      ),
      // Refresh token — long-lived, signed with JWT_REFRESH_SECRET
      this.jwtService.signAsync(
        { ...basePayload, type: 'refresh' },
        {
          secret: this.configService.get<string>('jwt.refreshSecret'),
          expiresIn: this.configService.get<string>('jwt.refreshExpiresIn'),
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }
}

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    const user = await this.usersService.create(registerDto);

    // Send email verification
    if (user.emailVerificationToken) {
      await this.emailService.sendEmailVerification(
        user.email,
        user.emailVerificationToken,
      );
    }

    const tokens = await this.generateTokens(user);

    return new AuthResponseDto({
      id: (user as any)._id,
      email: user.email,
      name: user.name,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
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
    await this.usersService.updateLastLogin((user as any)._id);

    if (deviceToken) {
      await this.usersService.updateDeviceToken((user as any)._id, deviceToken);
      this.logger.log(`Device token saved for user: ${email}`);
    }

    if (fcmToken) {
      await this.usersService.updateFcmToken((user as any)._id, fcmToken);
      this.logger.log(`FCM token saved for user: ${email}`);
    }

    const tokens = await this.generateTokens(user);
    console.log('log success');
    const response = new AuthResponseDto({
      id: (user as any)._id,
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
    const { email, password } = loginDto;

    const user = await this.usersService.findByEmail(email);
    if (!user?.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await this.usersService.verifyPassword(
      password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login
    await this.usersService.updateLastLogin((user as any)._id);

    const tokens = await this.generateTokens(user);

    return new AuthResponseDto({
      id: (user as any)._id,
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
    let payload: any;
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
      (user as any)._id.toString(),
      tokens.refreshToken,
    );

    return new AuthResponseDto({
      id: (user as any)._id,
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

    // Send password reset email
    await this.emailService.sendPasswordReset(email, resetToken);

    return { message: 'Password reset instructions sent to your email' };
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
    user: any,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const basePayload = {
      sub: (user as any)._id,
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

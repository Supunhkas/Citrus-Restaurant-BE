import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const emailConfig = this.configService.get('email');

    this.transporter = nodemailer.createTransport({
      host: emailConfig.host,
      port: emailConfig.port,
      secure: emailConfig.secure,
      auth: {
        user: emailConfig.auth.user,
        pass: emailConfig.auth.pass,
      },
    });

    // Verify connection configuration
    this.transporter.verify((error, success) => {
      if (error) {
        this.logger.error('Email transporter verification failed:', error);
      } else {
        console.log(success);
        this.logger.log('Email transporter is ready to send messages');
      }
    });
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      const emailConfig = this.configService.get('email');

      const mailOptions = {
        from: emailConfig.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      };

      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(
        `Email sent successfully to ${options.to}: ${info.messageId}`,
      );
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}:`, error);
      return false;
    }
  }

  async sendEmailVerification(email: string, token: string): Promise<boolean> {
    const appConfig = this.configService.get('app');
    const verificationUrl = `${appConfig.url}/auth/verify-email/${token}`;

    const template = this.getEmailVerificationTemplate(verificationUrl);

    return this.sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  async sendPasswordReset(email: string, token: string): Promise<boolean> {
    const appConfig = this.configService.get('app');
    const resetUrl = `${appConfig.url}/auth/reset-password/${token}`;

    const template = this.getPasswordResetTemplate(resetUrl);

    return this.sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  async sendWelcomeEmail(email: string, firstName: string): Promise<boolean> {
    const template = this.getWelcomeTemplate(firstName);

    return this.sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  async sendReservationUpdate(
    email: string,
    update: {
      name: string;
      status: string;
      reservationDate: string;
      tableNumber: number;
      reason?: string;
    },
  ): Promise<boolean> {
    const appConfig = this.configService.get('app');
    const { name, status, reservationDate, reason } = update;
    const subject = `Reservation Update - ${appConfig.name}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
          <h1 style="color: #333; margin: 0;">${appConfig.name}</h1>
        </div>
        <div style="padding: 20px;">
          <h2 style="color: #333;">Reservation Update</h2>
          <p>Dear ${name},</p>
          <p>Your reservation on <b>${new Date(reservationDate).toLocaleString()}</b> has been <b>${status}</b>.</p>
          ${reason ? `<p>Reason: ${reason}</p>` : ''}
          <p>If you have any questions, please contact us.</p>
        </div>
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px;">
          <p>© ${new Date().getFullYear()} ${appConfig.name}. All rights reserved.</p>
        </div>
      </div>
    `;
    const text = `Dear ${name},\nYour reservation on ${new Date(reservationDate).toLocaleDateString()} has been ${status}.${reason ? '\nReason: ' + reason : ''}\nIf you have any questions, please contact us.`;
    return this.sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  }

  private getEmailVerificationTemplate(verificationUrl: string): EmailTemplate {
    const appConfig = this.configService.get('app');

    return {
      subject: `Verify your email - ${appConfig.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
            <h1 style="color: #333; margin: 0;">${appConfig.name}</h1>
          </div>
          <div style="padding: 20px;">
            <h2 style="color: #333;">Verify Your Email Address</h2>
            <p>Thank you for registering with ${appConfig.name}! Please verify your email address by clicking the button below:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email</a>
            </div>
            <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
            <p>This link will expire in 24 hours.</p>
            <p>If you didn't create an account with ${appConfig.name}, you can safely ignore this email.</p>
          </div>
          <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px;">
            <p>© ${new Date().getFullYear()} ${appConfig.name}. All rights reserved.</p>
          </div>
        </div>
      `,
      text: `
        Verify Your Email Address - ${appConfig.name}
        
        Thank you for registering with ${appConfig.name}! Please verify your email address by visiting:
        
        ${verificationUrl}
        
        This link will expire in 24 hours.
        
        If you didn't create an account with ${appConfig.name}, you can safely ignore this email.
      `,
    };
  }

  private getPasswordResetTemplate(resetUrl: string): EmailTemplate {
    const appConfig = this.configService.get('app');

    return {
      subject: `Reset Your Password - ${appConfig.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
            <h1 style="color: #333; margin: 0;">${appConfig.name}</h1>
          </div>
          <div style="padding: 20px;">
            <h2 style="color: #333;">Reset Your Password</h2>
            <p>You requested to reset your password for your ${appConfig.name} account. Click the button below to create a new password:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background-color: #dc3545; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
            </div>
            <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #666;">${resetUrl}</p>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request a password reset, you can safely ignore this email.</p>
          </div>
          <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px;">
            <p>© ${new Date().getFullYear()} ${appConfig.name}. All rights reserved.</p>
          </div>
        </div>
      `,
      text: `
        Reset Your Password - ${appConfig.name}
        
        You requested to reset your password for your ${appConfig.name} account. Visit this link to create a new password:
        
        ${resetUrl}
        
        This link will expire in 1 hour.
        
        If you didn't request a password reset, you can safely ignore this email.
      `,
    };
  }

  private getWelcomeTemplate(firstName: string): EmailTemplate {
    const appConfig = this.configService.get('app');

    return {
      subject: `Welcome to ${appConfig.name}!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
            <h1 style="color: #333; margin: 0;">${appConfig.name}</h1>
          </div>
          <div style="padding: 20px;">
            <h2 style="color: #333;">Welcome, ${firstName}!</h2>
            <p>Thank you for joining ${appConfig.name}! We're excited to have you as part of our community.</p>
            <p>You can now:</p>
            <ul>
              <li>Browse our menu</li>
              <li>Place orders</li>
              <li>Track your orders</li>
              <li>Manage your profile</li>
            </ul>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${appConfig.url}" style="background-color: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Get Started</a>
            </div>
            <p>If you have any questions, feel free to contact our support team.</p>
          </div>
          <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px;">
            <p>© ${new Date().getFullYear()} ${appConfig.name}. All rights reserved.</p>
          </div>
        </div>
      `,
      text: `
        Welcome to ${appConfig.name}!
        
        Hi ${firstName},
        
        Thank you for joining ${appConfig.name}! We're excited to have you as part of our community.
        
        You can now browse our menu, place orders, track your orders, and manage your profile.
        
        Get started: ${appConfig.url}
        
        If you have any questions, feel free to contact our support team.
      `,
    };
  }
}

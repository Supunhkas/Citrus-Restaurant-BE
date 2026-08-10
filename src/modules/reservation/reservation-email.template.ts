/**
 * Reservation Email Templates
 */

const DEFAULT_APP_NAME = 'Citrus Restaurant';

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const reservationEmailTemplates = {
  /**
   * Template for sending the initial confirmation code
   */
  confirmationCode: (
    name: string,
    code: string,
    appName: string = DEFAULT_APP_NAME,
  ) => ({
    subject: `Your Reservation Confirmation Code - ${appName}`,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #f97316; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">${appName}</h1>
        </div>
        <div style="padding: 32px; color: #333; line-height: 1.6;">
          <h2 style="color: #111; margin-top: 0;">Reservation Confirmation</h2>
          <p>Dear ${escapeHtml(name || 'Guest')},</p>
          <p>Thank you for choosing ${appName}. To complete your reservation, please use the confirmation code below:</p>
          <div style="background-color: #fff7ed; border: 2px dashed #fb923c; border-radius: 6px; padding: 16px; text-align: center; margin: 24px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #ea580c;">${code}</span>
          </div>
          <p style="font-size: 14px; color: #666;">This code is valid for 1 hour. If you did not request this reservation, please ignore this email.</p>
        </div>
        <div style="background-color: #f8f9fa; padding: 16px; text-align: center; color: #888; font-size: 12px; border-top: 1px solid #e0e0e0;">
          <p>© ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
        </div>
      </div>
    `,
  }),

  /**
   * Template for confirmed reservations (after user enters code)
   */
  confirmed: (
    name: string,
    date: string,
    time: string,
    appName: string = DEFAULT_APP_NAME,
  ) => ({
    subject: `Your Reservation is Confirmed - ${appName}`,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #10b981; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">${appName}</h1>
        </div>
        <div style="padding: 32px; color: #333; line-height: 1.6;">
          <h2 style="color: #111; margin-top: 0;">Reservation Confirmed!</h2>
          <p>Dear ${escapeHtml(name || 'Guest')},</p>
          <p>We are happy to inform you that your reservation has been successfully confirmed.</p>
          <div style="background-color: #f0fdf4; border-radius: 6px; padding: 20px; margin: 24px 0;">
            <p style="margin: 0; margin-bottom: 8px;"><strong>Date:</strong> ${date}</p>
            <p style="margin: 0;"><strong>Time:</strong> ${escapeHtml(time)}</p>
          </div>
          <p>We look forward to serving you!</p>
        </div>
        <div style="background-color: #f8f9fa; padding: 16px; text-align: center; color: #888; font-size: 12px; border-top: 1px solid #e0e0e0;">
          <p>© ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
        </div>
      </div>
    `,
  }),

  /**
   * Template for reservation updates (Approved/Rejected)
   */
  update: (
    name: string,
    status: string,
    date: string,
    appName: string = DEFAULT_APP_NAME,
    reason?: string,
  ) => {
    const isApproved = status.toUpperCase() === 'APPROVED';
    const bgColor = isApproved ? '#10b981' : '#ef4444';

    return {
      subject: `Reservation ${status} - ${appName}`,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
          <div style="background-color: ${bgColor}; padding: 24px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">${appName}</h1>
          </div>
          <div style="padding: 32px; color: #333; line-height: 1.6;">
            <h2 style="color: #111; margin-top: 0;">Reservation ${status}</h2>
            <p>Dear ${escapeHtml(name)},</p>
            <p>Your reservation on <strong>${date}</strong> has been <strong>${status}</strong>.</p>
            ${reason ? `<div style="background-color: #fff1f2; border-left: 4px solid #ef4444; padding: 12px; margin: 16px 0;"><strong>Reason:</strong> ${escapeHtml(reason)}</div>` : ''}
            <p>If you have any questions, please feel free to contact us.</p>
          </div>
          <div style="background-color: #f8f9fa; padding: 16px; text-align: center; color: #888; font-size: 12px; border-top: 1px solid #e0e0e0;">
            <p>© ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
          </div>
        </div>
      `,
    };
  },
};

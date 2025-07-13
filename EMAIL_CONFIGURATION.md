# 📧 Email Configuration Guide

This guide explains how to configure email functionality for the Citrus Restaurant Backend.

## 🔧 Environment Variables

Add the following environment variables to your `.env` file:

```env
# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=your-email@gmail.com

# App Configuration
APP_NAME=Citrus Restaurant
APP_URL=http://localhost:3000
```

## 📧 Email Service Features

The email service provides the following functionality:

### 1. **Email Verification**

- Sends verification emails when users register
- Includes a secure verification link
- Expires after 24 hours

### 2. **Password Reset**

- Sends password reset emails
- Includes a secure reset link
- Expires after 1 hour

### 3. **Welcome Email**

- Sends welcome emails after email verification
- Personalized with user's first name

## 🔐 Gmail Setup (Recommended)

### Step 1: Enable 2-Factor Authentication

1. Go to your Google Account settings
2. Enable 2-Factor Authentication

### Step 2: Generate App Password

1. Go to Google Account settings
2. Navigate to Security → App passwords
3. Generate a new app password for "Mail"
4. Use this password in `EMAIL_PASS`

### Step 3: Configure Environment

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASS=your-16-digit-app-password
EMAIL_FROM=your-gmail@gmail.com
```

## 📧 Other Email Providers

### Outlook/Hotmail

```env
EMAIL_HOST=smtp-mail.outlook.com
EMAIL_PORT=587
EMAIL_SECURE=false
```

### Yahoo

```env
EMAIL_HOST=smtp.mail.yahoo.com
EMAIL_PORT=587
EMAIL_SECURE=false
```

### Custom SMTP Server

```env
EMAIL_HOST=your-smtp-server.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-username
EMAIL_PASS=your-password
```

## 🧪 Testing Email Configuration

### 1. **Test Email Service**

```bash
# Start the application
npm run start:dev

# Register a new user
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

### 2. **Test Password Reset**

```bash
# Request password reset
curl -X POST http://localhost:3000/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com"
  }'
```

## 📧 Email Templates

The email service includes professionally designed HTML templates:

### Email Verification Template

- Clean, modern design
- Responsive layout
- Clear call-to-action button
- Fallback text version

### Password Reset Template

- Secure reset link
- Clear instructions
- Professional styling
- Mobile-friendly

### Welcome Email Template

- Personalized greeting
- Feature highlights
- Call-to-action button
- Brand consistency

## 🔧 Customization

### Custom Email Templates

You can customize email templates by modifying the methods in `src/modules/email/email.service.ts`:

```typescript
private getEmailVerificationTemplate(verificationUrl: string): EmailTemplate {
  // Customize the HTML and text content here
  return {
    subject: `Verify your email - ${appConfig.name}`,
    html: `<!-- Your custom HTML -->`,
    text: `<!-- Your custom text -->`,
  };
}
```

### Custom Email Configuration

Add additional email configuration options in `src/config/configuration.ts`:

```typescript
email: {
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT, 10) || 587,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
  // Add custom options
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
}
```

## 🚨 Troubleshooting

### Common Issues

1. **Authentication Failed**
   - Ensure 2FA is enabled for Gmail
   - Use app password, not regular password
   - Check email and password are correct

2. **Connection Timeout**
   - Verify SMTP host and port
   - Check firewall settings
   - Try different port (465 for SSL, 587 for TLS)

3. **Emails Not Sending**
   - Check email configuration
   - Verify environment variables
   - Check application logs for errors

### Debug Mode

Enable debug logging by adding to your environment:

```env
NODE_ENV=development
LOG_LEVEL=debug
```

## 📊 Email Service Methods

### Available Methods

```typescript
// Send email verification
await emailService.sendEmailVerification(email, token);

// Send password reset
await emailService.sendPasswordReset(email, token);

// Send welcome email
await emailService.sendWelcomeEmail(email, firstName);

// Send custom email
await emailService.sendEmail({
  to: 'user@example.com',
  subject: 'Custom Subject',
  html: '<h1>Custom HTML</h1>',
  text: 'Custom text version',
});
```

## 🔒 Security Considerations

1. **App Passwords**: Use app passwords instead of regular passwords
2. **Environment Variables**: Never commit email credentials to version control
3. **Rate Limiting**: Email endpoints are protected by rate limiting
4. **Token Expiration**: Email tokens expire automatically
5. **HTTPS**: Use HTTPS in production for secure email links

## 📈 Production Recommendations

1. **Email Service Provider**: Consider using services like SendGrid, Mailgun, or AWS SES
2. **Email Queue**: Implement email queuing for high-volume applications
3. **Email Analytics**: Track email delivery and open rates
4. **Backup Provider**: Have a backup email service provider
5. **Monitoring**: Monitor email service health and delivery rates

# Security Configuration Guide

This document outlines the security measures implemented in the Citrus Restaurant Backend.

## 🔒 Security Features Implemented

### 1. **Helmet.js - Security Headers**

Helmet helps secure Express apps by setting various HTTP headers.

**Configuration:**

```typescript
// src/main.ts
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: false, // Disabled for development
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);
```

**Headers Set:**

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security` (in production)
- `Content-Security-Policy`

### 2. **Rate Limiting (Throttling)**

Protects against brute force attacks and API abuse.

**Global Configuration:**

```typescript
// src/config/configuration.ts
throttle: {
  ttl: 60, // Time window in seconds
  limit: 10, // Max requests per window
}
```

**Global Throttle Guard:**

- Applied to all routes
- Uses IP address for tracking
- Default: 10 requests per minute

**Auth-Specific Throttle Guard:**

- Applied to sensitive endpoints (login, register, forgot-password)
- Stricter limits: 5 requests per minute
- Prevents brute force attacks

**Protected Endpoints:**

- `POST /auth/register` - 5 requests/minute
- `POST /auth/login` - 5 requests/minute
- `POST /auth/forgot-password` - 5 requests/minute
- All other endpoints - 10 requests/minute

### 3. **CORS Configuration**

Configurable Cross-Origin Resource Sharing.

**Configuration:**

```typescript
// src/config/configuration.ts
cors: {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
}
```

**Environment Variables:**

```env
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com
```

### 4. **Request Size Limits**

Protects against large payload attacks.

**Configuration:**

```typescript
// src/main.ts
app.use((req, res, next) => {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  const maxSize = 10 * 1024 * 1024; // 10MB limit

  if (contentLength > maxSize) {
    return res.status(413).json({
      statusCode: 413,
      message: 'Request entity too large',
      error: 'Payload Too Large',
    });
  }
  next();
});
```

### 5. **Input Validation**

Comprehensive validation using class-validator.

**Features:**

- Whitelist validation (removes unknown properties)
- Forbids non-whitelisted properties
- Automatic type transformation
- Custom validation decorators

## 🛡️ Environment Variables

### Required Variables

```env
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d

# Database
MONGODB_URI=mongodb://localhost:27017/citrus-restaurant

# Rate Limiting (Optional)
THROTTLE_TTL=60
THROTTLE_LIMIT=10

# CORS (Optional)
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com

# Application
PORT=3000
NODE_ENV=production
```

### Production Recommendations

```env
# Use strong, unique JWT secret
JWT_SECRET=your-256-bit-secret-key-here

# Set appropriate CORS origins
ALLOWED_ORIGINS=https://yourdomain.com,https://api.yourdomain.com

# Adjust rate limits for production
THROTTLE_TTL=60
THROTTLE_LIMIT=100

# Use production database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/citrus-restaurant
```

## 🔧 Configuration Files

### 1. **Main Configuration** (`src/config/configuration.ts`)

Centralized configuration management with environment variable support.

### 2. **Global Throttle Guard** (`src/common/guards/throttle.guard.ts`)

Applies rate limiting to all routes using IP-based tracking.

### 3. **Auth Throttle Guard** (`src/modules/auth/guards/auth-throttle.guard.ts`)

Stricter rate limiting for authentication endpoints.

## 🚀 Production Deployment Checklist

### Security Headers

- [x] Helmet.js configured
- [x] Content Security Policy set
- [x] CORS properly configured
- [x] Request size limits enforced

### Rate Limiting

- [x] Global rate limiting enabled
- [x] Auth-specific rate limiting configured
- [x] IP-based tracking implemented

### Environment Variables

- [ ] Strong JWT secret set
- [ ] Production database URI configured
- [ ] CORS origins restricted to production domains
- [ ] Rate limits adjusted for production load

### Additional Security Measures

- [ ] HTTPS/SSL enabled
- [ ] Database connection pooling configured
- [ ] Logging and monitoring set up
- [ ] Error tracking service configured

## 🧪 Testing Security Features

### Test Rate Limiting

```bash
# Test global rate limit (should fail after 10 requests)
for i in {1..15}; do
  curl -X GET http://localhost:3000/
done

# Test auth rate limit (should fail after 5 requests)
for i in {1..7}; do
  curl -X POST http://localhost:3000/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"test"}'
done
```

### Test Request Size Limits

```bash
# Test large payload (should fail)
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test","firstName":"test","lastName":"test","largeField":"'$(printf 'A%.0s' {1..10000000})'"}'
```

### Test CORS

```bash
# Test from allowed origin (should work)
curl -X GET http://localhost:3000/ \
  -H "Origin: http://localhost:3000"

# Test from disallowed origin (should be blocked)
curl -X GET http://localhost:3000/ \
  -H "Origin: http://malicious-site.com"
```

## 🔍 Monitoring and Logging

### Rate Limit Headers

When rate limits are hit, the following headers are returned:

- `X-RateLimit-Limit`: Maximum requests per window
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: Time when the rate limit resets

### Error Responses

```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests",
  "error": "Too Many Requests"
}
```

## 📝 Best Practices

1. **Environment Variables**: Never commit secrets to version control
2. **Rate Limits**: Adjust based on your application's needs
3. **CORS**: Only allow necessary origins in production
4. **JWT Secrets**: Use strong, unique secrets and rotate regularly
5. **Monitoring**: Set up alerts for rate limit violations
6. **Testing**: Regularly test security features
7. **Updates**: Keep dependencies updated for security patches

## 🆘 Troubleshooting

### Common Issues

1. **Rate Limiting Too Strict**
   - Adjust `THROTTLE_LIMIT` in environment variables
   - Check if you're behind a proxy (IP tracking might be affected)

2. **CORS Errors**
   - Verify `ALLOWED_ORIGINS` includes your frontend domain
   - Check if credentials are being sent with requests

3. **Request Size Errors**
   - Increase the `maxSize` limit in main.ts if needed
   - Consider file upload limits for specific endpoints

4. **Security Headers Blocking Content**
   - Adjust Content Security Policy directives
   - Check browser console for CSP violations

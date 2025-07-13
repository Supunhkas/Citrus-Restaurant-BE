export default () => ({
  port: parseInt(process.env.PORT, 10),
  database: {
    uri: process.env.MONGODB_URI,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN,
  },
  argon2: {
    saltLength: 16,
    hashLength: 32,
    timeCost: 3,
    memoryCost: 65536,
  },
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL, 10) || 60, // Time window in seconds
    limit: parseInt(process.env.THROTTLE_LIMIT, 10) || 10, // Max requests per window
  },
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
    ],
    credentials: true,
  },
  security: {
    helmet: {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
    },
  },
});

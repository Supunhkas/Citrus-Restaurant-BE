import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { json, urlencoded } from 'express';

function assertEnv(name: string, value: string | undefined): void {
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

async function bootstrap() {
  // Fail fast if critical secrets are absent
  assertEnv('JWT_SECRET', process.env.JWT_SECRET);
  assertEnv('JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET);
  assertEnv('JWT_EXPIRES_IN', process.env.JWT_EXPIRES_IN);
  assertEnv('MONGODB_URI', process.env.MONGODB_URI);

  const app = await NestFactory.create(AppModule, { rawBody: true });
  const configService = app.get(ConfigService);

  // Security middleware - Helmet
  app.use(
    helmet({
      contentSecurityPolicy: configService.get(
        'security.helmet.contentSecurityPolicy',
      ),
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // CORS configuration
  app.enableCors(configService.get('cors'));

  // Request size limits (10MB) via built-in body parser
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ limit: '10mb', extended: true }));

  const port = process.env.PORT || configService.get<number>('port') || 3001;

  await app.listen(port, '0.0.0.0');
  console.log(`Application is running on port ${port}`);
}
bootstrap();

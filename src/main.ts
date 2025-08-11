import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Security middleware - Helmet
  app.use(
    helmet({
      contentSecurityPolicy: configService.get(
        'security.helmet.contentSecurityPolicy',
      ),
      crossOriginEmbedderPolicy: false, // Disable for development, enable in production
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow cross-origin resources
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
  const corsConfig = configService.get('cors');
  app.enableCors();

  // Request size limits
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

  const port = configService.get<number>('port') || 3001;

  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();

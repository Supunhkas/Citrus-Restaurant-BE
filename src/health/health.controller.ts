import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  MongooseHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private mongoose: MongooseHealthIndicator,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      // Database health check
      () => this.mongoose.pingCheck('database'),
    ]);
  }

  @Public()
  @Get('liveness')
  @HealthCheck()
  liveness() {
    return this.health.check([
      // Basic liveness check - just check if the app is running
      () => Promise.resolve({ liveness: { status: 'up' } }),
    ]);
  }

  @Public()
  @Get('readiness')
  @HealthCheck()
  readiness() {
    return this.health.check([
      // Readiness check - check if the app is ready to serve requests
      () => this.mongoose.pingCheck('database'),
    ]);
  }
}

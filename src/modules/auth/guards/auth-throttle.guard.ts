import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class AuthThrottleGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Use IP address for tracking
    return req.ips.length ? req.ips[0] : req.ip;
  }

  protected getThrottleOptions(context: any) {
    // Stricter limits for auth endpoints
    console.log(context);
    return {
      ttl: 60 * 1000, // 1 minute
      limit: 5, // 5 attempts per minute
    };
  }
}

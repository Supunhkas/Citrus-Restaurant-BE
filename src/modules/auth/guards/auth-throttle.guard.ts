import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerStorageService } from '@nestjs/throttler';

// The installed @nestjs/throttler (v6) ThrottlerGuard has no
// getThrottleOptions() override point — that was a v4/v5-era API. Under v6,
// limits come from the ThrottlerModuleOptions passed to the constructor. To
// get a stricter, independent 5-req/min limit on auth endpoints without
// changing the app-wide default throttler (used by every other route), this
// guard builds its own options and its own isolated in-memory storage rather
// than reusing the globally-injected config.
@Injectable()
export class AuthThrottleGuard extends ThrottlerGuard {
  constructor(storageService: ThrottlerStorageService, reflector: Reflector) {
    super(
      { throttlers: [{ name: 'auth', ttl: 60 * 1000, limit: 5 }] },
      storageService,
      reflector,
    );
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Use IP address for tracking
    return req.ips.length ? req.ips[0] : req.ip;
  }
}

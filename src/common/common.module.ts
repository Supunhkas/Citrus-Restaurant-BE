import { Global, Module } from '@nestjs/common';
import { EventBusService } from './utils/event-bus.service';

@Global()
@Module({
  providers: [EventBusService],
  exports: [EventBusService],
})
export class CommonModule {}

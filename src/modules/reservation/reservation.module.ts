import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Reservation,
  ReservationSchema,
} from '../../schema/reservation/reservation.schema';
import { ReservationService } from './reservation.service';
import { EmailModule } from '../email/email.module';
import { UsersModule } from '../users/users.module';
import { ReservationController } from './reservation.controller';
import { Counter, CounterSchema } from 'src/schema/counter/counter.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    EmailModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: Reservation.name, schema: ReservationSchema },
      { name: Counter.name, schema: CounterSchema },
    ]),
    NotificationsModule,
    PaymentsModule,
  ],
  controllers: [ReservationController],
  providers: [ReservationService],
  exports: [ReservationService],
})
export class ReservationModule {}

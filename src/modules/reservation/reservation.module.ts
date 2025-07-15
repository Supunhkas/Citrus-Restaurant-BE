import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Reservation,
  ReservationSchema,
} from '../../schema/reservation/reservation.schema';
import { ReservationService } from './reservation.service';
import { ReservationGateway } from './reservation.gateway';
import { FCMService } from './fcm.service';
import { EmailModule } from '../email/email.module';
import { UsersModule } from '../users/users.module';
import { ReservationController } from './reservation.controller';

@Module({
  imports: [
    EmailModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: Reservation.name, schema: ReservationSchema },
    ]),
  ],
  controllers: [ReservationController],
  providers: [ReservationService, ReservationGateway, FCMService],
  exports: [ReservationService],
})
export class ReservationModule {}

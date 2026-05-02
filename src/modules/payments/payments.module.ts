import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { Reservation, ReservationSchema } from '../../schema/reservation/reservation.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Reservation.name, schema: ReservationSchema }]),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}

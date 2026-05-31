import { Module } from '@nestjs/common';
import { OrdersAdminController, OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PickupOrder,
  PickupOrderSchema,
} from 'src/schema/order/pickup-order.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PickupOrder.name, schema: PickupOrderSchema },
    ]),
    NotificationsModule,
    UsersModule,
    PaymentsModule,
  ],
  controllers: [OrdersController, OrdersAdminController],
  providers: [OrdersService],
})
export class OrdersModule {}

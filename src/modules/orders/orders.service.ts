import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PickupOrder,
  PickupOrderDocument,
  PickupOrderStatus,
} from '../../schema/order/pickup-order.schema';
import { CreatePickupOrderDto } from './dto/create-pickup-order.dto';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(PickupOrder.name)
    private readonly orderModel: Model<PickupOrderDocument>,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly expoService: NotificationsService,
    private readonly usersService: UsersService,
  ) {}

  async createPickupOrder(dto: CreatePickupOrderDto): Promise<PickupOrder> {
    const order = new this.orderModel(dto);
    const saved = await order.save();

    this.logger.log(
      `Pickup order created: ${saved.customerName} — $${saved.total.toFixed(2)}`,
    );

    // WebSocket — admin dashboard hears this immediately
    this.notificationsGateway.notifyPickupOrder(saved);

    // Expo push — admin mobile app
    await this.notifyAdminsExpo(saved);

    return saved;
  }

  async getOrders(status?: PickupOrderStatus): Promise<PickupOrder[]> {
    const filter = status ? { status } : {};
    return this.orderModel.find(filter).sort({ createdAt: -1 }).lean().exec();
  }

  async updateOrderStatus(
    id: string,
    status: PickupOrderStatus,
  ): Promise<PickupOrder> {
    const order = await this.orderModel.findByIdAndUpdate(
      id,
      { status },
      { new: true },
    );
    if (!order) throw new Error('Order not found');
    return order;
  }

  private async notifyAdminsExpo(order: PickupOrder): Promise<void> {
    try {
      const admins = await this.usersService['userModel']
        .find({ role: 'admin', deviceToken: { $exists: true, $ne: null } })
        .select('deviceToken')
        .lean();

      if (!admins?.length) return;

      const tokens = admins.map((a) => a.deviceToken).filter(Boolean);
      const itemSummary = (order.items as any[])
        .slice(0, 2)
        .map((i) => `${i.quantity}× ${i.name}`)
        .join(', ');

      await this.expoService.sendMulticast(
        tokens,
        '🛍 New Pickup Order',
        `${order.customerName}: ${itemSummary} — $${order.total.toFixed(2)}`,
        { screen: 'orders', type: 'pickup' },
      );
    } catch (error) {
      this.logger.error('Error sending Expo push for pickup order', error);
    }
  }
}

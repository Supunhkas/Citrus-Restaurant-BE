import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PickupOrder,
  PickupOrderDocument,
  PickupOrderPaymentStatus,
  PickupOrderStatus,
} from '../../schema/order/pickup-order.schema';
import { CreatePickupOrderDto } from './dto/create-pickup-order.dto';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { PaymentsService } from '../payments/payments.service';
import { EventBusService } from 'src/common/utils/event-bus.service';

@Injectable()
export class OrdersService implements OnModuleInit {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(PickupOrder.name)
    private readonly orderModel: Model<PickupOrderDocument>,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly expoService: NotificationsService,
    private readonly usersService: UsersService,
    private readonly paymentsService: PaymentsService,
    private readonly eventBusService: EventBusService,
  ) {}

  onModuleInit() {
    this.eventBusService.on(
      'order.payment.success',
      ({ orderId, stripeSessionId }: { orderId: string; stripeSessionId: string }) => {
        this.handlePaymentSuccess(orderId, stripeSessionId);
      },
    );
  }

  async createPickupOrder(dto: CreatePickupOrderDto): Promise<any> {
    // Save order initially with payment_pending status
    const order = new this.orderModel({
      ...dto,
      status: PickupOrderStatus.PAYMENT_PENDING,
      paymentStatus: PickupOrderPaymentStatus.PENDING,
      paymentAmount: dto.total,
    });
    const saved = await order.save();

    this.logger.log(
      `Pickup order created (payment pending): ${saved.customerName} — $${saved.total.toFixed(2)}`,
    );

    // Try to create a Stripe checkout session
    if (this.paymentsService.isInitialized) {
      try {
        const session = await this.paymentsService.createPickupOrderCheckoutSession(
          (saved._id as any).toString(),
          saved.total,
          dto.customerEmail || undefined,
        );

        return {
          ...saved.toObject(),
          paymentRequired: true,
          stripeSessionUrl: session.url,
        };
      } catch (err) {
        this.logger.error(`Stripe session creation failed: ${err.message}`);
        // Fall through to graceful degradation below
      }
    } else {
      this.logger.warn('Stripe not configured — falling back to direct order (no payment).');
    }

    // Graceful fallback: mark as pending without payment so the order still works
    saved.status = PickupOrderStatus.PENDING;
    saved.paymentStatus = PickupOrderPaymentStatus.NONE;
    await saved.save();

    this.notificationsGateway.notifyPickupOrder(saved);
    await this.notifyAdminsExpo(saved);

    return {
      ...saved.toObject(),
      paymentRequired: false,
    };
  }

  async handlePaymentSuccess(orderId: string, stripeSessionId: string): Promise<void> {
    const order = await this.orderModel.findByIdAndUpdate(
      orderId,
      {
        paymentStatus: PickupOrderPaymentStatus.COMPLETED,
        status: PickupOrderStatus.PENDING,
        stripeSessionId,
      },
      { new: true },
    );

    if (!order) {
      this.logger.error(`Order not found for payment success: ${orderId}`);
      return;
    }

    this.logger.log(`Payment confirmed — order ready for admin: ${orderId}`);

    // Notify admin now that payment is confirmed
    this.notificationsGateway.notifyPickupOrder(order);
    await this.notifyAdminsExpo(order);
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
      const tokens = await this.usersService.findAdminDeviceTokens();

      if (!tokens?.length) return;

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

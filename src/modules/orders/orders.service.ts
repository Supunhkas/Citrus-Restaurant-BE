import {
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
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
import { MenuService } from '../menu/menu.service';
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
    private readonly menuService: MenuService,
    private readonly eventBusService: EventBusService,
  ) {}

  onModuleInit() {
    this.eventBusService.on(
      'order.payment.success',
      ({
        orderId,
        stripeSessionId,
        amountTotal,
      }: {
        orderId: string;
        stripeSessionId: string;
        amountTotal: number;
      }) => {
        this.handlePaymentSuccess(orderId, stripeSessionId, amountTotal);
      },
    );
  }

  async createPickupOrder(
    dto: CreatePickupOrderDto,
  ): Promise<
    { paymentRequired: boolean; stripeSessionUrl?: string } & Record<
      string,
      unknown
    >
  > {
    // Re-fetch menu prices server-side to prevent client-supplied price manipulation
    const TAX_RATE = 0.1; // 10% GST — keep in sync with frontend
    let verifiedSubtotal = 0;

    const verifiedItems = await Promise.all(
      dto.items.map(async (item) => {
        const menuItem = await this.menuService.getMenuItemById(
          item.menuItemId,
        );
        if (!menuItem) {
          throw new BadRequestException(
            `Menu item not found: ${item.menuItemId}`,
          );
        }
        if (!menuItem.isAvailable) {
          throw new BadRequestException(
            `Menu item is no longer available: ${menuItem.name}`,
          );
        }
        verifiedSubtotal += menuItem.price * item.quantity;
        return {
          menuItemId: item.menuItemId,
          name: menuItem.name,
          price: menuItem.price,
          quantity: item.quantity,
        };
      }),
    );

    const verifiedTax = Math.round(verifiedSubtotal * TAX_RATE * 100) / 100;
    const verifiedTotal =
      Math.round((verifiedSubtotal + verifiedTax) * 100) / 100;

    // Save order initially with payment_pending status
    const order = new this.orderModel({
      ...dto,
      items: verifiedItems,
      subtotal: verifiedSubtotal,
      tax: verifiedTax,
      total: verifiedTotal,
      status: PickupOrderStatus.PAYMENT_PENDING,
      paymentStatus: PickupOrderPaymentStatus.PENDING,
      paymentAmount: verifiedTotal,
    });
    const saved = await order.save();

    this.logger.log(
      `Pickup order created (payment pending): ${saved.customerName} — $${saved.total.toFixed(2)}`,
    );

    // Payment is mandatory — reject if Stripe is not configured
    if (!this.paymentsService.isInitialized) {
      await this.orderModel.findByIdAndDelete(saved._id);
      throw new ServiceUnavailableException(
        'Online payment is currently unavailable. Please try again later.',
      );
    }

    try {
      const session =
        await this.paymentsService.createPickupOrderCheckoutSession(
          saved._id.toString(),
          saved.total,
          dto.customerEmail || undefined,
        );

      return {
        ...saved.toObject(),
        paymentRequired: true,
        stripeSessionUrl: session.url,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Stripe session creation failed: ${message}`);
      await this.orderModel.findByIdAndDelete(saved._id);
      throw new ServiceUnavailableException(
        'Could not initiate payment. Please try again.',
      );
    }
  }

  async handlePaymentSuccess(
    orderId: string,
    stripeSessionId: string,
    amountTotal: number,
  ): Promise<void> {
    const order = await this.orderModel.findById(orderId);

    if (!order) {
      this.logger.error(`Order not found for payment success: ${orderId}`);
      return;
    }

    // Idempotency: skip if already processed
    if (order.paymentStatus === PickupOrderPaymentStatus.COMPLETED) {
      this.logger.warn(
        `Duplicate webhook for order ${orderId} (session ${stripeSessionId}) — already processed`,
      );
      return;
    }

    // Amount verification: Stripe uses cents
    const expectedCents = Math.round(order.total * 100);
    if (amountTotal !== expectedCents) {
      this.logger.error(
        `Payment amount mismatch for order ${orderId}: expected ${expectedCents} cents, got ${amountTotal} cents`,
      );
      return;
    }

    order.paymentStatus = PickupOrderPaymentStatus.COMPLETED;
    order.status = PickupOrderStatus.PENDING;
    order.stripeSessionId = stripeSessionId;
    await order.save();

    this.logger.log(`Payment confirmed — order ready for admin: ${orderId}`);

    // Notify admin now that payment is confirmed
    this.notificationsGateway.notifyPickupOrder(order);
    await this.notifyAdminsExpo(order);
  }

  async getOrderPaymentStatus(
    orderId: string,
  ): Promise<{ paid: boolean; status: string }> {
    const order = await this.orderModel
      .findById(orderId)
      .select('paymentStatus status')
      .lean();
    if (!order) return { paid: false, status: 'not_found' };
    return {
      paid: order.paymentStatus === PickupOrderPaymentStatus.COMPLETED,
      status: order.paymentStatus,
    };
  }

  async getOrders(
    status?: PickupOrderStatus,
    page = 1,
    limit = 50,
  ): Promise<{
    data: PickupOrder[];
    total: number;
    pages: number;
    page: number;
  }> {
    const filter = status ? { status } : {};
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const skip = (safePage - 1) * safeLimit;

    const [data, total] = await Promise.all([
      this.orderModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean()
        .exec(),
      this.orderModel.countDocuments(filter),
    ]);

    return { data, total, pages: Math.ceil(total / safeLimit), page: safePage };
  }

  private static readonly VALID_TRANSITIONS: Partial<
    Record<PickupOrderStatus, PickupOrderStatus[]>
  > = {
    [PickupOrderStatus.PENDING]: [
      PickupOrderStatus.CONFIRMED,
      PickupOrderStatus.CANCELLED,
    ],
    [PickupOrderStatus.CONFIRMED]: [
      PickupOrderStatus.READY,
      PickupOrderStatus.CANCELLED,
    ],
    [PickupOrderStatus.READY]: [PickupOrderStatus.COMPLETED],
    [PickupOrderStatus.COMPLETED]: [],
    [PickupOrderStatus.CANCELLED]: [],
  };

  async updateOrderStatus(
    id: string,
    newStatus: PickupOrderStatus,
  ): Promise<PickupOrder> {
    const order = await this.orderModel.findById(id);
    if (!order) throw new BadRequestException('Order not found');

    const allowed = OrdersService.VALID_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition order from '${order.status}' to '${newStatus}'`,
      );
    }

    order.status = newStatus;
    return order.save();
  }

  private async notifyAdminsExpo(order: PickupOrder): Promise<void> {
    try {
      const tokens = await this.usersService.findAdminDeviceTokens();

      if (!tokens?.length) return;

      const itemSummary = order.items
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

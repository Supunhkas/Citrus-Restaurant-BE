import {
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
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
    private readonly configService: ConfigService,
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
        // EventBusService is a plain EventEmitter — an unawaited rejection here
        // becomes an unhandled promise rejection (process-fatal by default) and,
        // since the webhook controller has already responded 200 to Stripe,
        // would otherwise silently drop a confirmed payment with no retry.
        this.handlePaymentSuccess(orderId, stripeSessionId, amountTotal).catch(
          (error) => {
            this.logger.error(
              `Unhandled error processing payment success for order ${orderId}`,
              error instanceof Error ? error.stack : String(error),
            );
          },
        );
      },
    );

    this.eventBusService.on(
      'order.payment.failed',
      ({ orderId }: { orderId: string }) => {
        this.markPaymentFailed(orderId).catch((error) => {
          this.logger.error(
            `Unhandled error marking payment failed for order ${orderId}`,
            error instanceof Error ? error.stack : String(error),
          );
        });
      },
    );
  }

  // Called when a Stripe checkout session expires or its payment fails
  // outright, so an abandoned order doesn't sit in PAYMENT_PENDING forever
  // with no way for an admin to clear it from the queue.
  async markPaymentFailed(orderId: string): Promise<void> {
    const updated = await this.orderModel.findOneAndUpdate(
      {
        _id: orderId,
        paymentStatus: { $ne: PickupOrderPaymentStatus.COMPLETED },
      },
      {
        $set: {
          paymentStatus: PickupOrderPaymentStatus.FAILED,
          status: PickupOrderStatus.CANCELLED,
        },
      },
      { new: true },
    );
    if (updated) {
      this.logger.log(
        `Order ${orderId} marked FAILED/CANCELLED — checkout session expired or payment failed`,
      );
    }
  }

  async createPickupOrder(
    dto: CreatePickupOrderDto,
  ): Promise<
    { paymentRequired: boolean; stripeSessionUrl?: string } & Record<
      string,
      unknown
    >
  > {
    // Payment is mandatory — reject before doing any price verification or
    // writing an order to the database if Stripe is not configured.
    if (!this.paymentsService.isInitialized) {
      throw new ServiceUnavailableException(
        'Online payment is currently unavailable. Please try again later.',
      );
    }

    // Re-fetch menu prices server-side to prevent client-supplied price manipulation
    const TAX_RATE =
      this.configService.get<number>('orders.taxRate') ?? 0.1;
    let verifiedSubtotal = 0;

    const verifiedItems = await Promise.all(
      dto.items.map(async (item) => {
        let menuItem: Awaited<
          ReturnType<typeof this.menuService.getMenuItemById>
        >;
        try {
          menuItem = await this.menuService.getMenuItemById(item.menuItemId);
        } catch (err) {
          if (err instanceof NotFoundException) {
            throw new BadRequestException(
              `Menu item not found: ${item.menuItemId}`,
            );
          }
          throw err;
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

    verifiedSubtotal = Math.round(verifiedSubtotal * 100) / 100;
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

    // Amount verification: Stripe uses cents
    const expectedCents = Math.round(order.total * 100);
    if (amountTotal !== expectedCents) {
      this.logger.error(
        `Payment amount mismatch for order ${orderId}: expected ${expectedCents} cents, got ${amountTotal} cents — marking FAILED for manual review`,
      );
      // Mark it visibly wrong instead of leaving it silently PENDING forever
      // — the controller has already returned 200 to Stripe by this point,
      // so nothing else will surface this order again on its own.
      await this.orderModel.updateOne(
        {
          _id: orderId,
          paymentStatus: { $ne: PickupOrderPaymentStatus.COMPLETED },
        },
        { $set: { paymentStatus: PickupOrderPaymentStatus.FAILED } },
      );
      return;
    }

    // Idempotency + concurrency safety in one step. Stripe delivers webhooks
    // at-least-once, so two deliveries for the same session can race here;
    // a plain findById + save (read-then-write) lets both readers see
    // paymentStatus still PENDING and both proceed, double-firing admin
    // notifications. Guarding the update itself on paymentStatus not already
    // COMPLETED means only the first delivery actually applies.
    const updated = await this.orderModel.findOneAndUpdate(
      {
        _id: orderId,
        paymentStatus: { $ne: PickupOrderPaymentStatus.COMPLETED },
      },
      {
        $set: {
          paymentStatus: PickupOrderPaymentStatus.COMPLETED,
          status: PickupOrderStatus.PENDING,
          stripeSessionId,
        },
      },
      { new: true },
    );

    if (!updated) {
      this.logger.warn(
        `Duplicate webhook for order ${orderId} (session ${stripeSessionId}) — already processed`,
      );
      return;
    }

    this.logger.log(`Payment confirmed — order ready for admin: ${orderId}`);

    // Notify admin now that payment is confirmed
    this.notificationsGateway.notifyPickupOrder(updated);
    await this.notifyAdminsExpo(updated);
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
    // parseInt on a non-numeric query param (e.g. ?page=abc) yields NaN, and
    // Math.max/Math.min propagate NaN rather than clamping it — passing NaN
    // to Mongo's skip()/limit() then throws at the driver level instead of
    // falling back to a sane default.
    const safePage = Number.isFinite(page) ? Math.max(1, page) : 1;
    const safeLimit = Number.isFinite(limit)
      ? Math.min(Math.max(1, limit), 100)
      : 50;
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
    // Without this, an order stuck in PAYMENT_PENDING (an abandoned or
    // failed Stripe checkout) could never be moved anywhere — including
    // CANCELLED — leaving admins with no way to clear it from the queue.
    [PickupOrderStatus.PAYMENT_PENDING]: [PickupOrderStatus.CANCELLED],
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

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreatePickupOrderDto } from './dto/create-pickup-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { PickupOrderStatus } from '../../schema/order/pickup-order.schema';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

// ── Public ────────────────────────────────────────────────────────────────────

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // POST /orders/pickup — customer places a pickup order
  @Public()
  @Post('pickup')
  @HttpCode(HttpStatus.CREATED)
  createPickupOrder(@Body() dto: CreatePickupOrderDto) {
    return this.ordersService.createPickupOrder(dto);
  }

  // GET /orders/payment-status/:orderId — public, used by the payment success page to verify
  @Public()
  @Get('payment-status/:orderId')
  getPaymentStatus(@Param('orderId') orderId: string) {
    return this.ordersService.getOrderPaymentStatus(orderId);
  }
}

// ── Admin ─────────────────────────────────────────────────────────────────────

@Controller('orders/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class OrdersAdminController {
  constructor(private readonly ordersService: OrdersService) {}

  // GET /orders/admin?status=pending&page=1&limit=50
  @Get()
  getOrders(
    @Query('status') status?: PickupOrderStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ordersService.getOrders(
      status,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  // PATCH /orders/admin/:id/status
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateOrderStatus(id, dto.status);
  }
}

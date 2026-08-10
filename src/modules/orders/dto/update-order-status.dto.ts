import { IsEnum } from 'class-validator';
import { PickupOrderStatus } from '../../../schema/order/pickup-order.schema';

export class UpdateOrderStatusDto {
  @IsEnum(PickupOrderStatus)
  status: PickupOrderStatus;
}

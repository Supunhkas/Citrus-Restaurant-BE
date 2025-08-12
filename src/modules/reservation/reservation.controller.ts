import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ReservationService } from './reservation.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ConfirmReservationDto } from './dto/confirm-reservation.dto';
import { ResendConfirmationDto } from './dto/resend-confirmation.dto';
import { ReservationStatus } from '../../schema/reservation/reservation.schema';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('reservations')
export class ReservationController {
  constructor(private readonly reservationService: ReservationService) {}

  @Public()
  @Post('create')
  async createReservation(@Body() dto: CreateReservationDto) {
    console.log(dto);
    return this.reservationService.createReservation(dto);
  }

  @Public()
  @Post('confirm')
  async confirmReservation(@Body() dto: ConfirmReservationDto) {
    return this.reservationService.confirmReservation(dto.confirmationCode);
  }

  // List reservations; admins see all, users only their own
  @UseGuards(JwtAuthGuard)
  @Get('list')
  async getReservations(
    @Req() req,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('tableNumber') tableNumber?: string,
    @Query('name') name?: string,
  ) {
    const userId = req.user?.role === 'admin' ? undefined : req.user?._id;
    const statusEnum = status as ReservationStatus;
    return this.reservationService.getReservations(
      userId,
      statusEnum,
      startDate,
      endDate,
      tableNumber ? Number(tableNumber) : undefined,
      name,
    );
  }

  // Approve reservation (admin only)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Patch(':id/approve')
  async approveReservation(@Param('id') id: string) {
    return this.reservationService.approveReservation(id);
  }

  // Reject reservation (admin only)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Patch(':id/reject')
  async rejectReservation(@Param('id') id: string) {
    return this.reservationService.rejectReservation(id);
  }

  // Resend confirmation code
  @Post('resend-confirmation')
  async resendConfirmation(@Body() dto: ResendConfirmationDto) {
    return this.reservationService.resendConfirmation(
      dto.contactNumber || dto.email,
    );
  }
}

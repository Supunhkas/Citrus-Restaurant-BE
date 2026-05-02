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
  Put,
  Logger,
} from '@nestjs/common';
import { ReservationService } from './reservation.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ConfirmReservationDto } from './dto/confirm-reservation.dto';
import { ResendConfirmationDto } from './dto/resend-confirmation.dto';
import { ReservationStatus } from '../../schema/reservation/reservation.schema';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ActionTypeReservationDto } from './dto/actionDto';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('reservations')
export class ReservationController {
  private readonly logger = new Logger(ReservationController.name);
  constructor(private readonly reservationService: ReservationService) {}

  @Public()
  @Post('create')
  async createReservation(@Body() dto: CreateReservationDto) {
    return this.reservationService.createReservation(dto);
  }

  @Public()
  @Post('confirm')
  async confirmReservation(@Body() dto: ConfirmReservationDto) {
    return this.reservationService.confirmReservation(dto.confirmationCode);
  }

  @Public()
  @Post('resend-confirmation')
  async resendConfirmation(@Body() dto: ResendConfirmationDto) {
    return this.reservationService.resendConfirmation(
      dto.contactNumber || dto.email,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('list')
  async getReservations(
    @Req() req,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
  ) {
    const userId = req.user?.role === 'admin' ? undefined : req.user?._id;
    const statusEnum = status as ReservationStatus;
    return this.reservationService.getReservations(
      userId,
      statusEnum,
      startDate,
      endDate,
      search,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Patch(':id')
  async approveReservation(@Param('id') id: string) {
    return this.reservationService.approveReservation(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Put(':id/reject')
  async rejectReservation(
    @Param('id') id: string,
    @Body() dto: ActionTypeReservationDto,
  ) {
    this.logger.log(`Rejecting reservation ${id} with reason: ${dto.reason}`);
    return this.reservationService.rejectReservation(id, dto);
  }
}

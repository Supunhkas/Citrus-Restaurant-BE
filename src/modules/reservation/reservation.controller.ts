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
import { OptionalJwtAuthGuard } from 'src/common/guards/optional-jwt-auth.guard';
import { Types } from 'mongoose';

@Controller('reservations')
export class ReservationController {
  private readonly logger = new Logger(ReservationController.name);
  constructor(private readonly reservationService: ReservationService) {}

  // Public — guest checkout doesn't require an account. OptionalJwtAuthGuard
  // still captures req.user when a valid token IS present, so a logged-in
  // caller's reservation gets tied to their account for "my reservations".
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Post('create')
  async createReservation(
    @Body() dto: CreateReservationDto,
    @Req() req: any,
  ) {
    return this.reservationService.createReservation(dto, req.user?.id);
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
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    // req.user is AuthenticatedUser ({ id, email, role, name }) — it has no
    // `_id` property. Reading `.role === 'admin' ? undefined : req.user?._id`
    // was always undefined for every caller, so the intended non-admin
    // filter below silently never applied: any authenticated user — not
    // just admins — could see every other customer's reservations.
    const rawUserId = req.user?.role === 'admin' ? undefined : req.user?.id;
    const userId = rawUserId ? new Types.ObjectId(rawUserId) : undefined;
    const statusEnum = status as ReservationStatus;
    return this.reservationService.getReservations(
      userId,
      statusEnum,
      startDate,
      endDate,
      search,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
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

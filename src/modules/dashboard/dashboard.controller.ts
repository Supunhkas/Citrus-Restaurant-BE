import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('dashboard')
@UseGuards(RolesGuard)
@Roles('admin')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('kpi-data')
  async getKpiData() {
    return this.dashboardService.getKpiData();
  }

  @Get('today-reservations')
  async getTodayReservations() {
    return this.dashboardService.getTodayReservations();
  }

  @Get('weekly-stats')
  async getWeeklyStats() {
    return this.dashboardService.weeklyStats();
  }
}

import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Public()
  @Get('kpi-data')
  async getKpiData() {
    return await this.dashboardService.getKpiData();
  }

  @Get('today-reservations')
  async getTodayReservations() {
    return await this.dashboardService.getTodayReservations();
  }

  @Get('weekly-stats')
  async getWeeklyStats() {
    return await this.dashboardService.weeklyStats();
  }
}

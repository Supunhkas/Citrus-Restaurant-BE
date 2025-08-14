import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('kpi-data')
  async getKpiData() {
    return await this.dashboardService.getKpiData();
  }

  @Get('today-stats')
  async getTodayStats() {
    return await this.dashboardService.getTodayStats();
  }
}
